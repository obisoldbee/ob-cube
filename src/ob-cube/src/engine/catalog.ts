/**
 * move_catalog：某一阶数下的**全量合法单步清单**（ARCHITECTURE §5.6）。
 *
 * 它是「完备且无假阴性」的清单，不是「去重后的最小集合」——里面存在语义等价的
 * 多条写法（3 阶 `2R` 与 `M'`、4 阶 `3R` 与 `2L'`），这是刻意的：Agent 拿到的
 * 清单必须与实际可执行的集合完全一致，否则它会因为「清单里没有但引擎接受」而误判。
 * 规范写法（entry.notation === spec.normalized）恰为 AC-40 的轴口径三元组
 * （2 阶 18 / 3 阶 45 / 4 阶 81）；打乱器只从规范写法中抽取。
 *
 * 规模（T-15 / PRD §14.5 断言）：2 阶 18 / 3 阶 99 / 4 阶 162。
 */
import type { CubeSize, FaceId, MoveAmount } from '../contracts';
import { range } from '../shared';
import { TURN_FACES, SLICE_IDS, parseMove } from './notation';
import type { MoveSpec } from './notation';
import type { Axis } from './geometry';

export interface CatalogEntry {
  readonly notation: string;
  readonly spec: MoveSpec;
  readonly axis: Axis;
  readonly amount: MoveAmount;
}

export interface MoveCatalog {
  readonly size: CubeSize;
  readonly entries: readonly CatalogEntry[];
  readonly notations: readonly string[];
  /** faces 出现在按钮矩阵里，顺序与文档示例一致：R L U D F B */
  readonly faces: readonly FaceId[];
  readonly suffixes: readonly string[];
  readonly layerIndices: readonly number[];
  readonly wideLayerCounts: readonly number[];
  readonly slices: readonly string[];
  readonly rangeForm: boolean;
}

function notationsFor(size: CubeSize): string[] {
  const out: string[] = [];
  const suffixes = ['', "'", '2'];
  for (const face of TURN_FACES) {
    // 单层：l=1 输出裸面，l≥2 输出 lF（2 阶只有外层，l≥2 是 AC-07 拒绝项，不进清单）
    for (let l = 1; l <= size; l += 1) {
      if (size === 2 && l >= 2) continue;
      for (const suffix of suffixes) out.push(`${l === 1 ? '' : l}${face}${suffix}`);
    }
    // 宽转：n 只取 2..N-1（n = N 覆盖全层被拒）。n=2 是规范短形式 Xw（不带 2 前缀）
    for (let n = 2; n <= size - 1; n += 1) {
      for (const suffix of suffixes) out.push(`${n === 2 ? '' : n}${face}w${suffix}`);
    }
    // 区间：2 ≤ a < b ≤ N 且 b-a+1 < N，规范形式 a-bF（无 w，PRD §5.7）
    for (let a = 2; a <= size - 1; a += 1) {
      for (let b = a + 1; b <= size; b += 1) {
        if (b - a + 1 >= size) continue;
        for (const suffix of suffixes) out.push(`${a}-${b}${face}${suffix}`);
      }
    }
  }
  if (size % 2 === 1) {
    for (const slice of SLICE_IDS) {
      for (const suffix of suffixes) out.push(`${slice}${suffix}`);
    }
  }
  return out;
}

const cache = new Map<CubeSize, MoveCatalog>();

export function getMoveCatalog(size: CubeSize): MoveCatalog {
  const cached = cache.get(size);
  if (cached) return cached;

  const entries = notationsFor(size).map((notation) => {
    const spec = parseMove(notation, size);
    return { notation, spec, axis: spec.axis, amount: spec.amount };
  });

  const wideLayerCounts = range(2, size - 1);
  const catalog: MoveCatalog = {
    size,
    entries,
    notations: entries.map((entry) => entry.notation),
    faces: TURN_FACES,
    suffixes: ['', "'", '2'],
    layerIndices: range(1, size),
    wideLayerCounts,
    slices: size % 2 === 1 ? [...SLICE_IDS] : [],
    rangeForm: true,
  };
  cache.set(size, catalog);
  return catalog;
}

export function moveCatalogNotations(size: CubeSize): readonly string[] {
  return getMoveCatalog(size).notations;
}

export function catalogEntryFor(size: CubeSize, notation: string): CatalogEntry | undefined {
  return getMoveCatalog(size).entries.find((entry) => entry.notation === notation);
}

/** (axis, 轴索引集合, 转向) → 清单中的归一化记法。用于跨写法比较。 */
export function notationForAction(
  size: CubeSize,
  axis: Axis,
  layerSet: readonly number[],
  amount: MoveAmount,
): string | null {
  const key = `${axis}|${[...layerSet].sort((a, b) => a - b).join(',')}|${amount}`;
  for (const entry of getMoveCatalog(size).entries) {
    if (actionKey(entry.spec) === key) return entry.notation;
  }
  return null;
}

export function actionKey(spec: MoveSpec): string {
  return `${spec.axis}|${[...spec.layerSet].sort((a, b) => a - b).join(',')}|${spec.amount}`;
}

/** 供 UI 直接展示的期望规模（§5.6 表 / PRD §14.5），测试用它做断言。 */
export const EXPECTED_CATALOG_SIZE: Readonly<Record<CubeSize, number>> = { 2: 18, 3: 99, 4: 162 };

/** 规范写法子集：entry.notation 就是 spec.normalized（恰为 AC-40 轴口径三元组）。 */
export function canonicalEntries(size: CubeSize): readonly CatalogEntry[] {
  return getMoveCatalog(size).entries.filter((entry) => entry.notation === entry.spec.normalized);
}
