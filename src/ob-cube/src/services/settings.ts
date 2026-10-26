/**
 * settings.ts —— 用户设置的唯一读写口（storage 之上的一层，UI 不直接碰 storage）
 */

import type { CubeSize, ObservationMode } from '../contracts';
import type { LocalStore } from './storage';

/** 挑战配置（PRD §2.2 配置表）。参与者/蒙尘以外的字段改动 = 换一道题。 */
export interface ChallengeConfig {
  /** 秒。null = 不限时（v1.9 默认） */
  readonly timeLimitSec: number | null;
  /** null = 不限步 */
  readonly moveLimit: number | null;
  /** true = ready 态遮蔽；false = 预观察模式（先看再开始） */
  readonly dustMode: boolean;
  /** 人类 = 隐藏 Agent 面板；agent = 显示 */
  readonly participant: 'human' | 'agent';
  readonly puzzleSource: 'random' | 'seed' | 'preset';
  /** puzzleSource='seed' 时生效，1–32 字符 */
  readonly seedText: string;
  /** puzzleSource='preset' 时生效，内置题库条目 id */
  readonly presetId: string | null;
  /** F14 观察模式（PRD §8.2 C6）。默认 full */
  readonly observationMode: ObservationMode;
}

export interface AppSettings {
  readonly cubeSize: CubeSize;
  /** 挑战配置（v1.9）：跨会话保留，URL 参数可覆盖 */
  readonly challenge: ChallengeConfig;
  /** 迷你键位图折叠状态（UIUX §5.2：折叠状态写入 localStorage） */
  readonly keymapCollapsed: boolean;
  /** P2 开关：每张贴纸标字母 */
  readonly stickerLabels: boolean;
  /** P2 开关：单色模式 */
  readonly monoMode: boolean;
  /** 是否启用 300ms 双击归并 180°（PRD §5.4 缓解手段①，默认开启） */
  readonly mergeDoubleTap: boolean;
  readonly autoSubmitOnSolved: boolean;
  /** PRD §11.1：本地使用统计（仅存本机、不外发），默认开 */
  readonly telemetryEnabled: boolean;
}

export const DEFAULT_CHALLENGE_CONFIG: ChallengeConfig = {
  timeLimitSec: null,
  moveLimit: null,
  dustMode: false,
  participant: 'human',
  puzzleSource: 'random',
  seedText: '',
  presetId: null,
  observationMode: 'full',
};

export const DEFAULT_SETTINGS: AppSettings = {
  cubeSize: 3,
  challenge: DEFAULT_CHALLENGE_CONFIG,
  keymapCollapsed: false,
  stickerLabels: false,
  monoMode: false,
  mergeDoubleTap: true,
  // AC-79：默认 false，人类与 Agent 相同；接线前不得有代码路径据此自动结算。
  autoSubmitOnSolved: false,
  telemetryEnabled: true,
};

const TIME_LIMIT_BOUNDS = { minSec: 10, maxSec: 180 * 60 } as const;
const SEED_MAX_LEN = 32;

export function isLegalTimeLimitSec(sec: number): boolean {
  return Number.isInteger(sec) && sec >= TIME_LIMIT_BOUNDS.minSec && sec <= TIME_LIMIT_BOUNDS.maxSec;
}

export function isLegalMoveLimit(moves: number): boolean {
  return Number.isInteger(moves) && moves >= 1;
}

export function isLegalSeedText(seed: string): boolean {
  return seed.length >= 1 && seed.length <= SEED_MAX_LEN;
}

const OBSERVATION_MODES: readonly ObservationMode[] = [
  'full',
  'three_faces',
  'single_face',
  'after_move',
  'restricted',
];

export function isObservationMode(value: unknown): value is ObservationMode {
  return typeof value === 'string' && (OBSERVATION_MODES as readonly string[]).includes(value);
}

