/**
 * 题面：生成、指纹、复现（ARCHITECTURE §6.3 ~ §6.6）。
 *
 * 复现方式的裁决：**保存打乱序列重放 + 最终状态指纹作校验位**，不保存状态快照。
 * 理由：快照解决不了观察问题（观察权限、事件日志、回放都需要从已还原状态逐步推演）。
 * 重放后指纹不一致时**不得静默继续**，必须报 E_REPRODUCTION_MISMATCH——让语义漂移
 * 变成一个可见的错误，而不是一个悄悄变难的题目。
 */
import { CubeError } from '../contracts';
import type { CubeSize } from '../contracts';
import { applyMove, createSolvedState, fingerprintState, parseMove } from '../engine';
import type { CubeState } from '../engine';
import { fp32 } from '../shared';
import { DEFAULT_SCRAMBLE_LENGTH, FILTER_POLICY, generateScramble } from './scramble';
import { normalizeSeed } from './seed';

export const NOTATION_VERSION = 'ss-2';
export const ALGORITHM_VERSION = 1;
export const SCHEMA_VERSION = 1;

export type DifficultyLabel =
  | 'intro'
  | 'standard'
  | 'hard'
  | 'structured'
  | 'long-scramble'
  | 'observation-focus'
  | 'timed'
  | 'dust';

export interface PuzzleGeneration {
  /** v1 只产出 'random-walk' */
  readonly mode: 'random-walk' | 'imported';
  /** 恒为 false：v1 是随机操作打乱，不是随机状态生成 */
  readonly uniform_random_state: false;
  readonly filter_policy: typeof FILTER_POLICY;
  readonly algorithm_version: number;
}

export interface PuzzleRecord {
  readonly schema_version: number;
  readonly challenge_id: string;
  readonly cube_size: CubeSize;
  readonly generation: PuzzleGeneration;
  readonly seed_text: string | null;
  readonly seed_u32_hex: string | null;
  readonly scramble_length: number;
  /** 归一化后的单步记法数组——复现的唯一依据 */
  readonly scramble: readonly string[];
  readonly scramble_fingerprint: string;
  readonly initial_state_fingerprint: string;
  readonly notation_version: string;
  readonly difficulty: {
    readonly label: DifficultyLabel;
    /** v1 只有人工标注，不做自动分级 */
    readonly basis: 'manual';
    readonly note: string | null;
  };
  readonly created_at: string;
}

export function canonicalPuzzleKey(
  size: CubeSize,
  seedHex: string,
  scrambleLength: number,
  mode: PuzzleGeneration['mode'],
  filterPolicy: string,
): string {
  return `v1|n=${size}|seed=${seedHex}|len=${scrambleLength}|gen=${mode}|filter=${filterPolicy}`;
}

/** challengeId = "c" + N + "-g" + version + "-" + fp32(canonical) */
export function buildChallengeId(
  size: CubeSize,
  seedHex: string,
  scrambleLength: number,
  mode: PuzzleGeneration['mode'] = 'random-walk',
  filterPolicy: string = FILTER_POLICY,
  generatorVersion: number = ALGORITHM_VERSION,
): string {
  return `c${size}-g${generatorVersion}-${fp32(canonicalPuzzleKey(size, seedHex, scrambleLength, mode, filterPolicy))}`;
}

export interface CreatePuzzleParams {
  readonly size: CubeSize;
  /** 熵由调用方注入（UI 用 Date.now() 之类）；puzzle 层本身不读时钟、不用 Math.random */
  readonly seed: number | string;
  readonly scrambleLength?: number;
  /** ISO 时间串，同样由调用方提供 */
  readonly createdAt: string;
  readonly difficultyLabel?: DifficultyLabel;
  readonly difficultyNote?: string | null;
}

/** 从已还原状态重放打乱序列，得到初始局面。 */
export function replayScramble(size: CubeSize, scramble: readonly string[]): CubeState {
  let state = createSolvedState(size);
  for (const notation of scramble) {
    state = applyMove(state, parseMove(notation, size));
  }
  return state;
}

export function createPuzzle(params: CreatePuzzleParams): PuzzleRecord {
  const { size, createdAt } = params;
  const length = params.scrambleLength ?? DEFAULT_SCRAMBLE_LENGTH[size];
  const seed = normalizeSeed(params.seed);
  const scramble = generateScramble(size, seed.seed32, length);
  const state = replayScramble(size, scramble);

  return {
    schema_version: SCHEMA_VERSION,
    challenge_id: buildChallengeId(size, seed.hex, length),
    cube_size: size,
    generation: {
      mode: 'random-walk',
      uniform_random_state: false,
      filter_policy: FILTER_POLICY,
      algorithm_version: ALGORITHM_VERSION,
    },
    seed_text: seed.text,
    seed_u32_hex: seed.hex,
    scramble_length: length,
    scramble,
    scramble_fingerprint: fp32(scramble.join(' ')),
    initial_state_fingerprint: fingerprintState(state),
    notation_version: NOTATION_VERSION,
    difficulty: {
      label: params.difficultyLabel ?? 'standard',
      basis: 'manual',
      note: params.difficultyNote ?? null,
    },
    created_at: createdAt,
  };
}

export interface Reproduction {
  readonly state: CubeState;
  readonly fingerprint: string;
}

/**
 * 重放记录里的打乱序列，并与记录的初始指纹逐字比对。
 * 不一致 → E_REPRODUCTION_MISMATCH（不得静默继续）。
 */
export function reproducePuzzle(record: PuzzleRecord): Reproduction {
  const state = replayScramble(record.cube_size, record.scramble);
  const fingerprint = fingerprintState(state);
  if (fingerprint !== record.initial_state_fingerprint) {
    throw new CubeError(
      'E_REPRODUCTION_MISMATCH',
      '该题面由旧版本算法生成，当前版本无法保证一致',
      `重放指纹 ${fingerprint} 与记录指纹 ${record.initial_state_fingerprint} 不符；换一道题，不要在本局继续`,
    );
  }
  return { state, fingerprint };
}
