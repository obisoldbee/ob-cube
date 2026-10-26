/**
 * mulberry32 + 域分离（ARCHITECTURE §6.1）。
 *
 * 确定性保证：只用 32 位整数乘法（Math.imul 按规范精确）与位运算，不经过浮点中间态；
 * 最后一次除以 2^32 的除法分子是整数、分母是 2 的幂，二进制可精确表示。
 *
 * Math.random() 被明确禁用：它的算法由实现方自由决定，跨引擎/跨版本不可复现，
 * 是复现体系的致命依赖。熵由调用方注入（见 puzzle/puzzle.ts 的 seed 参数）。
 */
import type { CubeSize } from '../contracts';

export type Rng = () => number;

/** 打乱流的域常量。任何新增随机用途都必须引入新的域常量，不得复用同一个流。 */
export const DOMAIN_SCRAMBLE = 0x9e3779b1;

export function mulberry32(seed32: number): Rng {
  let state = seed32 >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = t ^ (t + Math.imul(t ^ (t >>> 7), t | 61));
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * streamSeed = (seed32 + imul(N, 域常量)) >>> 0
 *
 * 不做域分离时，2 阶与 4 阶在同一 seed 下会产生完全相同的前缀序列（实测复现过该缺陷）。
 */
export function streamSeed(seed32: number, size: CubeSize, domain: number = DOMAIN_SCRAMBLE): number {
  return (seed32 + Math.imul(size, domain)) >>> 0;
}

/** [0, bound) 上的均匀整数。rng() ∈ [0,1)。 */
export function nextInt(rng: Rng, bound: number): number {
  return Math.min(bound - 1, Math.floor(rng() * bound));
}

/** 从数组里等概率取一个元素（空数组返回 undefined，由调用方保证非空）。 */
export function pick<T>(rng: Rng, items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[nextInt(rng, items.length)];
}
