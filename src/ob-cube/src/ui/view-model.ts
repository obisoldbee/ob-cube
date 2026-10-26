/**
 * view-model.ts —— 界面层的只读视图模型
 *
 * 这些类型是「渲染所需的最小事实集合」，由第二阶段 wiring 从引擎/挑战层投影而来。
 * 面板只接收它们，不 import engine/challenge 的任何内部模块。
 */

import type {
  ChallengeStatus,
  CubeSize,
  FaceGrid,
  FaceId,
  ObservationMode,
  RunEvent,
  SubmitResult,
} from '../contracts';

export interface ChallengeView {
  readonly size: CubeSize;
  readonly challengeId: string | null;
  readonly status: ChallengeStatus;
  readonly elapsedMs: number;
  readonly remainingMs: number | null;
  readonly timeLimitMs: number | null;
  readonly moveCount: number;
  readonly moveLimit: number | null;
  readonly tps: number;
  /** 还原已达成但尚未提交（PRD §7.4 独立状态） */
  readonly solvedPending: boolean;
  /** 连续提交失败的剩余机会（PRD §7.3：3 次终止） */
  readonly attemptsLeft: number;
  readonly firstMoveMs: number | null;
  readonly observationMode: ObservationMode;
  readonly dustMode: boolean;
  /** v1.9（AC-58）：agent 模式不渲染暂停按钮（暂停仅人类可用，PRD §7.2.1 P4'） */
  readonly participant: 'human' | 'agent';
  readonly scrambleMethod: 'random_moves' | 'seeded_moves';
  readonly seed: string | null;
  readonly difficultyScore: number | null;
  readonly difficultyLabel: string | null;
}

/** 左栏「挑战配置」面板的视图模型（v1.9）。canEdit=false 时控件整体禁用。 */
export interface ConfigView {
  readonly canEdit: boolean;
  readonly timeLimitSec: number | null;
  readonly moveLimit: number | null;
  readonly dustMode: boolean;
  /** F14 观察模式（PRD §8.2 C6）；默认 full */
  readonly observationMode: ObservationMode;
  readonly participant: 'human' | 'agent';
  /** PRD §11.1：本地使用统计开关（仅存本机、不外发） */
  readonly telemetryEnabled: boolean;
  /** PRD §11 可访问性（P2）：单色高对比配色 */
  readonly monoMode: boolean;
  readonly puzzleSource: 'random' | 'seed' | 'preset';
  readonly seedText: string;
  readonly presetId: string | null;
  /** 内置题库条目（wiring 从 puzzle 层投影进来，ui 不直接依赖 puzzle） */
  readonly presets: readonly { id: string; label: string }[];
  /** 非法输入的就地原因文案；null = 合法（UIUX：不用弹窗报校验错） */
  readonly validation: string | null;
}

export interface ObservationView {
  /** 已授权面 → 贴纸网格；未授权面在此处不出现（而不是出现后置空） */
  readonly faceColors: Partial<Record<FaceId, FaceGrid>>;
  readonly locked: boolean;
  /** 锁定原因（未开始 / 已暂停），驱动锁定态提示文案；未锁定为 null */
  readonly lockReason: 'not-started' | 'paused' | null;
  readonly observationId: string | null;
  readonly visibleFaces: readonly FaceId[];
}

export interface LogRow {
  readonly seq: number;
  readonly move: string;
  readonly elapsedMs: number;
  readonly ok: boolean;
  readonly errorCode: string | null;
  readonly mergedFrom: readonly string[] | null;
}

export interface AgentView {
  readonly state: 'idle' | 'ready' | 'busy' | 'stale' | 'offline';
  readonly statusText: string;
  readonly callCount: number | null;
  readonly observeCount: number | null;
  readonly moveCount: number | null;
  readonly avgStepMs: number | null;
  readonly lastHeartbeat: string | null;
  readonly lastObservationId: string | null;
  readonly progressActive: boolean;
}

export interface ResultView {
  readonly status: ChallengeStatus;
  /** PRD §7.3 的 `interrupted`：页面在运行中被关闭或刷新，记录可能缺尾部事件 */
  readonly interrupted: boolean;
  readonly solved: boolean;
  readonly moveCount: number;
  readonly elapsedMs: number;
  readonly tps: number;
  readonly firstMoveMs: number | null;
  readonly mismatchStickers: number | null;
  /** 题面初始状态指纹（§9.1「复制题面指纹」的唯一数据源） */
  readonly fingerprint: string | null;
  readonly events: readonly RunEvent[];
  readonly attemptsLeft: number;
  /** 参与者（v1.9）：结果页"操作者"行的数据来源 */
  readonly participant: 'human' | 'agent';
  readonly rules: {
    readonly cubeSize: CubeSize;
    readonly challengeId: string;
    readonly seed: string | null;
    readonly scrambleMethod: 'random_moves' | 'seeded_moves';
    readonly observationMode: ObservationMode;
    readonly dustMode: boolean;
    readonly timeLimitMs: number | null;
    readonly moveLimit: number | null;
  };
  readonly startedAt: string | null;
  readonly engineVersion: string;
  readonly submit: SubmitResult | null;
  /** 同题面历史中位耗时，用于指标格下方的对比参照句（无历史时为 null，整行不渲染） */
  readonly compareElapsedMs: number | null;
  /** F17：启发式难度估计（非最短解距离，AC-52 的标注不可关闭） */
  readonly difficultyScore: number | null;
  readonly difficultyLabel: string | null;
  /** v1.1（AC-59）：暂停口径摘要 */
  readonly pauseCount: number;
  readonly pausedTotalMs: number;
  /**
   * 三种计步口径（AC-49 / PRD §7.1）：
   * htm = 每条已定稿转动事件计 1 步（平台主口径，等于 moveCount）；
   * htmLayer = 每层各计 1 步（Σ layer_count）；qtm = 180° 计 2 步。
   */
  readonly metrics: { readonly htm: number; readonly htmLayer: number; readonly qtm: number };
}

/** F11：历史运行摘要行（PRD §2.2 步骤 1「最近 5 条」） */
export interface HistoryRowView {
  readonly runId: string;
  readonly resultLabel: string;
  readonly solved: boolean;
  readonly sizeText: string;
  readonly moveText: string;
  readonly elapsedText: string;
  readonly savedAtText: string;
}

export interface HistoryView {
  readonly rows: readonly HistoryRowView[];
  /** §9.3：损坏记录只提示与处置，不静默丢弃 */
  readonly corrupt: readonly { readonly id: string }[];
  readonly canPersist: boolean;
}

/** F09b：回放三视角（PRD §10.3） */
export type ReplayViewMode = 'god' | 'observer' | 'verify';

export interface ReplayView {
  readonly totalSteps: number;
  readonly currentStep: number;
  readonly elapsedMs: number;
  readonly playing: boolean;
  /** 0.5 / 1 / 2 / 4 */
  readonly speed: number;
  readonly mode: ReplayViewMode;
  /** AC-50：记录由旧版引擎生成时必须先确认才播放 */
  readonly versionMismatch: boolean;
  /** AC-50：用户已确认仍要回放 */
  readonly versionConfirmed: boolean;
  /** 校验视角：当前步的 6 面颜色矩阵与发生变化的那些面 */
  readonly grids: readonly { readonly face: FaceId; readonly grid: FaceGrid }[];
  readonly changedFaces: readonly FaceId[];
}
