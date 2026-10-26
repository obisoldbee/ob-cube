/**
 * difficulty.ts —— 难度启发式估计（PRD §6.2 / §6.3，F17）
 *
 * 口径真源是 `docs/specs/prd/04-scoring-judging.md` §6.2：
 *   difficulty_score = S + K + O + C
 *   K = 0.8·dF + 1.2·pW + 0.5·(nE/10)
 *
 * 本模块只做**启发式估计**，不是最短解距离。结果页必须同时显示
 * "难度为启发式估计，非最短解距离"（AC-52），本模块的返回值因此带
 * `distanceIsEstimated: true`，不允许被展示层丢掉。
 */

import type { CubeSize, ObservationMode } from '../contracts';
import { parseMove } from '../engine';
import type { MoveSpec } from '../engine';
import type { PuzzleRecord } from './puzzle';

export type DifficultyLevel = '入门' | '常规' | '高难度';
export type DifficultyTag = '长序列' | '专项观察' | '限时' | '蒙尘';

export interface DifficultyInput {
  readonly scramble: readonly string[];
  readonly size: CubeSize;
  readonly observationMode: ObservationMode;
  readonly dustMode: boolean;
  readonly timeLimitMs: number | null;
}

export interface DifficultyEstimate {
  readonly score: number;
  readonly level: DifficultyLevel;
  readonly tags: readonly DifficultyTag[];
  /** 无求解器：以净有效步数作为最短解距离的代理 */
  readonly estimatedDistance: number;
  readonly distanceIsEstimated: true;
}

const SCALE: Readonly<Record<CubeSize, number>> = { 2: 1.0, 3: 2.5, 4: 4.0 };
const OBSERVATION_COST: Readonly<Record<ObservationMode, number>> = {
  full: 0,
  three_faces: 1.0,
  single_face: 2.0,
  after_move: 1.5,
  restricted: 2.5,
};
const LONG_SCRAMBLE_THRESHOLD: Readonly<Record<CubeSize, number>> = { 2: 30, 3: 25, 4: 45 };
const NET_CAP = 40;
const SECONDS_PER_MOVE = 2.0;

/** 切片记法跟随的参考面（与 expressing 层 SLICE_REF_FACE 一致） */
const SLICE_REF: Readonly<Record<string, string>> = { M: 'L', E: 'D', S: 'F' };

function pivotFace(spec: MoveSpec): string | null {
  if (spec.pivot === null) return null;
  if (spec.pivot === 'M' || spec.pivot === 'E' || spec.pivot === 'S') {
    return SLICE_REF[spec.pivot] ?? null;
  }
  return spec.pivot;
}

function isWideOrInner(spec: MoveSpec): boolean {
  return spec.wide || spec.rangeForm || !spec.layerIndices.includes(1);
}

/**
 * 净有效步数：相邻同轴同层、且转向可抵消的两步合并。
 * 这不是求解，也不承诺最优；只用于避免「10 步里 8 步自我抵消」仍被算作高复杂度。
 */
function netEffectiveMoves(specs: readonly MoveSpec[]): number {
  const stack: { spec: MoveSpec; turns: number }[] = [];
  for (const spec of specs) {
    const top = stack[stack.length - 1];
    const same =
      top !== undefined &&
      top.spec.axis === spec.axis &&
      top.spec.layerSet.length === spec.layerSet.length &&
      top.spec.layerSet.every((layer, i) => layer === spec.layerSet[i]);
    if (same) {
      const merged = (top.turns + spec.quarterTurns) % 4;
      if (merged === 0) stack.pop();
      else top.turns = merged;
      continue;
    }
    stack.push({ spec, turns: spec.quarterTurns });
  }
  return stack.length;
}

export function estimateDifficulty(input: DifficultyInput): DifficultyEstimate {
  const specs = input.scramble.map((move) => parseMove(move, input.size));
  const dF = new Set(specs.map(pivotFace).filter((face): face is string => face !== null)).size;
  const wideCount = specs.reduce((sum, spec) => sum + (isWideOrInner(spec) ? 1 : 0), 0);
  const pW = specs.length === 0 ? 0 : wideCount / specs.length;
  const nE = Math.min(NET_CAP, netEffectiveMoves(specs));

  const S = SCALE[input.size];
  const K = 0.8 * dF + 1.2 * pW + 0.5 * (nE / 10);
  const O = OBSERVATION_COST[input.observationMode];
  const timePressure =
    input.timeLimitMs === null || input.timeLimitMs <= 0
      ? 0
      : Math.min(2, Math.max(0, (nE * SECONDS_PER_MOVE * 1000) / input.timeLimitMs));
  const C = (input.dustMode ? 1.5 : 0) + timePressure;
  const score = S + K + O + C;

  const level: DifficultyLevel =
    score < 3.0 && O === 0 && C < 0.5 ? '入门' : score < 5.5 ? '常规' : '高难度';

  const tags: DifficultyTag[] = [];
  if (input.scramble.length >= LONG_SCRAMBLE_THRESHOLD[input.size] && nE >= 0.6 * input.scramble.length) {
    tags.push('长序列');
  }
  if (O >= 1.0) tags.push('专项观察');
  if (timePressure >= 1.0) tags.push('限时');
  if (input.dustMode) tags.push('蒙尘');

  return {
    score: Math.round(score * 100) / 100,
    level,
    tags,
    estimatedDistance: nE,
    distanceIsEstimated: true,
  };
}

/** 从题面记录直接估算（wiring 的便捷入口，避免每帧重算配置拼装） */
export function estimatePuzzleDifficulty(
  record: PuzzleRecord,
  rules: {
    observationMode: ObservationMode;
    dustMode: boolean;
    timeLimitMs: number | null;
  },
): DifficultyEstimate {
  return estimateDifficulty({
    scramble: record.scramble,
    size: record.cube_size,
    observationMode: rules.observationMode,
    dustMode: rules.dustMode,
    timeLimitMs: rules.timeLimitMs,
  });
}
