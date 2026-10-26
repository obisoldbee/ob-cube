/**
 * wiring/index.ts —— 装配层：会话 ↔ 界面 ↔ 渲染 ↔ Agent。
 *
 * 这里是唯一允许同时 import ui/ render/ challenge/ agent/ 的地方。
 * 它不含规则：所有计步、判定、观察权限都在 challenge/，这里只做投影与调用。
 */

import { ChallengeSession } from '../challenge';
import { mountCubeAgent } from '../agent';
import {
  createSolvedState,
  describeMove,
  FACE_GEOMETRY,
  getSlotTable,
  parseMove,
  slotKey,
  toStateView,
  applyMove as engineApplyMove,
} from '../engine';
import type { CubeState, MoveSpec } from '../engine';
import { createCubeStage } from '../render';
import type { CubeStage } from '../render';
import {
  history,
  isLegalMoveLimit,
  isLegalSeedText,
  isLegalTimeLimitSec,
  isObservationMode,
  settings,
} from '../services';
import { namespaced } from '../services/storage';
import type { ChallengeConfig } from '../services';
import { presetById, presetOptions } from '../puzzle/presets';
import { Workspace } from '../ui/shell';
import type { UiPorts } from '../ui/shell';
import { formatClockTime, formatElapsed, formatSize } from '../ui/format';
import type { HistoryView } from '../ui/view-model';
import { layersOf } from '../ui/keymap';
import type { TurnIntent } from '../ui/keymap';
import type { ViewStep } from '../ui/keyboard';
import type { AgentView, ChallengeView, ConfigView, LogRow, ObservationView, ResultView } from '../ui/view-model';
import type { ChallengeStatus, CubeSize, FaceId, ObservationMode, ViewState } from '../contracts';
import { isCubeError, isEnded } from '../contracts';

/** 运行期配置：settings.challenge + 阶数 + URL 覆盖合并后的单一事实 */
interface RunConfig {
  size: CubeSize;
  timeLimitMs: number | null;
  moveLimit: number | null;
  dustMode: boolean;
  observationMode: ObservationMode;
  participant: 'human' | 'agent';
  puzzleSource: ChallengeConfig['puzzleSource'];
  seedText: string;
  presetId: string | null;
  /** 显式 seed（URL ?seed= 优先于面板输入） */
  urlSeed?: string;
}

function readUrlOverrides(): Partial<RunConfig> & { autostart?: boolean } {
  const params = new URLSearchParams(window.location.search);
  const out: Partial<RunConfig> & { autostart?: boolean } = {};
  const sizeRaw = Number(params.get('size') ?? '');
  if (sizeRaw === 2 || sizeRaw === 4 || sizeRaw === 3) out.size = sizeRaw;
  // URL 是旁路，必须与配置面板共用同一套边界校验（PRD §2.2）：
  // 非法值一律忽略，而不是把超长 seed 之类的输入带进会话层导致首屏异常。
  const time = Number(params.get('time') ?? '');
  if (Number.isInteger(time) && isLegalTimeLimitSec(time)) out.timeLimitMs = time * 1000;
  else if (params.get('time') === '0') out.timeLimitMs = null;
  const moves = Number(params.get('moves') ?? '');
  if (Number.isInteger(moves) && isLegalMoveLimit(moves)) out.moveLimit = moves;
  else if (params.get('moves') === '0') out.moveLimit = null;
  const seed = params.get('seed')?.trim() ?? '';
  if (isLegalSeedText(seed)) out.urlSeed = seed;
  // F14：观察模式可由 URL 旁路指定（?observe=three_faces 等），非法值忽略。
  const observe = params.get('observe');
  if (isObservationMode(observe)) out.observationMode = observe;
  if (params.get('autostart') === '1') out.autostart = true;
  return out;
}

