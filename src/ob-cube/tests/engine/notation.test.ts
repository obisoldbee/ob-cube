import { describe, expect, it } from 'vitest';
import { CubeError } from '../../src/contracts';
import type { CubeSize, FaceId } from '../../src/contracts';
import type { MoveAmount } from '../../src/contracts';
import {
  EXPECTED_CATALOG_SIZE,
  FACE_GEOMETRY,
  describeMove,
  getMoveCatalog,
  invertNotation,
  parseMove,
} from '../../src/engine';

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof CubeError) return error.code;
    throw error;
  }
  return 'no-error';
}

describe('T-15 记法合法用例：归一化 + (axis, layers, k) 三元组', () => {
  interface Case {
    readonly input: string;
    readonly size: CubeSize;
    readonly normalized: string;
    readonly axis: 'x' | 'y' | 'z';
    readonly layerIndices: number[];
    readonly layerSet: number[];
    readonly amount: MoveAmount;
    readonly quarterTurns: 1 | 2 | 3;
  }

  const cases: readonly Case[] = [
    { input: 'R', size: 3, normalized: 'R', axis: 'x', layerIndices: [1], layerSet: [2], amount: 1, quarterTurns: 3 },
    { input: "R'", size: 3, normalized: "R'", axis: 'x', layerIndices: [1], layerSet: [2], amount: 3, quarterTurns: 1 },
    { input: 'R2', size: 3, normalized: 'R2', axis: 'x', layerIndices: [1], layerSet: [2], amount: 2, quarterTurns: 2 },
    { input: "R2'", size: 3, normalized: 'R2', axis: 'x', layerIndices: [1], layerSet: [2], amount: 2, quarterTurns: 2 },
    { input: 'Rw', size: 4, normalized: 'Rw', axis: 'x', layerIndices: [1, 2], layerSet: [2, 3], amount: 1, quarterTurns: 3 },
    { input: '2Rw', size: 4, normalized: 'Rw', axis: 'x', layerIndices: [1, 2], layerSet: [2, 3], amount: 1, quarterTurns: 3 } /* 2Rw 是 Rw 的别名 */,
    {
      input: '3Rw',
      size: 4,
      normalized: '3Rw',
      axis: 'x',
      layerIndices: [1, 2, 3],
      layerSet: [1, 2, 3],
      amount: 1,
      quarterTurns: 3,
    },
    {
      input: '2-3Rw',
      size: 4,
      normalized: '2-3R',
      axis: 'x',
      layerIndices: [2, 3],
      layerSet: [1, 2],
      amount: 1,
      quarterTurns: 3,
    },
    { input: '2R', size: 4, normalized: '2R', axis: 'x', layerIndices: [2], layerSet: [2], amount: 1, quarterTurns: 3 },
    { input: '3R', size: 4, normalized: "2L'", axis: 'x', layerIndices: [3], layerSet: [1], amount: 1, quarterTurns: 3 } /* 3R 归一化为 2L'（§5.2） */,
    { input: '2R2', size: 4, normalized: '2R2', axis: 'x', layerIndices: [2], layerSet: [2], amount: 2, quarterTurns: 2 },
    { input: 'M', size: 3, normalized: 'M', axis: 'x', layerIndices: [2], layerSet: [1], amount: 1, quarterTurns: 1 },
    { input: '2R', size: 3, normalized: "M'", axis: 'x', layerIndices: [2], layerSet: [1], amount: 1, quarterTurns: 3 } /* AC-34：3 阶中层规范形式是 M 族 */,
    { input: "E'", size: 3, normalized: "E'", axis: 'y', layerIndices: [2], layerSet: [1], amount: 3, quarterTurns: 3 },
    { input: 'S2', size: 3, normalized: 'S2', axis: 'z', layerIndices: [2], layerSet: [1], amount: 2, quarterTurns: 2 },
    { input: 'L', size: 3, normalized: 'L', axis: 'x', layerIndices: [1], layerSet: [0], amount: 1, quarterTurns: 1 },
    { input: 'U', size: 3, normalized: 'U', axis: 'y', layerIndices: [1], layerSet: [2], amount: 1, quarterTurns: 3 },
    { input: 'D', size: 3, normalized: 'D', axis: 'y', layerIndices: [1], layerSet: [0], amount: 1, quarterTurns: 1 },
    { input: 'F', size: 3, normalized: 'F', axis: 'z', layerIndices: [1], layerSet: [2], amount: 1, quarterTurns: 3 },
    { input: 'B', size: 3, normalized: 'B', axis: 'z', layerIndices: [1], layerSet: [0], amount: 1, quarterTurns: 1 },
    { input: ' R ', size: 3, normalized: 'R', axis: 'x', layerIndices: [1], layerSet: [2], amount: 1, quarterTurns: 3 },
  ];

  it.each(cases)('$input（$size 阶）→ $normalized', (testCase) => {
    const spec = parseMove(testCase.input, testCase.size);
    expect(spec.normalized).toBe(testCase.normalized);
    expect(spec.axis).toBe(testCase.axis);
    expect(spec.layerIndices).toEqual(testCase.layerIndices);
    expect(spec.layerSet).toEqual(testCase.layerSet);
    expect(spec.amount).toBe(testCase.amount);
    expect(spec.quarterTurns).toBe(testCase.quarterTurns);
    expect(spec.kind).toBe('turn');
  });

  it('M/E/S 与 2L/2D/2F 在几何上完全等价（Singmaster 约定）', () => {
    const pairs: Array<[string, string]> = [
      ['M', '2L'],
      ['E', '2D'],
      ['S', '2F'],
    ];
    for (const [slice, wide] of pairs) {
      const a = parseMove(slice, 3);
      const b = parseMove(wide, 3);
      expect(a.axis).toBe(b.axis);
      expect(a.layerSet).toEqual(b.layerSet);
      expect(a.quarterTurns).toBe(b.quarterTurns);
    }
  });

  it('归一化是幂等的：parse(normalize(x)).normalized === normalize(x)', () => {
    for (const size of [2, 3, 4] as CubeSize[]) {
      for (const notation of getMoveCatalog(size).notations) {
        const once = parseMove(notation, size).normalized;
        const twice = parseMove(once, size).normalized;
        expect(twice).toBe(once);
      }
    }
  });

  it('invertNotation：2 自逆、撇号消去、其余补撇', () => {
    expect(invertNotation('R2')).toBe('R2');
    expect(invertNotation("R'")).toBe('R');
    expect(invertNotation('R')).toBe("R'");
    expect(invertNotation('2-3R')).toBe("2-3R'");
    expect(invertNotation(invertNotation('3Rw'))).toBe('3Rw');
  });
});

