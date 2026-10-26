/**
 * session.ts —— 挑战会话：状态机 + 计时 + 观察权限 + 事件日志。
 *
 * 本层零 DOM、零 three、零 localStorage。UI 与 Agent 共用同一个实例，
 * 这是「人机同轨」的结构性保证：两边调的是同一批方法、同一份状态、同一条事件流。
 *
 * 计步三公理（PRD §7.1.1）：
 *   G1  move_count 等于已定稿的 move 事件数；
 *   G2  一条已定稿事件恒计 1 步（含归并产生的 R2）；
 *   G3  归并是输入整形，发生在定稿之前，不回退状态。
 */

import type { Clock } from './clock';
import { systemClock } from './clock';
import {
  applyMove as engineApplyMove,
  areCollinear,
  createSolvedState,
  describeMove,
  equalVec,
  evaluateSolved,
  FACE_GEOMETRY,
  fingerprintState,
  isSolved,
  moveCatalogNotations,
  negate,
  parseMove,
  protocolLayerSet,
  rightOf,
  toStateView,
} from '../engine';
import type { CubeState, MoveSpec, Vec3 } from '../engine';
import { createPuzzle, replayScramble } from '../puzzle';
import type { PuzzleRecord } from '../puzzle';
import { COLOR_OF_FACE, CubeError, ENGINE_VERSION, FACE_ORDER, isEnded } from '../contracts';
import type {
  AllowedActions,
  ChallengeResult,
  ChallengeRules,
  ChallengeStatus,
  CubeSize,
  FaceGrid,
  FaceId,
  InputChannel,
  MoveResult,
  Observation,
  ObservationMode,
  Progress,
  RunEvent,
  StickerColor,
  SubmitResult,
  ViewState,
} from '../contracts';

export interface SessionOptions {
  size: CubeSize;
  seed?: number | string;
  timeLimitMs?: number | null;
  moveLimit?: number | null;
  observationMode?: ObservationMode;
  dustMode?: boolean;
  clock?: Clock;
}

const DEFAULT_VIEW: ViewState = { up: 'U', front: 'F' };
const AXIS_CHARS = ['x', 'y', 'z'] as const;
const SUBMIT_ATTEMPTS = 3;
const RESTRICTED_OBSERVE_BUDGET = 24;
/** AC-44：applyMove 调用频次上限，PRD 口径「单帧内 > 60 次」。
 * 实现为按帧计数而非时间窗：每次 applyMove 的 UI 同步成本是 O(n)（日志重建），
 * 60 次真实调用可能跨越数百毫秒，任何时间窗都会被滑出、判据退化为恒假。
 * 计数由宿主每帧调 beginFrame() 清零（wiring 的 rAF 循环与兜底 interval）；
 * 同步死循环在一帧内必然累积超限，正常输入每帧至多一两次。 */
const RATE_LIMIT = 60;

let entropyCounter = 0;

/**
 * 熵由调用方注入（puzzle 层自己不读时钟）。Date.now() 是毫秒级时间戳，
 * 数值上远超 u32 上限，所以这里用「时间 + 单调计数」拼成字符串 seed：
 * 同一毫秒内两次生成也不会撞。
 */
function entropySeed(): string {
  entropyCounter += 1;
  return `${Date.now().toString(36)}-${entropyCounter.toString(36)}`;
}

/** 法向量 → 面。几何层只给向量运算，面语义在这里收敛，不另起一套坐标系。 */
function faceOfNormal(normal: Vec3): FaceId {
  for (const face of FACE_ORDER) {
    if (equalVec(FACE_GEOMETRY[face].normal, normal)) return face;
  }
  throw new CubeError('E_VIEW_FACE_UNKNOWN', `无法识别的法向量 ${normal.join(',')}`, '面标识只有 U R F D L B');
}

function opposite(face: FaceId): FaceId {
  return faceOfNormal(negate(FACE_GEOMETRY[face].normal));
}