function initialConfig(): RunConfig & { autostart: boolean } {
  const stored = settings.get();
  const url = readUrlOverrides();
  const size = url.size ?? stored.cubeSize;
  const config: RunConfig & { autostart: boolean } = {
    size,
    timeLimitMs: url.timeLimitMs !== undefined ? url.timeLimitMs : stored.challenge.timeLimitSec === null ? null : stored.challenge.timeLimitSec * 1000,
    moveLimit: url.moveLimit !== undefined ? url.moveLimit : stored.challenge.moveLimit,
    dustMode: stored.challenge.dustMode,
    observationMode: url.observationMode ?? stored.challenge.observationMode,
    participant: stored.challenge.participant,
    puzzleSource: url.urlSeed !== undefined ? 'seed' : stored.challenge.puzzleSource,
    seedText: url.urlSeed ?? stored.challenge.seedText,
    presetId: stored.challenge.presetId,
    urlSeed: url.urlSeed,
    autostart: url.autostart === true,
  };
  // 持久化配置可能停在「题库 + 未选条目」的中间态：补成首条，
  // 避免界面显示第一项、实际却生成随机题面。
  if (config.puzzleSource === 'preset' && config.presetId === null) {
    config.presetId = presetOptions()[0]?.id ?? null;
  }
  return config;
}

