/**
 * presets.ts —— 内置题库（PRD §2.2「固定题目」的最小实现，v1.9 提前落地）。
 *
 * 每条预设 = 一个锚定 seed：同一 id 恒得同一题面（走 createPuzzle 的既有
 * seed→PRNG→打乱链路），可复现、可分享。难度标签是人工标注（difficulty.basis='manual'），
 * 不是求解器估算——文案不得写成"XX 难度"以外的量化承诺。
 */

import type { CubeSize } from '../contracts';

export interface PresetPuzzle {
  readonly id: string;
  readonly label: string;
  readonly size: CubeSize;
  readonly seed: string;
  readonly note: string;
}

export const PRESETS: readonly PresetPuzzle[] = [
  { id: 'p2-a', label: '2 阶 · 热身 A', size: 2, seed: 'preset-2a', note: '短打乱，适合熟悉键位' },
  { id: 'p2-b', label: '2 阶 · 热身 B', size: 2, seed: 'preset-2b', note: '短打乱，另一题' },
  { id: 'p3-a', label: '3 阶 · 入门 A', size: 3, seed: 'preset-3a', note: '标准长度随机打乱' },
  { id: 'p3-b', label: '3 阶 · 进阶 B', size: 3, seed: 'preset-3b', note: '标准长度随机打乱' },
  { id: 'p4-a', label: '4 阶 · 入门 A', size: 4, seed: 'preset-4a', note: '4 阶标准打乱' },
  { id: 'p4-b', label: '4 阶 · 进阶 B', size: 4, seed: 'preset-4b', note: '4 阶标准打乱' },
];

export function presetById(id: string | null): PresetPuzzle | null {
  if (id === null) return null;
  return PRESETS.find((p) => p.id === id) ?? null;
}

export function presetOptions(): readonly { id: string; label: string }[] {
  return PRESETS.map((p) => ({ id: p.id, label: `${p.label}（seed ${p.seed}）` }));
}