export class ChallengeSession {
  private puzzle: PuzzleRecord;
  private state: CubeState;
  private initialState: CubeState;
  private statusValue: ChallengeStatus = 'ready';
  private startedAt: number | null = null;
  private endedAt: number | null = null;
  /** 真暂停（PRD §7.2.1 v1.9）：暂停段从 elapsed 里整体扣除 */
  private pausedAt: number | null = null;
  private pausedTotalMs = 0;
  private pauseCount = 0;
  private readonly clock: Clock;
  private readonly events: RunEvent[] = [];
  private view: ViewState = { ...DEFAULT_VIEW };
  private obsSeq = 0;
  private observeCount = 0;
  private attemptsLeft = SUBMIT_ATTEMPTS;
  private runId: string;
  private readonly opCache = new Map<string, MoveResult>();
  private lastResult: MoveResult | null = null;
  private lastSubmit: SubmitResult | null = null;
  private lastObservation: Observation | null = null;
  private agentCalls = 0;
  private agentMoves = 0;
  /** 当前帧内的 applyMove 调用数（AC-44 限流，beginFrame 清零） */
  private rateCount = 0;

  readonly size: CubeSize;
  readonly timeLimitMs: number | null;
  readonly moveLimit: number | null;
  readonly observationMode: ObservationMode;
  readonly dustMode: boolean;

  constructor(options: SessionOptions) {
    this.size = options.size;
    this.timeLimitMs = options.timeLimitMs ?? null;
    this.moveLimit = options.moveLimit ?? null;
    this.observationMode = options.observationMode ?? 'full';
    this.dustMode = options.dustMode ?? true;
    this.clock = options.clock ?? systemClock;
    this.puzzle = createPuzzle({
      size: options.size,
      seed: options.seed ?? entropySeed(),
      createdAt: new Date().toISOString(),
    });
    this.initialState = replayScramble(options.size, this.puzzle.scramble);
    this.state = this.initialState;
    this.runId = `run-${Math.abs(this.puzzle.scramble_fingerprint.length)}-${Date.now().toString(36)}`;
  }

  // ------------------------------------------------------------------ 只读视图

  get status(): ChallengeStatus {
    return this.statusValue;
  }
  get rules(): ChallengeRules {
    return {
      challenge_id: this.puzzle.challenge_id,
      run_id: this.runId,
      puzzle_id: this.puzzle.challenge_id,
      cube_size: this.size,
      scramble_method: 'random_moves',
      scramble_length: this.puzzle.scramble_length,
      gen_version: `g${this.puzzle.generation.algorithm_version}`,
      seed: this.puzzle.seed_text,
      time_limit_ms: this.timeLimitMs,
      move_limit: this.moveLimit,
      observation_mode: this.observationMode,
      dust_mode: this.dustMode,
      metric: 'HTM',
      created_at: this.puzzle.created_at,
      notation_version: 'ss-2',
    };
  }
  get record(): PuzzleRecord {
    return this.puzzle;
  }
  get cubeState(): CubeState {
    return this.state;
  }
  get stateView() {
    return toStateView(this.state);
  }
  get eventLog(): readonly RunEvent[] {
    return this.events;
  }
  get lastSubmitResult(): SubmitResult | null {
    return this.lastSubmit;
  }
  get viewOrientation(): ViewState {
    return this.view;
  }
  get attempts(): number {
    return this.attemptsLeft;
  }
  get moveCount(): number {
    return this.events.filter((e) => e.type === 'move' && e.ok).length;
  }
  get agentStats() {
    return { calls: this.agentCalls, moves: this.agentMoves, observes: this.observeCount };
  }

  elapsedMs(): number {
    if (this.startedAt === null) return 0;
    // 暂停中时钟冻结在 pausedAt；结束后冻结在 endedAt（若结束时仍在暂停，两者相等）
    const now = this.endedAt ?? this.pausedAt ?? this.clock();
    return Math.max(0, now - this.startedAt - this.pausedTotalMs);
  }
  remainingMs(): number | null {
    if (this.timeLimitMs === null) return null;
    return Math.max(0, this.timeLimitMs - this.elapsedMs());
  }
  tps(): number {
    const seconds = this.elapsedMs() / 1000;
    return seconds > 0 ? this.moveCount / seconds : 0;
  }
  get pauseStats(): { count: number; totalMs: number } {
    return { count: this.pauseCount, totalMs: this.pausedTotalMs };
  }

  // ------------------------------------------------------------------ 生命周期

  /** 换阶数/换题：复用同一个配置，生成新题面。 */
  regenerate(seed?: number | string): void {
    this.puzzle = createPuzzle({
      size: this.size,
      seed: seed ?? entropySeed(),
      createdAt: new Date().toISOString(),
    });
    this.resetRun();
  }