describe('T-16 记法非法用例：错误码逐条正确', () => {
  const cases: ReadonlyArray<readonly [string, CubeSize, string]> = [
    ['r', 3, 'E_NOTATION_LOWERCASE'],
    ['u', 3, 'E_NOTATION_LOWERCASE'],
    ['m', 3, 'E_NOTATION_LOWERCASE'],
    ['R U', 3, 'E_NOTATION_MULTIPLE_MOVES'],
    ['R2 U2', 3, 'E_NOTATION_MULTIPLE_MOVES'],
    ['5R', 3, 'E_MOVE_LAYER_OUT_OF_RANGE'],
    ['0R', 3, 'E_MOVE_LAYER_OUT_OF_RANGE'],
    ['2-1R', 3, 'E_MOVE_LAYER_OUT_OF_RANGE'],
    ['2-4R', 3, 'E_MOVE_LAYER_OUT_OF_RANGE'],
    ['M', 4, 'E_SLICE_NOT_AVAILABLE'],
    ['E', 2, 'E_SLICE_NOT_AVAILABLE'],
    ['Rw', 2, 'E_MOVE_COVERS_ALL_LAYERS'],
    ['3Rw', 3, 'E_MOVE_COVERS_ALL_LAYERS'],
    ['4Rw', 4, 'E_MOVE_COVERS_ALL_LAYERS'],
    ['R3', 3, 'E_NOTATION_MALFORMED'],
    ['X', 3, 'E_NOTATION_MALFORMED'],
    ['', 3, 'E_NOTATION_MALFORMED'],
    ['   ', 3, 'E_NOTATION_MALFORMED'],
    ['1R', 3, 'E_NOTATION_MALFORMED'],
    ['2M', 3, 'E_NOTATION_MALFORMED'],
    ['Mw', 3, 'E_NOTATION_MALFORMED'],
    ['RW', 3, 'E_NOTATION_MALFORMED'],
  ];

  it.each(cases)('%s（%i 阶）→ %s', (move, size, code) => {
    expect(codeOf(() => parseMove(move, size))).toBe(code);
  });

  it('每个错误都带非空 hint', () => {
    const bad: Array<[string, CubeSize]> = [
      ['r', 3],
      ['R U', 3],
      ['5R', 3],
      ['M', 4],
      ['Rw', 2],
      ['Xq', 3],
    ];
    for (const [move, size] of bad) {
      try {
        parseMove(move, size);
        throw new Error(`${move} 应该失败`);
      } catch (error) {
        expect(error).toBeInstanceOf(CubeError);
        expect((error as CubeError).hint.length).toBeGreaterThan(0);
      }
    }
  });

  it('整体旋转 x/y/z 在解析层可识别（kind=rotation），但不属于 apply_move 通道', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      const spec = parseMove(axis, 3);
      expect(spec.kind).toBe('rotation');
      expect(spec.axis).toBe(axis);
      expect(spec.layerSet).toEqual([0, 1, 2]);
    }
    // 带层前缀的整体旋转是语法错误
    expect(codeOf(() => parseMove('2x', 3))).toBe('E_NOTATION_MALFORMED');
  });
});

