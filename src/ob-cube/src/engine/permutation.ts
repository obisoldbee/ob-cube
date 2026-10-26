/**
 * 置换的程序化生成器。**代码中零手写置换数组**（ARCHITECTURE §4 硬性要求）。
 *
 * 语义约定（全库唯一一种，applyPermutation 是唯一实现点）：
 *   perm[source] = target   ⇔   newState[target] = oldState[source]
 *
 * 为什么它必然正确（这四步推理就是正确性论证）：
 *   1. ROT90 是行列式 +1 的整数正交矩阵，立方体表面贴纸集合在它作用下封闭；
 *   2. φ(slot) = (R·pos, R·normal) 在全体 slot 上是双射（R⁻¹ 给出逆）；
 *   3. φ 保持沿转轴的分量不变（绕该轴旋转的定义），故每个「层子集」在 φ 下封闭；
 *   4. 由 2、3，perm 在每个层子集上是双射、子集外是恒等，故是全体 slot 上的双射；
 *      又因 R⁴ = I，perm 的阶整除 4。
 *
 * 缓存键 (N, axis, layer, k) 只有 3·N·3 ≤ 36 条；宽转/区间由「不相交层的复合」得出。
 */
import type { CubeSize } from '../contracts';
import { invariant } from '../shared';
import { axisIndexOf, doubleCoord, rotateVector } from './geometry';
import type { Axis, AxisIndex } from './geometry';
import { getSlotTable, slotKey } from './slots';

/** 长度 6N² ≤ 96 的置换；用 TypedArray 而不是 number[] 是为了让「拷贝」这件事廉价且不可变共享。 */
export type Perm = Uint16Array;

const cache = new Map<string, Perm>();

export function identityPermutation(count: number): Perm {
  const perm = new Uint16Array(count);
  for (let i = 0; i < count; i += 1) perm[i] = i;
  return perm;
}

export function isIdentity(perm: Perm): boolean {
  for (let i = 0; i < perm.length; i += 1) if (perm[i] !== i) return false;
  return true;
}

export function equalPerm(a: Perm, b: Perm): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** 先 first 后 then：result[src] = then[first[src]] */
export function composePermutation(first: Perm, then: Perm): Perm {
  invariant(first.length === then.length, 'compose: length mismatch');
  const out = new Uint16Array(first.length);
  for (let i = 0; i < first.length; i += 1) out[i] = then[first[i]];
  return out;
}

/** perm 的阶（最小的 n ≥ 1 使 permⁿ = 恒等）。 */
export function permutationOrder(perm: Perm): number {
  let current = perm;
  for (let order = 1; order <= 24; order += 1) {
    if (isIdentity(current)) return order;
    current = composePermutation(current, perm);
  }
  invariant(false, 'permutation order exceeds 24');
}

/** 受影响（非不动点）的 slot 数。 */
export function movedSlotCount(perm: Perm): number {
  let moved = 0;
  for (let i = 0; i < perm.length; i += 1) if (perm[i] !== i) moved += 1;
  return moved;
}

export interface CycleStructure {
  /** 每个非平凡循环的长度 */
  readonly cycles: number[];
  /** 不动点数量 */
  readonly fixedPoints: number;
}

export function cycleStructure(perm: Perm): CycleStructure {
  const seen = new Uint8Array(perm.length);
  const cycles: number[] = [];
  let fixedPoints = 0;
  for (let start = 0; start < perm.length; start += 1) {
    if (seen[start]) continue;
    let length = 0;
    let current = start;
    while (!seen[current]) {
      seen[current] = 1;
      current = perm[current];
      length += 1;
    }
    if (length === 1) fixedPoints += 1;
    else cycles.push(length);
  }
  cycles.sort((a, b) => a - b);
  return { cycles, fixedPoints };
}

/**
 * 单层四分之一转的置换。
 * axisLayer 是轴索引（从负侧数，0..N-1），不是记法层号。
 */
export function singleLayerPermutation(
  size: CubeSize,
  axis: AxisIndex,
  axisLayer: number,
  quarters: number,
): Perm {
  const k = ((quarters % 4) + 4) % 4;
  invariant(k === 1 || k === 2 || k === 3, `quarters must be 1|2|3, got ${quarters}`);
  invariant(axisLayer >= 0 && axisLayer < size, `axis layer ${axisLayer} out of range (N=${size})`);

  const key = `${size}:${axis}:${axisLayer}:${k}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const table = getSlotTable(size);
  const coord = doubleCoord(axisLayer, size);
  const perm = identityPermutation(table.count);
  const seenTarget = new Uint8Array(table.count);

  for (let slot = 0; slot < table.count; slot += 1) {
    const position = table.positions[slot];
    if (position[axis] !== coord) continue;
    const nextPosition = rotateVector(position, axis, k);
    const nextNormal = rotateVector(table.normals[slot], axis, k);
    const target = table.lookup.get(slotKey(nextPosition, nextNormal));
    invariant(target !== undefined, `rotated slot not found: ${String(slot)}`);
    invariant(!seenTarget[target], 'generated permutation is not injective');
    seenTarget[target] = 1;
    perm[slot] = target;
  }

  cache.set(key, perm);
  return perm;
}

/**
 * 任意轴索引集合的转动置换（宽转/区间/切片都走这里）。
 * 层之间不相交，因此复合顺序无关；这里按升序逐个复合，只为让结果可复现。
 */
export function layerSetPermutation(
  size: CubeSize,
  axis: AxisIndex,
  layerSet: readonly number[],
  quarters: number,
): Perm {
  invariant(layerSet.length > 0, 'layer set is empty');
  invariant(new Set(layerSet).size === layerSet.length, 'layer set has duplicates');
  const sorted = [...layerSet].sort((a, b) => a - b);
  let result = identityPermutation(6 * size * size);
  for (const layer of sorted) {
    result = composePermutation(result, singleLayerPermutation(size, axis, layer, quarters));
  }
  return result;
}

export function permutationForAxis(
  size: CubeSize,
  axis: Axis,
  layerSet: readonly number[],
  quarters: number,
): Perm {
  return layerSetPermutation(size, axisIndexOf(axis), layerSet, quarters);
}

/** newSlots[perm[src]] = slots[src] —— 全库唯一的置换应用点。 */
export function applyPermutation(slots: Uint8Array, perm: Perm): Uint8Array {
  invariant(slots.length === perm.length, 'applyPermutation: length mismatch');
  const out = new Uint8Array(slots.length);
  for (let src = 0; src < perm.length; src += 1) out[perm[src]] = slots[src];
  return out;
}

/** 逆置换：perm[src]=dst ⇒ inverse[dst]=src */
export function invertPermutation(perm: Perm): Perm {
  const out = new Uint16Array(perm.length);
  for (let src = 0; src < perm.length; src += 1) out[perm[src]] = src;
  return out;
}