  /** 同题重跑：题面不变，状态、计时、计步、事件全部清零。 */
  resetRun(): void {
    this.initialState = replayScramble(this.size, this.puzzle.scramble);
    this.state = this.initialState;
    this.statusValue = 'ready';
    this.startedAt = null;
    this.endedAt = null;
    this.pausedAt = null;
    this.pausedTotalMs = 0;
    this.pauseCount = 0;
    this.events.length = 0;
    this.obsSeq = 0;
    this.observeCount = 0;
    this.attemptsLeft = SUBMIT_ATTEMPTS;
    this.opCache.clear();
    this.rateCount = 0;
    this.lastResult = null;
    this.lastSubmit = null;
    this.lastObservation = null;
    this.view = { ...DEFAULT_VIEW };
    this.runId = `run-${Date.now().toString(36)}`;
  }

  start(): void {
    this.guardActiveChallenge();
    if (this.statusValue !== 'ready') return;
    this.statusValue = 'running';
    this.startedAt = this.clock();
    this.pushEvent('start', null, true, null);
  }

  pause(): void {
    if (this.statusValue !== 'running') return;
    this.pausedAt = this.clock();
    this.pauseCount += 1;
    this.statusValue = 'paused';
    this.pushEvent('pause', null, true, null);
  }

  resume(): void {
    if (this.statusValue !== 'paused') return;
    if (this.pausedAt !== null) {
      this.pausedTotalMs += Math.max(0, this.clock() - this.pausedAt);
      this.pausedAt = null;
    }
    this.statusValue = 'running';
    this.pushEvent('resume', null, true, null);
  }

  abandon(note?: string): void {
    this.guardActiveChallenge();
    if (isEnded(this.statusValue)) return;
    this.finish('ended_abandoned', note ?? '用户主动放弃');
  }

  /**
   * 页面在 running/paused 中被关闭或刷新（PRD §7.3 终止判定之一）：
   * 尽力结算为 interrupted——已发生的事件全部保留，计时冻结在当前活跃时长。
   * 由宿主在 beforeunload 里同步调用；本方法自身不触碰存储。
   */
  interrupt(): void {
    if (this.statusValue !== 'running' && this.statusValue !== 'paused') return;
    this.finish('ended_interrupted', '页面在运行中被关闭或刷新');
  }

  /** AC-44：宿主每帧调用一次（rAF / 兜底 interval），清零本帧 applyMove 计数。 */
  beginFrame(): void {
    this.rateCount = 0;
  }

  /** 每次渲染帧与每次 API 调用前都要走这里，超时不能被 UI 倒计时独占。 */
  tick(): void {
    if (this.startedAt === null || isEnded(this.statusValue)) return;
    if (this.statusValue === 'paused') return; // 真暂停：elapsed 冻结，不可能超时（PRD §7.2.1 P2'）
    if (this.timeLimitMs !== null && this.elapsedMs() >= this.timeLimitMs) {
      this.finish('ended_timeout', '超出时间上限');
    }
  }

  private finish(status: ChallengeStatus, reason: string): void {
    this.statusValue = status;
    // 结束时若仍在暂停：最后一段暂停补进 paused_total_ms（P1' 诚实口径——
    // elapsed 冻结在暂停点不受影响，但"共暂停 M 秒"必须把这段算进去）。
    if (this.pausedAt !== null) {
      this.pausedTotalMs += Math.max(0, this.clock() - this.pausedAt);
      this.pausedAt = null;
    }
    this.endedAt = this.clock();
    this.pushEvent('end', null, true, null);
    if (this.lastSubmit === null) {
      // 超时/步数耗尽/中断等非提交结局也要给出「错在哪」：结果页据此显示未归位贴纸数。
      const verdict = evaluateSolved(this.state);
      this.lastSubmit = {
        accepted: false,
        status,
        reason,
        mismatch: verdict.solved
          ? null
          : { faces_wrong: verdict.wrongFaces, sticker_count_wrong: verdict.wrongStickers },
      };
    }
  }

  // ------------------------------------------------------------------ 观察

  visibleFaces(): FaceId[] {
    if (this.observationMode === 'full') return [...FACE_ORDER];
    if (this.observationMode === 'single_face') return [this.view.front];
    const right = faceOfNormal(rightOf(this.view.up, this.view.front));
    return [this.view.up, this.view.front, right];
  }