describe('move_catalog 规模与构成（§5.6）', () => {
  it('2 阶 18 / 3 阶 99 / 4 阶 162（PRD §14.5）', () => {
    for (const size of [2, 3, 4] as CubeSize[]) {
      expect(getMoveCatalog(size).notations.length).toBe(EXPECTED_CATALOG_SIZE[size]);
    }
  });

  it('清单无重复字符串；每条的归一化结果仍在清单内且是不动点（ss-2 允许别名）', () => {
    for (const size of [2, 3, 4] as CubeSize[]) {
      const { notations } = getMoveCatalog(size);
      expect(new Set(notations).size).toBe(notations.length);
      const catalog = new Set(notations);
      for (const notation of notations) {
        const normalized = parseMove(notation, size).normalized;
        expect(catalog.has(normalized), `${size} 阶 ${notation} → ${normalized}`).toBe(true);
        expect(parseMove(normalized, size).normalized).toBe(normalized);
      }
    }
  });

  it('清单里不含任何非法形态（全层转动、偶数阶切片、越界层号）', () => {
    for (const size of [2, 3, 4] as CubeSize[]) {
      for (const notation of getMoveCatalog(size).notations) {
        expect(codeOf(() => parseMove(notation, size)), `${size} 阶 ${notation}`).toBe('no-error');
      }
      if (size % 2 === 0) {
        expect(getMoveCatalog(size).slices).toEqual([]);
      }
    }
  });

  it('按公式逐项核对：单层 6N·3 / 宽转 6·(N-2)·3 / 区间 6·R·3 / 切片', () => {
    for (const size of [2, 3, 4] as CubeSize[]) {
      const catalog = getMoveCatalog(size);
      // 2 阶只有外层可写（AC-07 拒绝层前缀），其余阶单层 1..N 都可写
      const singles = (size === 2 ? 6 : 6 * size) * 3;
      const wides = 6 * Math.max(0, size - 2) * 3;
      let ranges = 0;
      for (let a = 2; a <= size - 1; a += 1) {
        for (let b = a + 1; b <= size; b += 1) {
          if (b - a + 1 < size) ranges += 1;
        }
      }
      const slices = size % 2 === 1 ? 9 : 0;
      expect(catalog.notations.length).toBe(singles + wides + 6 * ranges * 3 + slices);
      expect(catalog.layerIndices).toEqual(Array.from({ length: size }, (_, i) => i + 1));
    }
  });
});

