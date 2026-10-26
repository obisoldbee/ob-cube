import { describe, expect, it } from 'vitest';
import type { CubeSize } from '../../src/contracts';
import {
  applyPermutation,
  composePermutation,
  createSolvedState,
  cycleStructure,
  equalPerm,
  getMoveCatalog,
  identityPermutation,
  invertPermutation,
  invertNotation,
  isIdentity,
  layerSetPermutation,
  movedSlotCount,
  parseMove,
  permutationOrder,
  singleLayerPermutation,
} from '../../src/engine';
import type { AxisIndex } from '../../src/engine';

const SIZES: CubeSize[] = [2, 3, 4];
const FACE_COUNT = 6;

function permOf(size: CubeSize, notation: string) {
  const spec = parseMove(notation, size);
  return layerSetPermutation(size, spec.axisIndex, spec.layerSet, spec.quarterTurns);
}

describe('T-03 置换是双射', () => {
  it('全量合法单步都满足上域 = 定义域 = 6N² 且取值合法', () => {
    for (const size of SIZES) {
      const count = 6 * size * size;
      for (const entry of getMoveCatalog(size).entries) {
        const perm = layerSetPermutation(size, entry.spec.axisIndex, entry.spec.layerSet, entry.spec.quarterTurns);
        expect(perm.length).toBe(count);
        const domain = new Set(Array.from(perm));
        expect(domain.size, `${size} 阶 ${entry.notation}`).toBe(count);
        for (const target of perm) expect(target).toBeLessThan(count);
      }
    }
  });
});

describe('T-04 置换阶整除 4', () => {
  it('90° 恰为 4 阶、180° 恰为 2 阶', () => {
    for (const size of SIZES) {
      for (const entry of getMoveCatalog(size).entries) {
        const perm = layerSetPermutation(size, entry.spec.axisIndex, entry.spec.layerSet, entry.spec.quarterTurns);
        const order = permutationOrder(perm);
        if (entry.spec.amount === 2) {
          expect(order, `${size} 阶 ${entry.notation} 应为 2 阶`).toBe(2);
        } else {
          expect(order, `${size} 阶 ${entry.notation} 应为 4 阶`).toBe(4);
        }
      }
    }
  });
});

describe('T-05 逆元与复合一致性', () => {
  it('perm(move) ∘ perm(inverse(move)) = 恒等', () => {
    for (const size of SIZES) {
      for (const entry of getMoveCatalog(size).entries) {
        const forward = permOf(size, entry.notation);
        const backward = permOf(size, invertNotation(entry.notation));
        expect(isIdentity(composePermutation(forward, backward)), `${entry.notation}`).toBe(true);
        expect(isIdentity(composePermutation(backward, forward)), `${entry.notation}`).toBe(true);
      }
    }
  });

  it('invertPermutation 是 compose 意义下的逆', () => {
    const perm = singleLayerPermutation(3, 0, 2, 1);
    expect(isIdentity(composePermutation(perm, invertPermutation(perm)))).toBe(true);
  });

  it('X2 等于 X 做两次（几何定义自洽）', () => {
    for (const size of SIZES) {
      for (const face of ['R', 'L', 'U', 'D', 'F', 'B'] as const) {
        const once = permOf(size, face);
        const twice = composePermutation(once, once);
        expect(equalPerm(permOf(size, `${face}2`), twice), `${size} 阶 ${face}2`).toBe(true);
        const thrice = composePermutation(twice, once);
        expect(equalPerm(permOf(size, `${face}'`), thrice), `${size} 阶 ${face}'`).toBe(true);
      }
    }
  });
});