function coerceChallenge(input: unknown): { value: ChallengeConfig; repaired: boolean } {
  const fallback = DEFAULT_CHALLENGE_CONFIG;
  if (typeof input !== 'object' || input === null) return { value: fallback, repaired: true };
  const raw = input as Record<string, unknown>;
  let repaired = false;
  const timeLimitSec =
    typeof raw.timeLimitSec === 'number' && isLegalTimeLimitSec(raw.timeLimitSec)
      ? raw.timeLimitSec
      : raw.timeLimitSec === null
        ? null
        : fallback.timeLimitSec;
  if (raw.timeLimitSec !== undefined && timeLimitSec !== raw.timeLimitSec) repaired = true;
  const moveLimit =
    typeof raw.moveLimit === 'number' && isLegalMoveLimit(raw.moveLimit)
      ? raw.moveLimit
      : raw.moveLimit === null
        ? null
        : fallback.moveLimit;
  if (raw.moveLimit !== undefined && moveLimit !== raw.moveLimit) repaired = true;
  const seedText =
    typeof raw.seedText === 'string' && isLegalSeedText(raw.seedText) ? raw.seedText : fallback.seedText;
  if (raw.seedText !== undefined && seedText !== raw.seedText) repaired = true;
  const value: ChallengeConfig = {
    timeLimitSec,
    moveLimit,
    dustMode: typeof raw.dustMode === 'boolean' ? raw.dustMode : fallback.dustMode,
    participant: raw.participant === 'agent' ? 'agent' : 'human',
    puzzleSource:
      raw.puzzleSource === 'seed' || raw.puzzleSource === 'preset' ? raw.puzzleSource : 'random',
    seedText,
    presetId: typeof raw.presetId === 'string' ? raw.presetId : null,
    observationMode: isObservationMode(raw.observationMode) ? raw.observationMode : fallback.observationMode,
  };
  if (value !== fallback && (typeof raw.dustMode !== 'boolean')) repaired = true;
  return { value, repaired };
}

const KEY = 'settings';

function isCubeSize(value: unknown): value is CubeSize {
  return value === 2 || value === 3 || value === 4;
}

/** 逐字段校验：任何一个字段坏掉都只回落该字段，不整份丢弃 */
export function coerceSettings(input: unknown): { settings: AppSettings; repaired: boolean } {
  if (typeof input !== 'object' || input === null) {
    return { settings: DEFAULT_SETTINGS, repaired: true };
  }
  const raw = input as Record<string, unknown>;
  let repaired = false;
  const pick = <K extends keyof AppSettings>(key: K, valid: (v: unknown) => boolean): AppSettings[K] => {
    const value = raw[key as string];
    if (valid(value)) return value as AppSettings[K];
    if (value !== undefined) repaired = true;
    return DEFAULT_SETTINGS[key];
  };
  const settings: AppSettings = {
    cubeSize: pick('cubeSize', isCubeSize),
    challenge: coerceChallenge(raw.challenge).value,
    keymapCollapsed: pick('keymapCollapsed', (v) => typeof v === 'boolean'),
    stickerLabels: pick('stickerLabels', (v) => typeof v === 'boolean'),
    monoMode: pick('monoMode', (v) => typeof v === 'boolean'),
    mergeDoubleTap: pick('mergeDoubleTap', (v) => typeof v === 'boolean'),
    autoSubmitOnSolved: pick('autoSubmitOnSolved', (v) => typeof v === 'boolean'),
    telemetryEnabled: pick('telemetryEnabled', (v) => typeof v === 'boolean'),
  };
  return { settings, repaired };
}

/** 时限合法区间的展示用常量（配置面板就地校验文案用） */
export const TIME_LIMIT_RANGE = TIME_LIMIT_BOUNDS;

export class SettingsService {
  private current: AppSettings = DEFAULT_SETTINGS;
  private lastError: string | null = null;

  constructor(private readonly store: LocalStore) {
    this.reload();
  }

  get(): AppSettings {
    return this.current;
  }

  /** 最近一次写入失败的提示；null 表示正常 */
  getError(): string | null {
    return this.lastError;
  }

  reload(): AppSettings {
    const read = this.store.readJson<unknown>(KEY);
    if (!read.ok) {
      this.current = read.reason === 'corrupt' ? DEFAULT_SETTINGS : this.current;
      return this.current;
    }
    this.current = coerceSettings(read.value).settings;
    return this.current;
  }

  patch(patch: Partial<AppSettings>): AppSettings {
    this.current = { ...this.current, ...patch };
    try {
      this.store.writeJson(KEY, this.current);
      this.lastError = null;
    } catch (error) {
      // 设置写不进去不影响本次会话，但必须留下可见痕迹
      this.lastError = error instanceof Error ? error.message : '设置未能保存';
    }
    return this.current;
  }
}