describe('AC-40 三元组覆盖：describeMove 描述每一个连续层区间', () => {
  /** 连续区间（排除整轴全层） */
  function intervals(size: number): number[][] {
    const out: number[][] = [];
    for (let from = 1; from <= size; from += 1) {
      for (let to = from; to <= size; to += 1) {
        if (to - from + 1 >= size) continue;
        out.push(Array.from({ length: to - from + 1 }, (_, i) => from + i));
      }
    }
    return out;
  }

  it('按 AC-40 口径（3 轴 × 连续区间 × 3 转向）为 18 / 45 / 81，按面枚举为 36 / 90 / 162', () => {
    const axisBased: Record<number, number> = { 2: 18, 3: 45, 4: 81 };
    const faceBased: Record<number, number> = { 2: 36, 3: 90, 4: 162 };
    const faces: FaceId[] = ['R', 'L', 'U', 'D', 'F', 'B'];
    for (const size of [2, 3, 4] as CubeSize[]) {
      const catalog = new Set(getMoveCatalog(size).notations);
      const list = intervals(size);
      expect(list.length * 3 * 3).toBe(axisBased[size]);
      let total = 0;
      const distinct = new Set<string>();
      for (const face of faces) {
        for (const layers of list) {
          for (const amount of [1, 2, 3] as MoveAmount[]) {
            const notation = describeMove({ size, face, layers, amount });
            expect(catalog.has(notation), `${size} 阶 ${face} ${layers.join(',')} ${amount} → ${notation}`).toBe(true);
            // AC-71 往返（物理口径）：解析回的必须是同一个物理转动——同轴、同层集合、
            // 同转向。命名面与记法层号允许换成更近一侧（3R → 2L'），这是 §5.7 唯一命名规则。
            const spec = parseMove(notation, size);
            const side = FACE_GEOMETRY[face].side;
            const expectedLayerSet = layers.map((l) => (side === 1 ? size - l : l - 1)).sort((a, b) => a - b);
            const expectedQuarter = (((side === 1 ? -1 : 1) * amount) % 4 + 4) % 4 || 4;
            expect(spec.layerSet).toEqual(expectedLayerSet);
            expect(spec.quarterTurns).toBe(expectedQuarter as 1 | 2 | 3);
            distinct.add(notation);
            total += 1;
          }
        }
      }
      expect(total).toBe(faceBased[size]);
      // 同一物理转动从两侧命名产出同一规范串：distinct 恰为轴口径三元组数
      expect(distinct.size).toBe(axisBased[size]);
      for (const notation of distinct) {
        expect(parseMove(notation, size).normalized).toBe(notation);
      }
    }
  });

  it('全层区间与空区间被拒绝', () => {
    expect(codeOf(() => describeMove({ size: 3, face: 'R', layers: [1, 2, 3], amount: 1 }))).toBe(
      'E_MOVE_COVERS_ALL_LAYERS',
    );
    expect(codeOf(() => describeMove({ size: 3, face: 'R', layers: [], amount: 1 }))).toBe(
      'E_MOVE_LAYER_OUT_OF_RANGE',
    );
    expect(codeOf(() => describeMove({ size: 3, face: 'R', layers: [1, 3], amount: 1 }))).toBe(
      'E_MOVE_LAYER_OUT_OF_RANGE',
    );
  });
});