  observe(): Observation {
    this.tick();
    this.guardStarted();
    this.guardNotEnded();
    this.guardNotPaused();
    if (this.observationMode === 'restricted' && this.observeCount >= RESTRICTED_OBSERVE_BUDGET) {
      throw new CubeError('E_OBSERVATION_BUDGET_EXHAUSTED', '受限观察次数已用尽', '只能基于已有信息继续操作');
    }
    this.obsSeq += 1;
    this.observeCount += 1;
    const observation = this.buildObservation();
    this.lastObservation = observation;
    return observation;
  }

  peekObservation(): Observation {
    // 只读投影，不推进 obsSeq、不计入观察预算。UI 用它刷新右栏。
    return this.buildObservation();
  }

  private buildObservation(): Observation {
    const visible = this.visibleFaces();
    const faceColors: Partial<Record<FaceId, FaceGrid>> = {};
    for (const face of visible) {
      const grid = this.gridOf(face);
      faceColors[face] = grid;
    }
    const allowed: AllowedActions = {
      notation: moveCatalogNotations(this.size),
      layer_indices: Array.from({ length: this.size }, (_, i) => i + 1),
      can_rotate_view: true,
    };
    return {
      challenge_id: this.puzzle.challenge_id,
      cube_size: this.size,
      observation_id: `${this.runId}:o${Math.max(1, this.obsSeq)}`,
      view_orientation: { ...this.view },
      visible_faces: visible,
      face_colors: faceColors,
      allowed_actions: allowed,
      elapsed_ms: this.elapsedMs(),
      remaining_ms: this.remainingMs(),
      move_count: this.moveCount,
      status: this.statusValue,
    };
  }

  private gridOf(face: FaceId): FaceGrid {
    const n = this.size;
    const base = FACE_ORDER.indexOf(face) * n * n;
    const rows: StickerColor[][] = [];
    for (let r = 0; r < n; r += 1) {
      const row: StickerColor[] = [];
      for (let c = 0; c < n; c += 1) {
        const colorId = this.state.slots[base + r * n + c] ?? 0;
        row.push(COLOR_OF_FACE[FACE_ORDER[colorId] ?? 'U']);
      }
      rows.push(row);
    }
    return rows;
  }

  rotateView(next: ViewState): ViewState {
    this.tick();
    if (this.statusValue === 'idle') {
      throw new CubeError('E_CHALLENGE_NOT_STARTED', '挑战尚未创建', '先创建挑战');
    }
    this.guardNotEnded();
    this.guardNotPaused();
    if (areCollinear(next.up, next.front)) {
      throw new CubeError('E_VIEW_ORIENTATION_INVALID', 'up 与 front 不能共线', '请选两个相邻面');
    }
    this.view = { ...next };
    this.pushEvent('view', null, true, null);
    return this.view;
  }

  stepView(direction: 'left' | 'right' | 'up' | 'down'): ViewState {
    this.guardNotEnded();
    this.guardNotPaused();
    const { up, front } = this.view;
    const right = faceOfNormal(rightOf(up, front));
    const next: ViewState =
      direction === 'left'
        ? { up, front: right }
        : direction === 'right'
          ? { up, front: opposite(right) }
          : direction === 'up'
            ? { up: opposite(front), front: up }
            : { up: front, front: opposite(up) };
    this.view = next;
    const event = this.pushEvent('view', null, true, null);
    // AC-67：相对视角旋转记录「绕哪个轴、朝哪转、转几步」。
    // 左右移动时 up 面不动，绕的是 up 的轴；上下移动时右侧面不动，绕的是它的轴。
    const invariantFace = direction === 'left' || direction === 'right' ? up : right;
    event.axis = AXIS_CHARS[FACE_GEOMETRY[invariantFace].axis];
    event.direction = direction;
    event.steps = 1;
    return this.view;
  }

  // ------------------------------------------------------------------ 操作