describe('T-06 受影响 slot 计数', () => {
  it('单面 90°：2 阶 12 / 3 阶 20 / 4 阶 32（奇数阶面心不动）', () => {
    const expected: Record<number, number> = { 2: 12, 3: 20, 4: 32 };
    for (const size of SIZES) {
      for (const face of ['R', 'L', 'U', 'D', 'F', 'B'] as const) {
        const moved = movedSlotCount(permOf(size, face));
        expect(moved, `${size} 阶 ${face}`).toBe(expected[size]);
        // 公式：奇数阶 N²-1+4N，偶数阶 N²+4N
        expect(moved).toBe(size * size - (size % 2 === 1 ? 1 : 0) + 4 * size);
      }
    }
  });

  it('4 阶 Rw 影响 48 张（= 外层 N²+4N + 内层 4N）', () => {
    expect(movedSlotCount(permOf(4, 'Rw'))).toBe(48);
    expect(movedSlotCount(permOf(4, '3Rw'))).toBe(64);
    expect(movedSlotCount(permOf(4, '2-3Rw'))).toBe(32);
  });

  it('3 阶 M/E/S 各影响 4N = 12 张', () => {
    for (const slice of ['M', 'E', 'S'] as const) {
      expect(movedSlotCount(permOf(3, slice)), slice).toBe(12);
    }
  });

  it('闭合性公式：Σ_{a∈A}(4N + (a 为外层 ? N² : 0))，奇数阶外层扣掉面心', () => {
    for (const size of SIZES) {
      for (let axis = 0; axis < 3; axis += 1) {
        for (let layer = 0; layer < size; layer += 1) {
          const isOuter = layer === 0 || layer === size - 1;
          // 奇数阶的面心贴纸在置换下不动，所以「受影响」数要扣掉它
          const faceContribution = isOuter ? size * size - (size % 2 === 1 ? 1 : 0) : 0;
          const expected = 4 * size + faceContribution;
          expect(movedSlotCount(singleLayerPermutation(size, axis as AxisIndex, layer, 1))).toBe(expected);
        }
      }
    }
  });
});

describe('T-07 循环结构', () => {
  it('3 阶 R = 5 个 4-循环（面心贴纸不动，其余 34 个 slot 被整体置换固定）', () => {
    const structure = cycleStructure(permOf(3, 'R'));
    expect(structure.cycles).toEqual([4, 4, 4, 4, 4]);
    expect(structure.fixedPoints).toBe(54 - 20);
  });

  it('2 阶 R = 3 个 4-循环，4 阶 R = 8 个 4-循环', () => {
    expect(cycleStructure(permOf(2, 'R')).cycles).toEqual([4, 4, 4]);
    expect(cycleStructure(permOf(2, 'R')).fixedPoints).toBe(24 - 12);
    expect(cycleStructure(permOf(4, 'R')).cycles).toEqual([4, 4, 4, 4, 4, 4, 4, 4]);
    expect(cycleStructure(permOf(4, 'R')).fixedPoints).toBe(96 - 32);
  });

  it('奇数阶面心贴纸是置换的不动点，偶数阶中心块全部参与互换', () => {
    // 3 阶：R 面中心 (1,1) 不动
    const center = 1 * 9 + 1 * 3 + 1;
    expect(permOf(3, 'R')[center]).toBe(center);
    // 2/4 阶：本面上没有任何 slot 被固定
    for (const size of [2, 4] as CubeSize[]) {
      const perm = permOf(size, 'R');
      const per = size * size;
      for (let i = per; i < per * 2; i += 1) {
        expect(perm[i], `${size} 阶 R 面 slot ${i} 不应被固定`).not.toBe(i);
      }
    }
  });
});

describe('状态推进与置换一致性', () => {
  it('newSlots[perm[src]] = slots[src]（语义方向不可反）', () => {
    const size: CubeSize = 3;
    const state = createSolvedState(size);
    const perm = permOf(size, 'R');
    const applied = applyPermutation(state.slots, perm);
    for (let src = 0; src < perm.length; src += 1) {
      expect(applied[perm[src]]).toBe(state.slots[src]);
    }
  });

  it('applyPermutation 不修改入参', () => {
    const size: CubeSize = 3;
    const state = createSolvedState(size);
    const before = Array.from(state.slots);
    applyPermutation(state.slots, permOf(size, 'R'));
    expect(Array.from(state.slots)).toEqual(before);
  });

  it('恒等置换长度为 6N² 且对每个 N 都成立', () => {
    for (const size of SIZES) {
      const identity = identityPermutation(6 * size * size);
      expect(isIdentity(identity)).toBe(true);
    }
    expect(FACE_COUNT).toBe(6);
    expect(identityPermutation(6).length).toBe(6);
    expect(singleLayerPermutation(2, 0 as AxisIndex, 0, 2).length).toBe(24);
  });
});