export function bootstrap(host: HTMLElement): void {
  const options = initialConfig();
  const config: RunConfig = options;

  /** 依据当前配置应使用的 seed：题库/显式 seed 优先，否则留空（高熵随机） */
  function resolveSeed(keepSeedOf?: ChallengeSession): string | number | undefined {
    if (config.urlSeed !== undefined) return config.urlSeed;
    if (config.puzzleSource === 'seed') return config.seedText || undefined;
    if (config.puzzleSource === 'preset') return presetById(config.presetId)?.seed;
    // 随机来源但只是改时限/步数/蒙尘：保住当前题面，不要"改个时限题就变了"
    return keepSeedOf?.record.seed_text ?? undefined;
  }

  function createSession(keepSeedOf?: ChallengeSession): ChallengeSession {
    const preset = config.puzzleSource === 'preset' ? presetById(config.presetId) : null;
    if (preset && preset.size !== config.size) config.size = preset.size;
    return new ChallengeSession({
      size: config.size,
      seed: resolveSeed(keepSeedOf),
      timeLimitMs: config.timeLimitMs,
      moveLimit: config.moveLimit,
      observationMode: config.observationMode,
      dustMode: config.dustMode,
    });
  }

  let session = createSession();

  // 赋值延迟到「启动」段：ports 的方法只在运行期被调用，那时两者一定已就绪。
  let workspace!: Workspace;
  let stage: CubeStage | null = null;

  let current: { spec: MoveSpec; quarters: number } | null = null;
  let replayTimer: number | null = null;
  /** 回放中的累积局面：从已还原态重放 scramble+moves，避免用终局作为起点。 */
  let replayState: CubeState | null = null;
  let lastTimerPaint = 0;
  /** 上一次 sync() 落到 UI 的状态。状态翻转可能发生在只读 API（getProgress/observe
   * 的内部 tick）里——那种翻转在 tickAndSync 的 before/after 快照里永远不可见，
   * 若只比前后值，UI 会一直停留在旧状态直到用户下一次操作（AC-28 明令禁止）。 */
  let lastSyncedStatus: ChallengeStatus | null = null;

  // ------------------------------------------------------------- 渲染接线

  function attachResolver(): void {
    if (!stage) return;
    const size = session.size;
    const table = getSlotTable(size);
    const m = size - 1;
    stage.view.setSlotResolver((lattice, face) => {
      const position: [number, number, number] = [
        2 * lattice[0] - m,
        2 * lattice[1] - m,
        2 * lattice[2] - m,
      ];
      const slot = table.lookup.get(slotKey(position, FACE_GEOMETRY[face].normal));
      if (slot === undefined) throw new Error(`slot 未命中：${lattice.join(',')} / ${face}`);
      return slot;
    });
  }

  /** 未完成的动画先落位，保证「状态先行、视觉随后」不会错位。 */
  function flushAnimation(): void {
    if (!current || !stage) return;
    stage.view.advance(current.spec.axis, current.spec.layerSet, current.quarters);
    stage.animator.finish();
    current = null;
    // 回放期间按「回放到的那一步」上色，而不是会话终局——否则中间态贴纸颜色是错的。
    stage.view.applyFacelets(replayState ? toStateView(replayState) : session.stateView);
  }

  function animate(spec: MoveSpec): void {
    if (!stage) return;
    flushAnimation();
    const quarters = spec.quarterTurns === 3 ? -1 : spec.quarterTurns;
    const parts = stage.view.registersAt(spec.axis, spec.layerSet);
    current = { spec, quarters };
    stage.animator.begin({ axis: spec.axis, quarters, durationMs: 170 }, parts, performance.now());
  }

  function repaint(): void {
    if (!stage) return;
    // 蒙尘=开：ready 态遮蔽；蒙尘=关：ready 态直接显示题面（预观察）。
    // 暂停期间同样遮蔽（PRD §7.2.1 P7'：暂停不能当"无限观察"用）。
    const status = session.status;
    const showDust =
      (status === 'ready' && session.dustMode) || status === 'paused';
    stage.setDust(showDust);
    stage.view.applyFacelets(session.stateView);
  }

  /** 回放进行中时先停掉，避免旧 interval 把新会话的局面搅乱 */
  function stopReplay(): void {
    if (replayTimer !== null) {
      window.clearInterval(replayTimer);
      replayTimer = null;
    }
    replayState = null;
  }

  /** 换会话（换题/换配置/换阶数）的统一路径 */
  function swapSession(next: ChallengeSession): void {
    flushAnimation();
    stopReplay();
    session = next;
    mountCubeAgent(session, onApiMutate);
    stage?.setSize(session.size);
    attachResolver();
    stage?.rig.applyView({ up: 'U', front: 'F' }, { animate: false });
    repaint();
    sync();
  }

  // ------------------------------------------------------------- 视图投影

  function challengeView(): ChallengeView {
    return {
      size: session.size,
      challengeId: session.rules.challenge_id,
      status: session.status,
      elapsedMs: session.elapsedMs(),
      remainingMs: session.remainingMs(),
      timeLimitMs: session.timeLimitMs,
      moveCount: session.moveCount,
      moveLimit: session.moveLimit,
      tps: session.tps(),
      solvedPending: session.status === 'solved_pending',
      attemptsLeft: session.attempts,
      firstMoveMs: session.eventLog.find((e) => e.type === 'move')?.at_ms ?? null,
      observationMode: session.observationMode,
      dustMode: session.dustMode,
      participant: config.participant,
      scrambleMethod: 'random_moves',
      seed: session.rules.seed,
      difficultyScore: null,
      difficultyLabel: null,
    };
  }

  function configView(): ConfigView {
    const editable = session.status === 'ready' || isEnded(session.status);
    return {
      canEdit: editable,
      timeLimitSec: config.timeLimitMs === null ? null : Math.round(config.timeLimitMs / 1000),
      moveLimit: config.moveLimit,
      dustMode: config.dustMode,
      participant: config.participant,
      puzzleSource: config.puzzleSource,
      seedText: config.seedText,
      presetId: config.presetId,
      observationMode: config.observationMode,
      presets: presetOptions(),
      validation: null,
    };
  }

  function observationView(): ObservationView {
    if (session.status === 'ready' || session.status === 'idle') {
      return { faceColors: {}, locked: true, lockReason: 'not-started', observationId: null, visibleFaces: [] };
    }
    // P7'（PRD §7.2.1）：暂停屏蔽观察——3D 已遮蔽，右栏数据面板不能成为
    // 「暂停慢慢看题面」的旁路，否则遮罩形同虚设。API 侧 observe() 同样返回 PAUSED。
    if (session.status === 'paused') {
      return { faceColors: {}, locked: true, lockReason: 'paused', observationId: null, visibleFaces: [] };
    }
    const obs = session.peekObservation();
    return {
      faceColors: obs.face_colors,
      locked: false,
      lockReason: null,
      observationId: obs.observation_id,
      visibleFaces: obs.visible_faces,
    };
  }

  function agentView(): AgentView {
    const stats = session.agentStats;
    const active = stats.calls > 0;
    return {
      state: active ? (isEnded(session.status) ? 'idle' : 'busy') : 'idle',
      statusText: active ? `已发起 ${stats.calls} 次调用` : '尚未检测到 Agent 调用',
      callCount: active ? stats.calls : null,
      observeCount: active ? stats.observes : null,
      moveCount: active ? stats.moves : null,
      avgStepMs: null,
      lastHeartbeat: null,
      lastObservationId: session.getLastObservation()?.observation_id ?? null,
      progressActive: session.status === 'running',
    };
  }

  function resultView(): ResultView {
    const result = session.getChallengeResult();
    return {
      status: result.status,
      interrupted: result.status === 'ended_interrupted',
      solved: result.solved,
      moveCount: result.move_count,
      elapsedMs: result.elapsed_ms,
      tps: result.tps,
      firstMoveMs: result.events.find((e) => e.type === 'move')?.at_ms ?? null,
      mismatchStickers: session.lastSubmitResult?.mismatch?.sticker_count_wrong ?? null,
      fingerprint: result.initial_fingerprint,
      events: result.events,
      attemptsLeft: session.attempts,
      participant: config.participant,
      rules: {
        cubeSize: result.rules.cube_size,
        challengeId: result.rules.challenge_id,
        seed: result.rules.seed,
        scrambleMethod: 'random_moves',
        observationMode: result.rules.observation_mode,
        dustMode: result.rules.dust_mode,
        timeLimitMs: result.rules.time_limit_ms,
        moveLimit: result.rules.move_limit,
      },
      startedAt: result.rules.created_at,
      engineVersion: `${result.engine_version} / ${result.rules.notation_version}`,
      submit: session.lastSubmitResult,
      compareElapsedMs: null,
      pauseCount: result.pause_count,
      pausedTotalMs: result.paused_total_ms,
      // 记录里已落盘的口径直接投影，避免结果页与会话层各算一遍（同源）。
      metrics: {
        htm: result.move_count,
        htmLayer: result.htm_layer_count,
        qtm: result.qtm_count,
      },
    };
  }

  let savedRunId: string | null = null;
  /** AC-46 / PRD 步骤 5：挑战结束即写入 localStorage 历史，每次运行只写一次。 */
  function persistRunOnce(): void {
    const runId = session.rules.run_id;
    if (savedRunId === runId) return;
    savedRunId = runId;
    if (!history.canPersist) return;
    try {
      history.save(session.getChallengeResult());
      refreshHistory();
    } catch {
      workspace.toast('历史保存失败，本地存储可能已满（可导出 JSON 留存）');
    }
  }

  /** F11：历史摘要投影。损坏记录也照实显示（§9.3：不静默丢弃）。 */
  function refreshHistory(): void {
    let view: HistoryView;
    try {
      const snapshot = history.list();
      view = {
        rows: snapshot.records.map((record) => ({
          runId: record.id,
          resultLabel: resultLabelOf(record.result.status),
          solved: record.result.solved,
          sizeText: formatSize(record.result.rules.cube_size),
          moveText: `${record.result.move_count} 步`,
          elapsedText: formatElapsed(record.result.elapsed_ms),
          savedAtText: formatClockTime(record.savedAt),
        })),
        corrupt: snapshot.corrupt.map((entry) => ({ id: entry.id })),
        canPersist: snapshot.canPersist,
      };
    } catch {
      view = { rows: [], corrupt: [], canPersist: false };
    }
    workspace.updateHistory(view);
  }

  function resultLabelOf(status: string): string {
    if (status === 'ended_solved') return '已还原';
    if (status === 'ended_timeout') return '超时';
    if (status === 'ended_move_limit') return '步数耗尽';
    if (status === 'ended_abandoned') return '已放弃';
    if (status === 'ended_invalid') return '提交无效';
    if (status === 'ended_interrupted') return '未完成';
    return status;
  }

  function sync(): void {
    session.tick();
    lastSyncedStatus = session.status;
    const status = session.status;
    // §5.2 三级（B12）：首次进入 running 的一次性引导。挂在 sync 而不是
    // tickAndSync——状态迁移发生在 guard() 内的 session.start()，等 rAF 的
    // tickAndSync 再看已经检测不到迁移了。
    if (status === 'running' && config.participant === 'human') maybeShowFirstRunHint();
    else if (status !== 'running') workspace.hideFirstRunHint();
    workspace.setStagePhase(
      status === 'ready' || status === 'idle'
        ? 'ready'
        : isEnded(status)
          ? 'ended'
          : 'running',
    );
    workspace.update(challengeView());
    workspace.updateConfig(configView());
    workspace.updateObservation(observationView());
    const rows: LogRow[] = session.eventLog
      .filter((e) => e.type === 'move' || e.type === 'submit')
      .map((e, index) => ({
        // 日志序号按「移动条数」编，不按事件序号——否则第一个动作会显示 #002
        seq: index + 1,
        move: e.move ?? (e.type === 'submit' ? '提交' : ''),
        elapsedMs: e.at_ms,
        ok: e.ok,
        errorCode: e.error_code,
        mergedFrom: e.merged_from,
      }));
    workspace.updateLogs(rows, rows.length);
    workspace.setAgentVisible(config.participant === 'agent');
    if (config.participant === 'agent') workspace.updateAgent(agentView());
    if (isEnded(session.status)) {
      persistRunOnce();
      workspace.showResult(resultView());
    } else if (workspace.isResultShowing) workspace.clearResult();
  }

  function guard(fn: () => void): void {
    try {
      fn();
    } catch (error: unknown) {
      workspace.toast(isCubeError(error) ? `${error.message}（${error.code}）` : '操作失败');
    }
    sync();
  }

  // ------------------------------------------------------------- 端口实现

  function faceViewState(face: FaceId): ViewState {
    if (face === 'U') return { up: 'B', front: 'U' };
    if (face === 'D') return { up: 'F', front: 'D' };
    return { up: 'U', front: face };
  }

  function applyView(view: ViewState): void {
    session.rotateView(view);
    stage?.rig.applyView(view, { animate: true });
  }

  function persistConfig(): void {
    settings.patch({
      cubeSize: config.size,
      challenge: {
        timeLimitSec: config.timeLimitMs === null ? null : Math.round(config.timeLimitMs / 1000),
        moveLimit: config.moveLimit,
        dustMode: config.dustMode,
        participant: config.participant,
        puzzleSource: config.puzzleSource,
        seedText: config.seedText,
        presetId: config.presetId,
        observationMode: config.observationMode,
      },
    });
  }

  const ports: UiPorts = {
    startChallenge() {
      guard(() => {
        if (replayTimer !== null) return;
        session.start();
        repaint();
      });
    },
    pauseChallenge() {
      guard(() => {
        // P4'（PRD §7.2.1）：暂停仅人类模式可用。按钮层已不渲染（AC-58），
        // 这里是双保险——Agent 模式下任何路径都不允许把挑战置为 paused。
        if (config.participant === 'agent') {
          workspace.toast('Agent 模式不支持暂停，暂停仅人类挑战可用');
          return;
        }
        session.pause();
        repaint();
      });
    },
    resumeChallenge() {
      guard(() => {
        session.resume();
        repaint();
      });
    },
    submitSolution() {
      guard(() => session.submitSolution());
    },
    abandonChallenge() {
      guard(() => session.abandon());
    },
    endChallenge() {
      guard(() => session.abandon('用户结束挑战'));
    },
    changeSize(size) {
      config.size = size;
      // 预设题锚定阶数：换阶后原预设不再匹配，回落到随机
      const preset = presetById(config.presetId);
      if (config.puzzleSource === 'preset' && preset && preset.size !== size) {
        config.puzzleSource = 'random';
      }
      persistConfig();
      swapSession(createSession());
    },
    scramble() {
      swapSession(new ChallengeSession({
        size: config.size,
        timeLimitMs: config.timeLimitMs,
        moveLimit: config.moveLimit,
        observationMode: config.observationMode,
        dustMode: config.dustMode,
      }));
      workspace.toast('已生成新题面，点「开始挑战」计时');
    },
    resetCube() {
      flushAnimation();
      stopReplay();
      session.resetRun();
      // resetRun 会把会话视角复位，3D 相机必须同一帧跟上，否则观察面板与画面朝向不一致。
      stage?.rig.applyView({ up: 'U', front: 'F' }, { animate: false });
      repaint();
      sync();
      workspace.toast('已回到本题初始状态，计时与计步已清零');
    },
    applyTurn(intent: TurnIntent, merged: boolean) {
      guard(() => {
        const layers = layersOf(intent.layers, session.size);
        const notation = describeMove({ size: session.size, face: intent.face, layers, amount: intent.amount });
        const spec = parseMove(notation, session.size);
        // PRD §13.4：自由层与矩阵按钮都归 button，只有键盘是 keyboard。
        const channel = intent.source === 'keyboard' ? 'keyboard' : 'button';
        session.applyIntent(intent.face, layers, intent.amount, merged, channel);
        animate(spec);
        markFirstMoveDone();
      });
    },
    viewStep(step: ViewStep) {
      guard(() => {
        const next = session.stepView(step);
        stage?.rig.applyView(next, { animate: true });
      });
    },
    viewReset() {
      guard(() => applyView({ up: 'U', front: 'F' }));
    },
    faceView(face) {
      guard(() => applyView(faceViewState(face)));
    },
    replay() {
      if (replayTimer !== null || !stage) return;
      flushAnimation();
      const moves = session.eventLog.filter((e) => e.type === 'move' && e.move !== null);
      if (moves.length === 0) {
        workspace.toast('本次还没有可回放的转动');
        return;
      }
      const sequence = [...session.record.scramble, ...moves.map((e) => e.move as string)];
      // 回放必须从「已还原」起步重放，而不是从当前终局起步：只有终局恰好还原时，
      // 后者才碰巧等价。超时/放弃/步数耗尽/中断的回放同样要看到真实的题面与过程。
      replayState = createSolvedState(session.size);
      stage.setDust(false);
      stage.view.applyFacelets(toStateView(replayState));
      let cursor = 0;
      workspace.toast(`回放开始，共 ${moves.length} 步`);
      replayTimer = window.setInterval(() => {
        if (cursor >= sequence.length || !stage) {
          // 先落位最后一步并用回放终局上色，再恢复会话当前局面。
          flushAnimation();
          stopReplay();
          repaint();
          workspace.toast('回放结束，已恢复当前局面');
          return;
        }
        // 先完成上一步（此时上色仍是上一步的状态），再推进到下一步并动画。
        flushAnimation();
        const notation = sequence[cursor] as string;
        const spec = parseMove(notation, session.size);
        if (replayState !== null) replayState = engineApplyMove(replayState, spec);
        animate(spec);
        cursor += 1;
      }, 260);
    },
    rerun() {
      // 同题面重跑：回到 ready，由玩家显式按下开始（v1.9：不自动起表）
      flushAnimation();
      stopReplay();
      session.resetRun();
      stage?.rig.applyView({ up: 'U', front: 'F' }, { animate: false });
      repaint();
      sync();
      workspace.toast('已重置本题，点「开始挑战」起表');
    },
    retryNew() {
      // 再挑战一次：保留配置，生成新题面，回到 ready（v1.9）。
      // 注意不能走 resolveSeed()：seed 来源（URL ?seed= / 面板 seed / 题库预设）
      // 锚定的都是同一道题，复用会让本按钮退化成第二个「同题面重跑」。
      // 同一题面请用 rerun()；这里强制交给会话层做高熵随机。
      const next = new ChallengeSession({
        size: config.size,
        timeLimitMs: config.timeLimitMs,
        moveLimit: config.moveLimit,
        observationMode: config.observationMode,
        dustMode: config.dustMode,
      });
      swapSession(next);
      workspace.toast('已生成新题面，点「开始挑战」起表');
    },
    updateConfig(patch) {
      // 配置即契约：运行中不接受变更（面板此时也是禁用态，这里是双保险）
      if (session.status === 'running' || session.status === 'paused' || session.status === 'solved_pending') {
        workspace.toast('挑战进行中，配置已锁定');
        return;
      }
      const before = { ...config };
      // 面板下发的字段名是 ChallengeConfig（timeLimitSec 秒），
      // 内部 RunConfig 用毫秒——在这里显式换算，不能直接 Object.assign。
      if (patch.timeLimitSec !== undefined) {
        config.timeLimitMs = patch.timeLimitSec === null ? null : patch.timeLimitSec * 1000;
      }
      if (patch.moveLimit !== undefined) config.moveLimit = patch.moveLimit;
      if (patch.dustMode !== undefined) config.dustMode = patch.dustMode;
      if (patch.observationMode !== undefined) config.observationMode = patch.observationMode;
      if (patch.participant !== undefined) config.participant = patch.participant;
      if (patch.puzzleSource !== undefined) {
        config.puzzleSource = patch.puzzleSource;
        // 切到「题库」但还没选条目时，默认落到第一条——否则界面显示第一项、
        // 实际却按 presetId=null 走随机 seed，属于静默不一致。
        if (patch.puzzleSource === 'preset' && patch.presetId === undefined) {
          config.presetId ??= presetOptions()[0]?.id ?? null;
        }
      }
      if (patch.seedText !== undefined) config.seedText = patch.seedText;
      if (patch.presetId !== undefined) config.presetId = patch.presetId;
      // 参与者切换只影响 Agent 面板可见性，不动题面
      const onlyParticipant =
        patch.participant !== undefined &&
        Object.keys(patch).every((k) => k === 'participant');
      if (onlyParticipant) {
        persistConfig();
        sync();
        return;
      }
      // 题库条目带自己的阶数
      if (config.puzzleSource === 'preset') {
        const preset = presetById(config.presetId);
        if (preset && preset.size !== config.size) config.size = preset.size;
      }
      persistConfig();
      if (
        config.size !== before.size ||
        config.dustMode !== before.dustMode ||
        config.observationMode !== before.observationMode ||
        config.puzzleSource !== before.puzzleSource ||
        (config.puzzleSource === 'seed' && config.seedText !== before.seedText) ||
        (config.puzzleSource === 'preset' && config.presetId !== before.presetId)
      ) {
        swapSession(createSession());
      } else {
        // 只改时限/步数：同一道题面换新规则，重置到 ready
        swapSession(createSession(session));
      }
    },
    deleteHistoryRecord(id) {
      try {
        history.remove(id);
      } catch {
        workspace.toast('删除失败，本地存储可能不可用');
      }
      refreshHistory();
    },
    exportHistoryRecord(key) {
      guard(() => {
        // key 形如 run:<id>；导出原始存储内容，不做结构校验（§9.3：供人工排查）
        const raw = window.localStorage.getItem(namespaced(key));
        if (raw === null) {
          workspace.toast('该记录已不存在');
          return;
        }
        const blob = new Blob([raw], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${key.replace(/[^a-z0-9-]/gi, '_')}.json`;
        link.click();
        URL.revokeObjectURL(url);
      });
    },
    exportJson() {
      guard(() => {
        const payload = isEnded(session.status)
          ? session.getChallengeResult()
          : { rules: session.rules, events: session.eventLog, note: '挑战尚未结束，此为过程记录' };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${session.rules.challenge_id}.json`;
        link.click();
        URL.revokeObjectURL(url);
      });
    },
    copy(text, label) {
      if (!text) {
        workspace.toast(`${label}尚不可用`);
        return;
      }
      void navigator.clipboard.writeText(text).then(
        () => workspace.toast(`${label}已复制`),
        () => workspace.toast('复制失败，请手动选择文本'),
      );
    },
  };

  // ------------------------------------------------------------- 启动

  workspace = new Workspace(ports, { settings, canPersist: history.canPersist });
  workspace.mount(host);
  stage = createCubeStage(workspace.stage.canvas);
  if (stage === null) {
    workspace.stage.showWebglUnavailable();
    return;
  }
  mountCubeAgent(session, onApiMutate);

  attachResolver();
  stage.setSize(session.size);
  repaint();
  sync();
  refreshHistory();
  if (!history.canPersist) {
    workspace.setStorageWarning('浏览器存储不可用，本次结果不会被保存。可点导出 JSON 手动留存。');
  }

  /**
   * v1.9（AC-28）：超时判定与状态同步不能只挂在 rAF 上——后台标签页的 rAF 会被
   * 浏览器暂停，而 Agent 脚本恰恰常在页面不可见时驱动 API（超时结算、结果面板、
   * 历史落盘都会跟着停）。三条通道互补：前台 rAF（每帧）、interval 兜底（后台被
   * 节流也仍会走）、API 变更回调（最强的同帧同步，见 onApiMutate）。
   */
  function tickAndSync(): boolean {
    const before = session.status;
    session.tick();
    if (session.status !== before || session.status !== lastSyncedStatus) {
      // 状态迁移无论来自键盘、按钮还是 window.cubeAgent（API 结束挑战），
      // 都同步视觉：ended 解除蒙尘、paused 恢复遮罩（PRD 步骤 5.3）。
      if (session.status === 'running') maybeShowFirstRunHint();
      repaint();
      sync();
      return true;
    }
    return false;
  }
  /** API 变更型调用（applyMove / submit / abandon / rotateView）后的同帧 UI 同步。 */
  function onApiMutate(): void {
    if (!tickAndSync()) sync();
  }

  const loop = (): void => {
    const now = performance.now();
    session.beginFrame(); // AC-44：帧边界清零 applyMove 限流计数
    if (current && !stage.animator.tick(now)) flushAnimation();
    stage.render();
    tickAndSync();
    // 计时刷新降到 10Hz：面板虽然已经做了结构化 diff，但每帧重绘仍然是浪费，
    // 而且重建 DOM 会打断正在进行的指针交互。
    if (
      (session.status === 'running' || session.status === 'paused') &&
      now - lastTimerPaint >= 100
    ) {
      lastTimerPaint = now;
      workspace.update(challengeView());
    }
    window.requestAnimationFrame(loop);
  };
  window.requestAnimationFrame(loop);
  // 后台标签页 rAF 被暂停时靠它清零（节流到 ≥1s 也足够：同步死循环在一帧
  // 窗口内就会超限，正常调用每秒远小于 60 次）
  window.setInterval(() => {
    session.beginFrame();
    tickAndSync();
  }, 250);
  window.addEventListener('resize', () => stage?.resize());

  // PRD §7.3 / §11（P0）：running/paused 中关闭或刷新页面 → 结算为 interrupted
  // 并尽力把已有事件写入 localStorage。同步执行，不等待任何异步 API。
  window.addEventListener('beforeunload', () => {
    const status = session.status;
    if (status !== 'running' && status !== 'paused') return;
    session.interrupt();
    if (!history.canPersist) return;
    try {
      history.save(session.getChallengeResult());
    } catch {
      // 配额满等异常：无处提示（页面正在卸载），记录丢失是已声明的诚实边界
    }
  });

  /**
   * UIUX §7.5：重进时若最近一条记录是 interrupted，提示「有一次未完成的运行」。
   * 只看最近一条：连续多次中断也只提示一次，避免刷屏。
   */
  function notifyInterruptedOnLoad(): void {
    if (!history.canPersist) return;
    try {
      const snapshot = history.list();
      const latest = snapshot.records[0];
      if (!latest || latest.result.status !== 'ended_interrupted') return;
      const size = latest.result.rules.cube_size;
      const minutes = Math.max(1, Math.round((Date.now() - new Date(latest.savedAt).getTime()) / 60_000));
      workspace.setInterruptedNotice(
        `有一次未完成的运行（${size}×${size} · 约 ${minutes} 分钟前），记录已保留`,
        () => workspace.focusHistory(),
      );
    } catch {
      // 历史损坏已有专属 UI（§9.3），这里不重复报错
    }
  }
  notifyInterruptedOnLoad();

  /**
   * §5.2 三级 / B12：首次进入 running 的一次性键位引导。
   * guide-seen 落 localStorage（刷新后不再出现）；首个有效转动后立即消失。
   * 存储不可用时每次进入 running 都显示——宁可多提示一次，不可永不提示。
   */
  let hintDismissed = false;
  let guideSeenCache: boolean | null = null;
  function guideSeen(): boolean {
    if (hintDismissed) return true;
    if (guideSeenCache !== null) return guideSeenCache;
    try {
      guideSeenCache = window.localStorage.getItem(namespaced('guide-seen')) === '1';
    } catch {
      guideSeenCache = false;
    }
    return guideSeenCache;
  }
  function maybeShowFirstRunHint(): void {
    if (guideSeen()) return;
    workspace.showFirstRunHint();
  }
  function markFirstMoveDone(): void {
    if (!workspace.isFirstRunHintShowing) return;
    workspace.hideFirstRunHint();
    hintDismissed = true;
    try {
      window.localStorage.setItem(namespaced('guide-seen'), '1');
    } catch {
      // 隐私模式等：跳过持久化，本次会话内不再显示
    }
  }

  if (options.autostart) {
    session.start();
    repaint();
    sync();
  }
}