  applyMoveNotation(raw: string, opId?: string): MoveResult {
    this.agentCalls += 1;
    this.tick();
    this.guardStarted();
    this.guardNotEnded();
    if (this.statusValue === 'paused') {
      throw new CubeError('E_CHALLENGE_PAUSED', '挑战已暂停，计时已冻结', '先继续挑战');
    }
    if (this.statusValue === 'solved_pending') {
      throw new CubeError('E_CUBE_ALREADY_SOLVED', '魔方已还原，等待提交', '请调用 submitSolution');
    }
    this.guardRate();
    if (opId) {
      const cached = this.opCache.get(opId);
      if (cached) {
        if (cached.move !== raw) {
          throw new CubeError('E_OP_ID_CONFLICT', `op_id ${opId} 已绑定 ${cached.move}`, '同一个 op_id 不允许两种含义');
        }
        return { ...cached, deduplicated: true };
      }
    }
    const spec = parseMove(raw, this.size);
    if (spec.kind === 'rotation') {
      // AC-66：整体旋转只属于 rotate_view 通道。不能漏进引擎的 rotation
      // 不变量——那会抛内部 InvariantError 而不是契约错误码。
      throw new CubeError(
        'E_NOTATION_ORIENTATION_NOT_MOVABLE',
        `整体旋转 ${spec.raw} 不是可提交的转动指令`,
        '改变观察方向请用 rotate_view；apply_move 只接受层转动',
      );
    }
    return this.commit(spec, opId ?? null, 'api', spec.raw);
  }

  /** UI 与 Agent 共用的唯一提交点。`amount` 是两次按键共同的转向量（归并时两次相同）。 */
  applyIntent(
    face: FaceId,
    layers: readonly number[],
    amount: 1 | 2 | 3,
    merged: boolean,
    channel: InputChannel = 'button',
  ): MoveResult {
    this.tick();
    this.guardStarted();
    this.guardNotEnded();
    this.guardNotPaused();
    if (this.statusValue !== 'running') {
      throw new CubeError('E_CHALLENGE_NOT_STARTED', '挑战未在进行中', '请先开始挑战');
    }
    const notation = describeMove({ size: this.size, face, layers, amount });
    const spec = parseMove(notation, this.size);
    const result = this.commit(spec, null, channel, spec.raw);
    if (merged) this.mergeLastIntoDouble(face, layers, amount, channel);
    return result;
  }

  private commit(
    spec: MoveSpec,
    opId: string | null,
    channel: InputChannel,
    rawInput: string | null,
  ): MoveResult {
    if (this.moveLimit !== null && this.moveCount >= this.moveLimit) {
      // 步数耗尽只在「已还原」时让位于提交；其余一律终止。
      if (isSolved(this.state)) {
        this.statusValue = 'solved_pending';
      } else {
        this.finish('ended_move_limit', '超出步数上限');
      }
      throw new CubeError('E_MOVE_LIMIT_REACHED', '步数已达上限', '可尝试提交解答；未还原则本局失败');
    }
    const from = fingerprintState(this.state);
    this.state = engineApplyMove(this.state, spec);
    const to = fingerprintState(this.state);
    const protocolLayers = protocolLayerSet(spec);
    const event = this.pushEvent('move', spec.normalized, true, null);
    event.from_fingerprint = from;
    event.to_fingerprint = to;
    // AC-22：move 事件自带四字段（可由其直接重算 HTM-layer，无需重放解析）
    event.axis = spec.axis;
    event.layer_set = protocolLayers;
    event.layer_count = protocolLayers.length;
    event.turn_amount = spec.amount === 2 ? 180 : 90;
    event.input_channel = channel;
    event.raw_input = rawInput;
    const solved = evaluateSolved(this.state).solved;
    if (solved && this.statusValue === 'running') {
      this.statusValue = 'solved_pending';
    } else if (
      !solved &&
      this.statusValue === 'running' &&
      this.moveLimit !== null &&
      this.moveCount >= this.moveLimit
    ) {
      // PRD §7.3：判定时机是「第 move_limit 步执行后」——已提交步数达上限且未还原
      // 就立即按步数耗尽结算，不得等到第 N+1 步提交才醒（还原优先，见上分支）。
      this.finish('ended_move_limit', '步数上限已到且尚未还原');
    }
    const result: MoveResult = {
      op_id: opId,
      deduplicated: false,
      move: spec.normalized,
      layer_count: protocolLayers.length,
      turn_amount: spec.amount === 2 ? 180 : 90,
      axis: spec.axis,
      layer_set: protocolLayers,
      // §8.6：受限观察下有意屏蔽（键恒存在、值为 null）
      state_fingerprint_after: this.observationMode === 'full' ? to : null,
      move_count: this.moveCount,
      elapsed_ms: this.elapsedMs(),
      remaining_ms: this.remainingMs(),
      solved: evaluateSolved(this.state).solved,
      next_observation: this.buildObservation(),
    };
    if (opId) this.opCache.set(opId, result);
    this.lastResult = result;
    this.agentMoves += 1;
    return result;
  }

