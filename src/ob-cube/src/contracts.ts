/**
 * 跨团队公共契约 —— 冻结文件
 *
 * 本文件是引擎组与界面组之间的唯一共享面。两边都只依赖这里，不互相 import。
 * 修改本文件必须同步：① docs/specs/prd/CHANGELOG.md 追加一条变更记录；
 * ② 按 docs/specs/execution/CONTRACT.md 附录 B 的契约变更流程走（含版本号与历史兼容性结论）。
 * 缺任一项视为契约破坏。
 *
 * 命名约定：
 *   公开契约（Agent API 返回值）用 snake_case，与 docs/specs/prd/07-agent-api.md §7.1 逐字一致。
 *   内部实现可自由使用 camelCase，转换集中在 agent/ 的一个纯函数模块里。
 */

// ---------------------------------------------------------------------------
// 基础类型
// ---------------------------------------------------------------------------

export type CubeSize = 2 | 3 | 4;

/** 面标识。顺序即引擎的 faceIndex：0=U 1=R 2=F 3=D 4=L 5=B */
export type FaceId = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';

export const FACE_ORDER: readonly FaceId[] = ['U', 'R', 'F', 'D', 'L', 'B'];

/** 内部颜色 id，等于该颜色在已还原状态时所属面的 faceIndex */
export type ColorId = 0 | 1 | 2 | 3 | 4 | 5;

/** 对外暴露的颜色名。Agent 与人类都以颜色而非"面"来推理。 */
export type StickerColor = 'white' | 'yellow' | 'green' | 'blue' | 'red' | 'orange';

export const COLOR_OF_FACE: Readonly<Record<FaceId, StickerColor>> = {
  U: 'white',
  R: 'red',
  F: 'green',
  D: 'yellow',
  L: 'orange',
  B: 'blue',
};

export const COLOR_ID_OF_FACE: Readonly<Record<FaceId, ColorId>> = {
  U: 0,
  R: 1,
  F: 2,
  D: 3,
  L: 4,
  B: 5,
};

/** 转动量：1=顺时针 2=180° 3=逆时针 */
export type MoveAmount = 1 | 2 | 3;

/** 输入通道（PRD §13.4）：自由层/矩阵按钮都归 button，只有三值 */
export type InputChannel = 'keyboard' | 'button' | 'api';

/**
 * 引擎版本（PRD §13.3 `engine_version`）：随记录落盘，供 AC-50 的
 * 「旧版引擎回放提示」比对。语义版本 + 记法版本在展示层拼接。
 */
export const ENGINE_VERSION = 'ob-cube 0.1.0';

/** 转轴字母（与 engine 的 Axis 同构；契约层自带定义以保持零依赖） */
export type MoveAxis = 'x' | 'y' | 'z';

// ---------------------------------------------------------------------------
// 挑战状态机
// ---------------------------------------------------------------------------

export type ChallengeStatus =
  | 'idle' // 尚未创建挑战
  | 'ready' // 已生成题面，等待开始（蒙尘态，任何颜色数据不得外泄）
  | 'running'
  | 'paused' // 真暂停：计时冻结 + 输入屏蔽（v1.1，PRD §7.2.1）
  | 'solved_pending' // 已检测到还原，等待 submit_solution
  | 'ended_solved'
  | 'ended_timeout'
  | 'ended_move_limit'
  | 'ended_abandoned'
  | 'ended_invalid' // 连续提交失败达上限
  | 'ended_interrupted'; // 页面在 running/paused 中被关闭或刷新（PRD §7.3）

export const ENDED_STATUSES: readonly ChallengeStatus[] = [
  'ended_solved',
  'ended_timeout',
  'ended_move_limit',
  'ended_abandoned',
  'ended_invalid',
  'ended_interrupted',
];

export function isEnded(status: ChallengeStatus): boolean {
  return ENDED_STATUSES.includes(status);
}

// ---------------------------------------------------------------------------
// 观察
// ---------------------------------------------------------------------------

export type ObservationMode = 'full' | 'three_faces' | 'single_face' | 'after_move' | 'restricted';

export interface ViewState {
  up: FaceId;
  front: FaceId;
}

export interface AllowedActions {
  /** 本次观察下允许的记法形态，Agent 应只从这里取 */
  notation: readonly string[];
  /** 层索引可用范围，1-based，从被命名面算起 */
  layer_indices: readonly number[];
  /** 是否允许 rotate_view */
  can_rotate_view: boolean;
}

/** 一个面的贴纸布局，行 0 为该面正视时的上沿，列 0 为左沿 */
export type FaceGrid = StickerColor[][];

export interface Observation {
  challenge_id: string;
  cube_size: CubeSize;
  observation_id: string;
  view_orientation: ViewState;
  visible_faces: FaceId[];
  /** 只包含 visible_faces 中的面；未授权面在此处不出现，而不是出现后置空 */
  face_colors: Partial<Record<FaceId, FaceGrid>>;
  allowed_actions: AllowedActions;
  elapsed_ms: number;
  remaining_ms: number | null;
  move_count: number;
  status: ChallengeStatus;
}

