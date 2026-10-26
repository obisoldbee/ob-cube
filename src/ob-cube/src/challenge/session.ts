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
import { COLOR_OF_FACE, CubeError, ENGINE_VERSION, FACE_ORDER, MERGE_WINDOW_MS, isEnded } from '../contracts';
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
  /**
   * 键盘 300ms 双击归并开关（PRD §2.2 配置项，默认开）。
   * 仅影响「键盘通道的步数耗尽判定是否等归并窗口关闭」——归并本身仍按
   * `applyIntent(..., merged=true)` 的显式标记执行。
   */
  mergeDoubleTap?: boolean;
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
/** PRD §10.4：单次运行落盘事件上限；超出时 view 事件优先丢弃并标注截断 */
export const MAX_RECORDED_EVENTS = 2000;

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

/** run_id 只需在本机会话内唯一；同一毫秒内连续两次重跑不能撞（R09）。 */
function newRunId(): string {
  entropyCounter += 1;
  return `run-${Date.now().toString(36)}-${entropyCounter.toString(36)}`;
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
  /** 首次满足还原条件的时刻（进入 solved_pending），PRD §7.2 的 solved_at_ms */
  private solvedAt: number | null = null;
  private readonly clock: Clock;
  private readonly events: RunEvent[] = [];
  private view: ViewState = { ...DEFAULT_VIEW };
  private obsSeq = 0;
  private observeCount = 0;
  /** after_move 档：上次成功观察时的步数。−1 = 尚未观察过（开局允许一次） */
  private lastObservedMoveCount = -1;
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
  /**
   * 归并窗口内的「上一次 90° 转动」。保存**转前状态快照**，使窗口内的第二次同向
   * 90° 能原子化为一条 X2：回滚到转前 → 一次性执行 180° → 只判一次终止。
   * 这是 PRD §5.4「输入整形早于定稿」的实现基础（旧实现先提交再改日志，
   * 会在步数边界上按两步判负）。
   */
  private lastTurn: {
    before: CubeState;
    event: RunEvent;
    face: FaceId;
    layers: readonly number[];
    amount: 1 | 3;
    at: number;
  } | null = null;
  /**
   * 键盘 90° 撞上步数上限时，终止判定推迟到归并窗口关闭：
   * 第二次按键可能把两步折成一步 X2，从而不触顶（R03）。
   */
  private pendingLimitDeadline: number | null = null;
  /** 最近一次实际交付给参与者的观察快照（受限观察下 UI 只能读它，不能读实时状态） */
  private lastDelivered: Observation | null = null;
  /** 观察预算计数：每次「交付一份新颜色布局」+1（显式 observe 与操作后自动交付同规则） */
  private deliveryCount = 0;

  readonly size: CubeSize;
  readonly timeLimitMs: number | null;
  readonly moveLimit: number | null;
  readonly observationMode: ObservationMode;
  readonly dustMode: boolean;
  readonly mergeDoubleTap: boolean;

  constructor(options: SessionOptions) {
    this.size = options.size;
    this.timeLimitMs = options.timeLimitMs ?? null;
    this.moveLimit = options.moveLimit ?? null;
    this.observationMode = options.observationMode ?? 'full';
    this.dustMode = options.dustMode ?? true;
    this.mergeDoubleTap = options.mergeDoubleTap ?? true;
    this.clock = options.clock ?? systemClock;
    this.puzzle = createPuzzle({
      size: options.size,
      seed: options.seed ?? entropySeed(),
      createdAt: new Date().toISOString(),
    });
    this.initialState = replayScramble(options.size, this.puzzle.scramble);
    this.state = this.initialState;
    this.runId = newRunId();
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
  /** PRD §7.2：开始 → 第一步操作（无操作时为 null） */
  firstMoveMs(): number | null {
    const first = this.events.find((event) => event.type === 'move');
    return first?.at_ms ?? null;
  }
  /** PRD §7.2：开始 → 首次满足还原条件（无还原为 null） */
  solvedAtMs(): number | null {
    return this.solvedAt;
  }
  /** PRD §7.2：开始 → 成功提交（未成功提交为 null） */
  submitMs(): number | null {
    for (let i = this.events.length - 1; i >= 0; i -= 1) {
      const event = this.events[i];
      if (event && event.type === 'submit' && event.ok) return event.at_ms;
    }
    return null;
  }
  /** PRD §7.2：总墙钟时长（不扣暂停），仅旁证，不参与判定与排序 */
  wallElapsedMs(): number {
    return this.elapsedMs() + this.pausedTotalMs;
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
    this.solvedAt = null;
    this.events.length = 0;
    this.obsSeq = 0;
    this.observeCount = 0;
    this.lastObservedMoveCount = -1;
    this.attemptsLeft = SUBMIT_ATTEMPTS;
    this.opCache.clear();
    this.rateCount = 0;
    this.lastResult = null;
    this.lastSubmit = null;
    this.lastObservation = null;
    this.lastTurn = null;
    this.pendingLimitDeadline = null;
    this.lastDelivered = null;
    this.deliveryCount = 0;
    // R09：统计必须按 run 清零，否则第二轮会继承上一轮的 Agent 调用次数
    this.agentCalls = 0;
    this.agentMoves = 0;
    this.view = { ...DEFAULT_VIEW };
    this.runId = newRunId();
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
   * 页面在 running/paused/solved_pending 中被关闭或刷新（PRD §7.3 终止判定之一）：
   *   running / paused → ended_interrupted（已发生的事件全部保留，计时冻结）；
   *   solved_pending  → ended_solved，且 submit_ms 保持 null（PRD §7.3 明文要求，
   *                     「已还原」是既成事实，不因没点提交而作废）。
   * 由宿主在 beforeunload 里同步调用；本方法自身不触碰存储。
   */
  interrupt(): void {
    if (this.statusValue === 'solved_pending') {
      this.statusValue = 'ended_solved';
      this.pendingLimitDeadline = null;
      this.endedAt = this.clock();
      this.pushEvent('end', null, true, null);
      this.lastSubmit = {
        accepted: true,
        status: 'ended_solved',
        reason: '页面在已还原待提交时关闭（未提交，submit_ms 为 null）',
        mismatch: null,
      };
      return;
    }
    if (this.statusValue !== 'running' && this.statusValue !== 'paused') return;
    this.pendingLimitDeadline = null;
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
    // AC-28 / AC-75 / D1：已还原待提交的运行不得被超时覆盖——结果必须保持 solved。
    if (this.statusValue === 'solved_pending') return;
    // 键盘 90° 撞上步数上限：等归并窗口关闭后再判负（R03）。窗口内第二次同向按
    // 键会走 applyIntent 的归并分支，把两步折成一条 X2 重判，不会走到这里。
    if (this.pendingLimitDeadline !== null && this.clock() >= this.pendingLimitDeadline) {
      this.pendingLimitDeadline = null;
      this.finish('ended_move_limit', '步数上限已到且尚未还原');
      return;
    }
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
    return this.visibleFacesFor(this.view);
  }

  /** 指定朝向下的授权面。观察者回放按每一步的朝向调用它恢复当时视野。 */
  visibleFacesFor(view: ViewState): FaceId[] {
    if (this.observationMode === 'full') return [...FACE_ORDER];
    if (this.observationMode === 'single_face') return [view.front];
    // three_faces / after_move / restricted 都按当前朝向露出上、前、右三面；
    // after_move 的差别在「何时允许观察」，不在可见面数量。
    const right = faceOfNormal(rightOf(view.up, view.front));
    return [view.up, view.front, right];
  }

  /** after_move 档：只有转动过、且本次转动后还没观察过时才放行。 */
  private observationUnlocked(): boolean {
    if (this.observationMode !== 'after_move') return true;
    return this.lastObservedMoveCount !== this.moveCount;
  }

  observe(): Observation {
    this.tick();
    this.guardStarted();
    this.guardNotEnded();
    this.guardNotPaused();
    if (!this.observationUnlocked()) {
      throw new CubeError(
        'E_OBSERVATION_REQUIRES_MOVE',
        '本档观察需先完成一次转动',
        '先调用 apply_move，转动后本次观察机会才会开放',
      );
    }
    if (!this.canDeliverObservation()) {
      throw new CubeError('E_OBSERVATION_BUDGET_EXHAUSTED', '受限观察次数已用尽', '只能基于已有信息继续操作');
    }
    const observation = this.deliverObservation();
    if (observation === null) {
      // 预算检查与交付之间的兜底：不允许「检查通过却没交付」的静默分支。
      throw new CubeError('E_OBSERVATION_BUDGET_EXHAUSTED', '受限观察次数已用尽', '只能基于已有信息继续操作');
    }
    this.observeCount += 1;
    return observation;
  }

  /**
   * 只读投影，不推进 obsSeq、不计入观察预算。UI 用它刷新右栏。
   *
   * restricted 档只能读「已交付的那份快照」：若这里直接读实时状态，
   * 观察面板就成了绕过 24 次预算的免费通道（预算用尽后仍能看到最新布局）。
   */
  peekObservation(): Observation {
    if (this.observationMode === 'restricted') {
      return this.lastDelivered ?? this.buildLockedObservation();
    }
    return this.buildObservation(this.observationIdOf(this.obsSeq));
  }

  /** 观察预算是否还有余额（只有 restricted 有预算） */
  private canDeliverObservation(): boolean {
    return !(this.observationMode === 'restricted' && this.deliveryCount >= RESTRICTED_OBSERVE_BUDGET);
  }

  /**
   * **唯一的观察交付点**。一次交付 = 消耗一次预算（restricted）+ 编号 +1 +
   * 刷新「已观察步数」（after_move 的一次机会就此用掉）。
   *
   * 显式 `observe()` 与 `applyMove` 的 `next_observation` 走同一条路径——旧实现里
   * `applyMove` 直接调用 `buildObservation()`，既不吃预算也不换编号，于是
   * 「用尽 24 次后继续转动仍能拿到新颜色」且「多份不同快照共用一个 id」。
   * 返回 null 表示当前不可交付（不得用空对象冒充一份观察）。
   */
  private deliverObservation(): Observation | null {
    if (!this.canDeliverObservation()) return null;
    this.obsSeq += 1;
    this.deliveryCount += 1;
    this.lastObservedMoveCount = this.moveCount;
    const observation = this.buildObservation(this.observationIdOf(this.obsSeq));
    this.lastObservation = observation;
    this.lastDelivered = observation;
    return observation;
  }

  private observationIdOf(seq: number): string {
    // o0 = 尚未交付过任何观察（只出现在 UI 只读投影里，不进事件、不进 API 结果）
    return `${this.runId}:o${Math.max(0, seq)}`;
  }

  /**
   * after_move 档不做自动交付：该档语义是「转动后开放一次观察」，必须由调用方
   * 显式 `observe()` 取用；若 `applyMove` 顺手把观察塞回去，这道门控就形同虚设。
   */
  private shouldAutoDeliver(): boolean {
    return this.observationMode !== 'after_move';
  }

  /** 无授权交付时的投影：键齐全、面为空，明确表示「当前没有可用的观察」 */
  private buildLockedObservation(): Observation {
    return {
      challenge_id: this.puzzle.challenge_id,
      cube_size: this.size,
      observation_id: this.observationIdOf(this.obsSeq),
      view_orientation: { ...this.view },
      visible_faces: [],
      face_colors: {},
      allowed_actions: this.allowedActions(),
      elapsed_ms: this.elapsedMs(),
      remaining_ms: this.remainingMs(),
      move_count: this.moveCount,
      status: this.statusValue,
    };
  }

  private allowedActions(): AllowedActions {
    return {
      notation: moveCatalogNotations(this.size),
      layer_indices: Array.from({ length: this.size }, (_, i) => i + 1),
      can_rotate_view: true,
    };
  }

  private buildObservation(observationId: string): Observation {
    const visible = this.visibleFaces();
    const faceColors: Partial<Record<FaceId, FaceGrid>> = {};
    for (const face of visible) {
      faceColors[face] = this.gridOf(face);
    }
    return {
      challenge_id: this.puzzle.challenge_id,
      cube_size: this.size,
      observation_id: observationId,
      view_orientation: { ...this.view },
      visible_faces: visible,
      face_colors: faceColors,
      allowed_actions: this.allowedActions(),
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
    const event = this.pushEvent('view', null, true, null);
    // AC-67 / 观察者回放：绝对朝向没有单轴语义，但必须记下**结果朝向**，
    // 否则回放只能拿结束时的视角倒推每一步（历史各步会全部错位）。
    event.view_after = { ...this.view };
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
    event.view_after = { ...this.view };
    return this.view;
  }

  // ------------------------------------------------------------------ 操作

  /**
   * Agent 通道（也是记法输入框的通道）。`basedOn` 是调用方声明的「本次决策依据哪次
   * 观察」，写进事件而不是返回值（AC-42 的 13 字段不含根级 observation_id）。
   * `deliver=false` 供人类记法输入框使用：人类通道不消耗受限观察预算。
   */
  applyMoveNotation(raw: string, opId?: string, basedOn?: string | null, deliver = true): MoveResult {
    this.agentCalls += 1;
    this.tick();
    this.guardStarted();
    this.guardRate();
    // 幂等命中必须早于「已结束 / 已还原待提交」两个守卫：最后一步成功之后的重试
    // 若先撞终态守卫，同一个 op_id 会从「返回原结果」变成「抛 ALREADY_SOLVED」，
    // 调用方据此无法判断到底执行没执行（R07）。
    if (opId) {
      const cached = this.opCache.get(opId);
      if (cached) {
        if (cached.move !== raw) {
          throw new CubeError('E_OP_ID_CONFLICT', `op_id ${opId} 已绑定 ${cached.move}`, '同一个 op_id 不允许两种含义');
        }
        return { ...cached, deduplicated: true };
      }
    }
    this.resolvePendingLimitNow();
    this.guardNotEnded();
    if (this.statusValue === 'paused') {
      throw new CubeError('E_CHALLENGE_PAUSED', '挑战已暂停，计时已冻结', '先继续挑战');
    }
    if (this.statusValue === 'solved_pending') {
      throw new CubeError('E_CUBE_ALREADY_SOLVED', '魔方已还原，等待提交', '请调用 submitSolution');
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
    return this.commit(spec, opId ?? null, 'api', spec.raw, {
      basedOn: basedOn ?? null,
      deliver,
    });
  }

  /**
   * UI 与 Agent 共用的唯一提交点。`amount` 是两次按键共同的转向量（归并时两次相同）。
   *
   * **归并必须发生在定稿之前**（PRD §5.4 开放事件）：窗口内的第二次同向 90° 走
   * `commitMerged`，回到第一次按键前的局面原子地执行一次 180°，终止判定只做一次。
   * 旧实现「先 commit 再改日志」会在步数边界上先按两步判负（R03），
   * 且第二次按键可能已被终态守卫拒绝。
   */
  applyIntent(
    face: FaceId,
    layers: readonly number[],
    amount: 1 | 2 | 3,
    merged: boolean,
    channel: InputChannel = 'button',
  ): MoveResult {
    this.tick();
    this.guardStarted();
    this.guardNotPaused();
    // 先给「为什么结束」（超时 / 步数耗尽），再谈「没在进行中」——
    // 否则玩家在步数用尽后按键只会看到一句无信息量的 NOT_STARTED。
    this.guardNotEnded();
    if (this.statusValue !== 'running') {
      throw new CubeError('E_CHALLENGE_NOT_STARTED', '挑战未在进行中', '请先开始挑战');
    }
    const now = this.clock();
    if (merged && amount !== 2 && this.canMerge(face, layers, amount, now)) {
      return this.commitMerged(face, layers, amount, channel);
    }
    // 不是归并：上一次按键的归并机会已经消失，此时才把它按步数上限判负。
    this.resolvePendingLimitNow();
    this.guardNotEnded();
    const notation = describeMove({ size: this.size, face, layers, amount });
    const spec = parseMove(notation, this.size);
    return this.commit(spec, null, channel, spec.raw, {
      // 只有键盘的 90° 才可能被下一次同键按下折成 X2，因而也只有它需要推迟判负。
      deferLimit: this.mergeDoubleTap && channel === 'keyboard' && amount !== 2,
      trackMerge: amount !== 2 ? { face, layers } : null,
    });
  }

  /** 窗口内的第二次同向按键能否折成一条 X2（面、层集合、转向量、时间窗全一致） */
  private canMerge(face: FaceId, layers: readonly number[], amount: 1 | 2 | 3, now: number): boolean {
    const last = this.lastTurn;
    if (last === null) return false;
    if (amount === 2 || last.amount !== amount) return false;
    if (last.face !== face) return false;
    if (last.layers.length !== layers.length) return false;
    if (!last.layers.every((value, index) => value === layers[index])) return false;
    return now - last.at <= MERGE_WINDOW_MS;
  }

  /**
   * 把「上一次 90°」与本次 90° 折成一条 180°：回到转前状态、撤掉半成品事件、
   * 一次性执行 X2 并重新判定。状态轨迹与直接提交 X2 完全等价（R03：同题同解，
   * 显式 R2 与合法双击得到相同的步数、日志与胜负）。
   */
  private commitMerged(face: FaceId, layers: readonly number[], amount: 1 | 3, channel: InputChannel): MoveResult {
    const turn = this.lastTurn;
    if (turn === null) {
      // canMerge 保证不可达；防御式回落到普通提交，不制造半个归并状态。
      const notation = describeMove({ size: this.size, face, layers, amount });
      return this.commit(parseMove(notation, this.size), null, channel, null, {});
    }
    this.pendingLimitDeadline = null;
    this.state = turn.before;
    const index = this.events.lastIndexOf(turn.event);
    if (index >= 0) this.events.splice(index, 1);
    // 半成品事件的 agentMoves 增量一并撤回，归并后只算一步。
    if (turn.event.input_channel === 'api') this.agentMoves = Math.max(0, this.agentMoves - 1);
    this.lastTurn = null;
    const notation = describeMove({ size: this.size, face, layers, amount: 2 });
    const spec = parseMove(notation, this.size);
    return this.commit(spec, null, channel, null, {
      mergedFrom: [turn.event.move ?? '', turn.event.move ?? ''],
      atMs: turn.event.at_ms,
    });
  }

  private commit(
    spec: MoveSpec,
    opId: string | null,
    channel: InputChannel,
    rawInput: string | null,
    options: {
      basedOn?: string | null;
      deliver?: boolean;
      /** 窗口内可能被折成 X2：撞上步数上限时先不判负（R03） */
      deferLimit?: boolean;
      /** 记录为可归并的「上一次 90°」：保留面、层集合与转前状态 */
      trackMerge?: { face: FaceId; layers: readonly number[] } | null;
      mergedFrom?: readonly string[];
      atMs?: number;
    } = {},
  ): MoveResult {
    if (this.moveLimit !== null && this.moveCount >= this.moveLimit) {
      // 步数耗尽只在「已还原」时让位于提交；其余一律终止。
      if (isSolved(this.state)) {
        this.statusValue = 'solved_pending';
        this.solvedAt ??= this.elapsedMs();
      } else {
        this.finish('ended_move_limit', '超出步数上限');
      }
      throw new CubeError('E_MOVE_LIMIT_REACHED', '步数已达上限', '可尝试提交解答；未还原则本局失败');
    }
    const before = this.state;
    const from = fingerprintState(before);
    this.state = engineApplyMove(before, spec);
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
    event.based_on_observation_id = options.basedOn ?? event.observation_id;
    if (options.mergedFrom) event.merged_from = [...options.mergedFrom];
    if (options.atMs !== undefined) event.at_ms = options.atMs;
    const solved = evaluateSolved(this.state).solved;
    if (solved && this.statusValue === 'running') {
      this.statusValue = 'solved_pending';
      this.solvedAt ??= this.elapsedMs();
    } else if (
      !solved &&
      this.statusValue === 'running' &&
      this.moveLimit !== null &&
      this.moveCount >= this.moveLimit
    ) {
      // PRD §7.3：判定时机是「第 move_limit 步执行后」——已提交步数达上限且未还原
      // 就立即按步数耗尽结算，不得等到第 N+1 步提交才醒（还原优先，见上分支）。
      // 唯一例外：键盘 90° 且归并窗口还没关——第二次按键可能把这一步也折进 X2，
      // 折完就不再触顶。此时把判定推迟到 tick() 的 deadline 上。
      if (options.deferLimit) this.pendingLimitDeadline = this.clock() + MERGE_WINDOW_MS;
      else this.finish('ended_move_limit', '步数上限已到且尚未还原');
    }
    const deliver = options.deliver !== false && this.shouldAutoDeliver();
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
      // 与 observe() 同一个交付口：预算用尽时返回 null，不再夹带新颜色（R05/R06）
      next_observation: deliver ? this.deliverObservation() : null,
    };
    if (opId) this.opCache.set(opId, result);
    this.lastResult = result;
    if (channel === 'api') this.agentMoves += 1;
    if (options.trackMerge && spec.amount !== 2) {
      this.lastTurn = {
        before,
        event,
        face: options.trackMerge.face,
        layers: [...options.trackMerge.layers],
        amount: spec.amount,
        at: this.clock(),
      };
    } else {
      this.lastTurn = null;
    }
    return result;
  }

  /** 归并窗口内不判负：等 tick() 到点再结算（窗口内没有第二次按键就是真的超步）。 */
  private resolvePendingLimitNow(): void {
    if (this.pendingLimitDeadline === null) return;
    this.pendingLimitDeadline = null;
    if (!isEnded(this.statusValue) && this.statusValue !== 'solved_pending') {
      this.finish('ended_move_limit', '步数上限已到且尚未还原');
    }
  }

  /**
   * 旧实现在「提交之后」才改日志，会把一次双击拆成两步参与计步与终止判定
   * （R03 的回归来源）。归并逻辑已前移到 `applyIntent → commitMerged`，
   * 这里不再保留第二条合并路径——两条路径必然漂移。
   */

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
    const exported = this.exportedEvents();
    const dropped = this.events.length - exported.length;
    return {
      rules: this.rules,
      status: this.statusValue,
      solved: this.statusValue === 'ended_solved',
      move_count: this.moveCount,
      elapsed_ms: this.elapsedMs(),
      tps: this.tps(),
      events: exported,
      initial_fingerprint: fingerprintState(this.initialState),
      final_fingerprint: fingerprintState(this.state),
      ended_reason: this.lastSubmit?.reason ?? null,
      pause_count: this.pauseCount,
      paused_total_ms: this.pausedTotalMs,
      engine_version: ENGINE_VERSION,
      htm_layer_count: metrics.htmLayer,
      qtm_count: metrics.qtm,
      wall_elapsed_ms: this.wallElapsedMs(),
      first_move_ms: this.firstMoveMs(),
      solved_at_ms: this.solvedAtMs(),
      submit_ms: this.submitMs(),
      // PRD §13.1 可复现四件套：结束后才交出打乱序列（未结束前等于交出题面）
      scramble: [...this.puzzle.scramble],
      scramble_fingerprint: this.puzzle.scramble_fingerprint,
      gen_algorithm_version: this.puzzle.generation.algorithm_version,
      ...(dropped > 0 ? { events_truncated: true, events_dropped: dropped } : {}),
    };
  }

  /**
   * PRD §10.4：超出上限时先丢 view 事件（move / pause / resume / submit / end 优先保留）。
   * 若非 view 事件本身就超限，**保留尾部**而不是头部——头部丢掉的是开场，
   * 尾部丢掉的是「最后怎么结束的」，后者对复盘与结果判定更关键。
   * 无论哪种截断，`events_truncated` + `events_dropped` 都必须能说明缺口大小。
   */
  private exportedEvents(): RunEvent[] {
    if (this.events.length <= MAX_RECORDED_EVENTS) return [...this.events];
    const withoutViews = this.events.filter((event) => event.type !== 'view');
    if (withoutViews.length <= MAX_RECORDED_EVENTS) return withoutViews;
    return withoutViews.slice(withoutViews.length - MAX_RECORDED_EVENTS);
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
      observation_allowed:
        (this.statusValue === 'running' || this.statusValue === 'solved_pending') &&
        this.observationUnlocked(),
    };
  }

  // ------------------------------------------------------------------ 内部

  private pushEvent(type: RunEvent['type'], move: string | null, ok: boolean, errorCode: string | null): RunEvent {
    const event: RunEvent = {
      seq: this.events.length + 1,
      type,
      at_ms: this.elapsedMs(),
      move,
      observation_id: this.observationIdOf(this.obsSeq),
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
      based_on_observation_id: null,
      view_after: null,
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

/**
 * 回放到第 `step` 步时的朝向：按事件顺序累计 `view_after`，遇到第 step 步的 move
 * 就停（该步之后的视角变化不属于这一刻）。
 *
 * 观察者回放必须用它，不能用 `session.viewOrientation`——那是**结束时**的朝向，
 * 会让整段回放按最后一刻的视野展示（R10）。旧记录没有 `view_after` 时保持初值，
 * 退化为「按初始朝向回放」，而不是静默用终局朝向。
 */
export function viewAtStep(
  events: readonly RunEvent[],
  step: number,
  initial: ViewState = DEFAULT_VIEW,
): ViewState {
  let view: ViewState = { ...initial };
  let moves = 0;
  for (const event of events) {
    // 已到目标步数就停：第 step 步**之后**的视角变化不属于这一刻。
    if (moves >= step) break;
    if (event.type === 'move' && event.ok) {
      moves += 1;
      continue;
    }
    if (event.type === 'view' && event.view_after) view = event.view_after;
  }
  return view;
}