  /**
   * 180° 双击归并：**只合并计步与日志，不回退状态、不重放动画**。
   * 状态已经被两次同向 90° 推进，其几何结果本就等价于 X2（SPEC §11 坑 1）。
   * `amount` 是两次按键共同的转向量：双击 X → X2，双击 X' → 也是 X2（X' X' = 180°）。
   */
  private mergeLastIntoDouble(
    face: FaceId,
    layers: readonly number[],
    amount: 1 | 2 | 3,
    channel: InputChannel,
  ): void {
    const last = this.events[this.events.length - 1];
    const prev = this.events[this.events.length - 2];
    if (!last || !prev || last.type !== 'move' || prev.type !== 'move') return;
    if (last.move === null || prev.move === null) return;
    if (amount === 2) return; // 两次 180° 相加是 360°，不是任何单条记法，不归并
    const mergedNotation = describeMove({ size: this.size, face, layers, amount: 2 });
    const expected = describeMove({ size: this.size, face, layers, amount });
    if (last.move !== expected || prev.move !== expected) return;
    this.events.splice(this.events.length - 2, 2);
    const merged = this.pushEvent('move', mergedNotation, true, null);
    merged.merged_from = [prev.move, last.move];
    merged.from_fingerprint = prev.from_fingerprint;
    merged.to_fingerprint = last.to_fingerprint;
    // 归并后的四字段与直接提交 X2 完全一致（AC-63：turn_amount=180、层轴不变）
    const mergedSpec = parseMove(mergedNotation, this.size);
    const protocolLayers = protocolLayerSet(mergedSpec);
    merged.axis = mergedSpec.axis;
    merged.layer_set = protocolLayers;
    merged.layer_count = protocolLayers.length;
    merged.turn_amount = 180;
    merged.input_channel = channel;
    merged.raw_input = null;
    this.lastResult = this.lastResult
      ? { ...this.lastResult, move: mergedNotation, turn_amount: 180, move_count: this.moveCount }
      : null;
  }

  getLastActionResult(): MoveResult | null {
    return this.lastResult;
  }

  /** 按 op_id 取已缓存结果（Agent 的 getLastActionResult(opId) 语义）。 */
  getActionResult(opId: string): MoveResult | null {
    return this.opCache.get(opId) ?? null;
  }
  getLastObservation(): Observation | null {
    return this.lastObservation;
  }

  // ------------------------------------------------------------------ 提交与结果

  submitSolution(note?: string): SubmitResult {
    this.tick();
    this.guardStarted();
    this.guardNotEnded();
    this.guardNotPaused();
    const verdict = evaluateSolved(this.state);
    if (verdict.solved) {
      this.statusValue = 'ended_solved';
      this.endedAt = this.clock();
      this.pushEvent('submit', null, true, null);
      this.pushEvent('end', null, true, null);
      this.lastSubmit = { accepted: true, status: this.statusValue, reason: note ?? null, mismatch: null };
    } else {
      this.attemptsLeft -= 1;
      const mismatch = {
        faces_wrong: verdict.wrongFaces,
        sticker_count_wrong: verdict.wrongStickers,
      };
      this.pushEvent('submit', null, false, 'E_NOT_SOLVED');
      if (this.attemptsLeft <= 0) {
        this.finish('ended_invalid', '连续提交未还原达到上限');
      }
      this.lastSubmit = {
        accepted: false,
        status: this.statusValue,
        reason: '魔方尚未还原',
        mismatch,
      };
      if (!isEnded(this.statusValue)) {
        throw new CubeError('E_NOT_SOLVED', '魔方尚未还原', `还有 ${verdict.wrongStickers} 张贴纸未归位`);
      }
    }
    return this.lastSubmit;
  }

  getChallengeResult(): ChallengeResult {
    if (!isEnded(this.statusValue)) {
      throw new CubeError('E_RUN_NOT_FINISHED', '本次运行尚未结束', '结束后再查询结果');
    }
    const metrics = this.moveMetrics();
    return {
      rules: this.rules,
      status: this.statusValue,
      solved: this.statusValue === 'ended_solved',
      move_count: this.moveCount,
      elapsed_ms: this.elapsedMs(),
      tps: this.tps(),
      events: [...this.events],
      initial_fingerprint: fingerprintState(this.initialState),
      final_fingerprint: fingerprintState(this.state),
      ended_reason: this.lastSubmit?.reason ?? null,
      pause_count: this.pauseCount,
      paused_total_ms: this.pausedTotalMs,
      engine_version: ENGINE_VERSION,
      htm_layer_count: metrics.htmLayer,
      qtm_count: metrics.qtm,
    };
  }