// ---------------------------------------------------------------------------
// 操作结果
// ---------------------------------------------------------------------------

/**
 * 180° 双击归并窗口（PRD §5.3.1 / §5.4）。
 * 输入整形必须早于定稿：窗口内第二次同向 90° 才能折成一条 X2，
 * 因此计步与「步数耗尽」判定都要等窗口关闭（见 session.commit 的 deferLimit）。
 */
export const MERGE_WINDOW_MS = 300;

export interface MoveResult {
  op_id: string | null;
  deduplicated: boolean;
  move: string;
  /** 本次转动涉及的层数（AC-22 / AC-42） */
  layer_count: number;
  /** 90 | 180（AC-42：归并出的 X2 是 180） */
  turn_amount: 90 | 180;
  /** 转轴与层索引集合（AC-22：与 layer_count/turn_amount 同源，自 move 记法派生） */
  axis: MoveAxis;
  layer_set: readonly number[];
  /**
   * 操作后的状态指纹。`observation_mode !== 'full'` 时恒为 null（PRD §8.6：
   * 2 阶状态空间可枚举，返回指纹等于交出隐藏面）。键恒存在，不得省略。
   */
  state_fingerprint_after: string | null;
  move_count: number;
  elapsed_ms: number;
  remaining_ms: number | null;
  solved: boolean;
  /**
   * 执行后的最新观察。Agent 不需要再单独调 observe 即可继续决策。
   * `restricted` 预算用尽、或 `after_move` 档本次已交付过观察时为 `null`——
   * 此时不得再携带任何新颜色（PRD §8.2 C6：观察一次即交付一份快照）。键恒存在。
   */
  next_observation: Observation | null;
}

export interface Progress {
  status: ChallengeStatus;
  move_count: number;
  elapsed_ms: number;
  remaining_ms: number | null;
  move_limit: number | null;
  is_solved: boolean;
  /** 严格档 after_move 下，当前是否已允许观察 */
  observation_allowed: boolean;
}

export interface SubmitResult {
  accepted: boolean;
  status: ChallengeStatus;
  reason: string | null;
  /** 未还原时给出人可读的差距描述，用于评测平台的"实际错在哪" */
  mismatch: {
    faces_wrong: FaceId[];
    sticker_count_wrong: number;
  } | null;
}

// ---------------------------------------------------------------------------
// 挑战规则与结果
// ---------------------------------------------------------------------------

export type ScrambleMethod = 'random_moves' | 'seeded_moves';

export interface ChallengeRules {
  challenge_id: string;
  run_id: string;
  puzzle_id: string;
  cube_size: CubeSize;
  scramble_method: ScrambleMethod;
  scramble_length: number;
  /** 可复现四件套之一（PRD §13.1）：题目生成算法版本，如 "g1" */
  gen_version: string;
  seed: string | null;
  time_limit_ms: number | null;
  move_limit: number | null;
  observation_mode: ObservationMode;
  dust_mode: boolean;
  /** 固定为 HTM，不可在挑战中切换 */
  metric: 'HTM';
  created_at: string;
  notation_version: 'ss-2';
}

export interface RunEvent {
  seq: number;
  type: 'move' | 'view' | 'start' | 'pause' | 'resume' | 'submit' | 'end';
  at_ms: number;
  move: string | null;
  observation_id: string | null;
  from_fingerprint: string | null;
  to_fingerprint: string | null;
  ok: boolean;
  error_code: string | null;
  /** 180° 双击归并时记录来源事件 */
  merged_from: string[] | null;
  /**
   * 转轴。move 事件 = 被转动的轴；view 事件 = 相对视角旋转所绕的轴
   * （绝对 rotateView 无单轴语义时为 null）。非 move/view 事件为 null。
   */
  axis: MoveAxis | null;
  /** AC-22：move 事件携带的四字段（非 move 事件为 null；旧记录可能缺键） */
  layer_set: readonly number[] | null;
  layer_count: number | null;
  turn_amount: 90 | 180 | null;
  /** PRD §13.4 / AC-31：输入通道；非 move 事件为 null */
  input_channel: InputChannel | null;
  /** 调用方原始记法；归并事件为 null（来源见 merged_from） */
  raw_input: string | null;
  /** AC-67：相对视角旋转的方向（stepView）；绝对 rotateView 时为 null */
  direction: 'left' | 'right' | 'up' | 'down' | null;
  /** AC-67：相对视角旋转的步数（stepView 恒为 1）；绝对 rotateView 时为 null */
  steps: number | null;
  /**
   * AC-43 / 07-agent-api §7.5：本次操作所依据的观察。
   * 调用方（Agent）声明 `based_on_observation_id` 时原样落库；未声明时 =
   * 事件生成时刻的当前观察 id（即"默认依据上一条交付的观察"）。
   * 它是事件字段而非 `applyMove` 返回值字段——AC-42 的 13 字段不含根级 id。
   */
  based_on_observation_id: string | null;
  /**
   * AC-67 / 观察者回放：view 事件执行后的完整朝向 `{up, front}`。
   * 回放必须按事件逐步恢复当时的视野，不能用结束时的朝向倒推；
   * 非 view 事件为 null（旧记录缺此键时回放退化为当前朝向）。
   */
  view_after: ViewState | null;
}