  /** 三种计步口径（AC-49）：从已定稿事件重算，不依赖内部计数。 */
  private moveMetrics(): { htm: number; htmLayer: number; qtm: number } {
    let htm = 0;
    let htmLayer = 0;
    let qtm = 0;
    for (const event of this.events) {
      if (event.type !== 'move' || !event.ok || event.move === null) continue;
      htm += 1;
      htmLayer += event.layer_count ?? 1;
      qtm += event.turn_amount === 180 ? 2 : 1;
    }
    return { htm, htmLayer, qtm };
  }

  getProgress(): Progress {
    this.tick();
    return {
      status: this.statusValue,
      move_count: this.moveCount,
      elapsed_ms: this.elapsedMs(),
      remaining_ms: this.remainingMs(),
      move_limit: this.moveLimit,
      is_solved: evaluateSolved(this.state).solved,
      observation_allowed: this.statusValue === 'running' || this.statusValue === 'solved_pending',
    };
  }

  // ------------------------------------------------------------------ 内部

  private pushEvent(type: RunEvent['type'], move: string | null, ok: boolean, errorCode: string | null): RunEvent {
    const event: RunEvent = {
      seq: this.events.length + 1,
      type,
      at_ms: this.elapsedMs(),
      move,
      observation_id: `${this.runId}:o${Math.max(1, this.obsSeq)}`,
      from_fingerprint: null,
      to_fingerprint: null,
      ok,
      error_code: errorCode,
      merged_from: null,
      axis: null,
      layer_set: null,
      layer_count: null,
      turn_amount: null,
      input_channel: null,
      raw_input: null,
      direction: null,
      steps: null,
    };
    this.events.push(event);
    return event;
  }

  private guardActiveChallenge(): void {
    if (!this.puzzle) throw new CubeError('E_NO_ACTIVE_CHALLENGE', '尚未创建挑战', '先创建挑战');
  }
  private guardStarted(): void {
    if (this.statusValue === 'ready' || this.statusValue === 'idle') {
      throw new CubeError('E_CHALLENGE_NOT_STARTED', '挑战尚未开始', '开始挑战后才能观察或操作');
    }
  }
  private guardNotEnded(): void {
    if (isEnded(this.statusValue)) {
      // PRD §12.1 / AC-28 / §7.3：结束后的错误码要能说明「为什么结束」——
      // 超时后任何操作返回 TIMEOUT（E_DEADLINE_EXCEEDED），步数耗尽返回
      // MOVE_LIMIT（E_MOVE_LIMIT_REACHED），其余结束态才是 ALREADY_FINISHED。
      if (this.statusValue === 'ended_timeout') {
        throw new CubeError('E_DEADLINE_EXCEEDED', '已超过时间限制', '挑战已按超时结算，调 getChallengeResult 取结果');
      }
      if (this.statusValue === 'ended_move_limit') {
        throw new CubeError('E_MOVE_LIMIT_REACHED', '已达步数上限', '挑战已按步数耗尽结算，调 getChallengeResult 取结果');
      }
      throw new CubeError('E_CHALLENGE_ENDED', '本次运行已结束', '请调用 getChallengeResult');
    }
  }
  private guardNotPaused(): void {
    if (this.statusValue === 'paused') {
      throw new CubeError('E_CHALLENGE_PAUSED', '挑战已暂停，计时已冻结', '先继续挑战再操作');
    }
  }
  /** AC-44：本帧内 applyMove 超过 RATE_LIMIT 次即拒绝，不改状态、不计步。
   * 放在状态守卫之后——挑战已结束/暂停时，那两个错误码对调用方更有信息量。
   * 幂等命中（op_id 缓存）同样计入：AC 数的是「调用次数」。 */
  private guardRate(): void {
    this.rateCount += 1;
    if (this.rateCount > RATE_LIMIT) {
      throw new CubeError('E_RATE_LIMITED', '调用过于频繁，请降低频率', `单帧内 applyMove 不得超过 ${RATE_LIMIT} 次`);
    }
  }
}

export function solvedStateFingerprint(size: CubeSize): string {
  return fingerprintState(createSolvedState(size));
}