export interface ChallengeResult {
  rules: ChallengeRules;
  status: ChallengeStatus;
  solved: boolean;
  move_count: number;
  elapsed_ms: number;
  tps: number;
  events: RunEvent[];
  initial_fingerprint: string;
  final_fingerprint: string;
  ended_reason: string | null;
  /** v1.1（AC-59）：暂停口径显式进结果，跨运行对比可见 */
  pause_count: number;
  paused_total_ms: number;
  /** PRD §13.3 / AC-50：随记录落盘，供旧引擎回放兼容性比对 */
  engine_version: string;
  /** PRD §13.3 / AC-49：HTM-layer 口径（Σ layer_count），随记录落盘 */
  htm_layer_count: number;
  /** PRD §13.3 / AC-49：QTM 口径（180° 计 2 步），随记录落盘 */
  qtm_count: number;
  /**
   * PRD §7.2 派生计时指标（v2.0 P1）：全部由事件流与计时字段派生，
   * 不改变记录格式；旧记录缺键时按 null / 0 处理。
   */
  wall_elapsed_ms?: number;
  first_move_ms?: number | null;
  solved_at_ms?: number | null;
  submit_ms?: number | null;
  /** PRD §10.4：事件数超过 2000 条时置 true，表示 view 事件被优先丢弃 */
  events_truncated?: boolean;
  /** PRD §10.4：本次落盘丢弃的事件条数（含被优先丢弃的 view 事件） */
  events_dropped?: number;
  /**
   * PRD §13.1 可复现四件套：原始打乱序列 + 生成算法版本 + 记法版本 + 初始指纹。
   * **只在挑战结束后由 `getChallengeResult()` 返回**——未结束前交出它等于交出题面
   * （PRD §8.2 C3/C4）。历史记录据此重建题面，不再依赖"同一版生成器"。
   */
  scramble?: readonly string[];
  scramble_fingerprint?: string;
  gen_algorithm_version?: number;
}

// ---------------------------------------------------------------------------
// 错误
// ---------------------------------------------------------------------------

export const ERROR_CODES = [
  'E_NO_ACTIVE_CHALLENGE',
  'E_CHALLENGE_NOT_STARTED',
  'E_CHALLENGE_ENDED',
  'E_CHALLENGE_PAUSED',
  'E_CUBE_ALREADY_SOLVED',
  'E_DEADLINE_EXCEEDED',
  'E_MOVE_LIMIT_REACHED',
  'E_NOT_SOLVED',
  'E_NOTATION_MALFORMED',
  'E_NOTATION_LOWERCASE',
  'E_NOTATION_MULTIPLE_MOVES',
  'E_NOTATION_ORIENTATION_NOT_MOVABLE',
  'E_MOVE_LAYER_OUT_OF_RANGE',
  'E_MOVE_COVERS_ALL_LAYERS',
  'E_SLICE_NOT_AVAILABLE',
  'E_STALE_OBSERVATION',
  'E_OBSERVATION_REQUIRES_MOVE',
  'E_OBSERVATION_BUDGET_EXHAUSTED',
  'E_VIEW_ORIENTATION_INVALID',
  'E_VIEW_FACE_UNKNOWN',
  'E_OP_ID_NOT_FOUND',
  'E_OP_ID_CONFLICT',
  'E_RUN_NOT_FINISHED',
  'E_RUN_NOT_FOUND',
  'E_REPRODUCTION_MISMATCH',
  // PRD AC-44 / §12.1：单帧内 applyMove 超过 60 次必须拒绝（无前缀短名 RATE_LIMITED）。
  'E_RATE_LIMITED',
  'E_STORAGE_FULL',
  'E_SEED_OUT_OF_RANGE',
  'E_SEED_INVALID',
  'E_INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class CubeError extends Error {
  readonly code: ErrorCode;
  readonly hint: string;

  constructor(code: ErrorCode, message: string, hint = '') {
    super(message);
    this.name = 'CubeError';
    this.code = code;
    this.hint = hint;
  }
}

export function isCubeError(e: unknown): e is CubeError {
  return e instanceof CubeError;
}

// ---------------------------------------------------------------------------
// 引擎侧最小公开面（界面组只需要这些）
// ---------------------------------------------------------------------------

/** 已还原判定：六面各自单色。4 阶整体朝向不唯一是定义，不是妥协。 */
export type Fingerprint = string;

export interface CubeStateView {
  readonly size: CubeSize;
  /** 长度 6·N²，slot = faceIndex·N² + row·N + col */
  readonly slots: Uint8Array;
}
