import { describe, expect, it } from 'vitest';
import { CubeError } from '../../src/contracts';
import type { CubeSize, FaceId } from '../../src/contracts';
import {
  applyMove,
  applyPermutation,
  createSolvedState,
  equalState,
  evaluateSolved,
  faceGrid,
  isSolved,
  layerSetPermutation,
  parseMove,
} from '../../src/engine';
import type { CubeState } from '../../src/engine';

/** 颜色 id：0=U 1=R 2=F 3=D 4=L 5=B */
const COLOR: Readonly<Record<FaceId, number>> = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };
const ALL_FACES: readonly FaceId[] = ['R', 'L', 'U', 'D', 'F', 'B'];

function run(state: CubeState, moves: string[]): CubeState {
  return moves.reduce((acc, move) => applyMove(acc, parseMove(move, acc.size)), state);
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
    return 'no-error';
  } catch (error) {
    if (error instanceof CubeError) return error.code;
    throw error;
  }
}

function sticker(state: CubeState, face: FaceId, row: number, col: number): number {
  return faceGrid(state, face)[row][col];
}

describe('T-08 六面方向正确性', () => {
  const size: CubeSize = 3;

  /**
   * ARCHITECTURE §4.4 的方向表：每个动作把「来源面」的一整条贴纸搬到「目标面」。
   * 表里写的是「预期搬运方向」，等价断言是「目标面上出现的异色 = 来源面颜色」。
   */
  const DIRECTIONS: ReadonlyArray<readonly [FaceId, FaceId, FaceId]> = [
    ['R', 'U', 'F'],
    ['L', 'D', 'F'],
    ['U', 'L', 'F'],
    ['D', 'R', 'F'],
    ['F', 'R', 'U'],
    ['B', 'L', 'U'],
  ];

  it.each(DIRECTIONS)('%s 之后目标面 %s 的异色恰好是 %s 的颜色（N 张）', (move, destination, source) => {
    const after = run(createSolvedState(size), [move]);
    const values = faceGrid(after, destination).flat();
    const foreign = values.filter((value) => value !== COLOR[destination]);
    expect(foreign.length).toBe(size);
    expect(new Set(foreign)).toEqual(new Set([COLOR[source]]));
  });

  it('每面转动后本面仍单色，恰好 4 个相邻面出现异色', () => {
    for (const face of ALL_FACES) {
      const after = run(createSolvedState(size), [face]);
      for (const value of faceGrid(after, face).flat()) expect(value).toBe(COLOR[face]);
      let mixed = 0;
      for (const other of ALL_FACES) {
        if (other === face) continue;
        if (new Set(faceGrid(after, other).flat()).size > 1) mixed += 1;
      }
      expect(mixed, `${face} 之后应有 4 个面出现异色`).toBe(4);
    }
  });

  it('逐点核对（对应参考实现的抽样断言）', () => {
    // R：F 右上角 → U 右上角；U 右上角 → B 左下角
    const afterR = run(createSolvedState(size), ['R']);
    expect(sticker(afterR, 'U', 0, 2)).toBe(COLOR.F);
    expect(sticker(afterR, 'B', 2, 0)).toBe(COLOR.U);

    // L：F 左上角 → D 左上角
    const afterL = run(createSolvedState(size), ['L']);
    expect(sticker(afterL, 'D', 0, 0)).toBe(COLOR.F);

    // U：F 左上角 → L 左上角
    const afterU = run(createSolvedState(size), ['U']);
    expect(sticker(afterU, 'L', 0, 0)).toBe(COLOR.F);

    // D：F 左下角 → R 左下角（D 层是 y 负端，只有 R 的底行参与）
    const afterD = run(createSolvedState(size), ['D']);
    expect(sticker(afterD, 'R', 2, 0)).toBe(COLOR.F);

    // F：U 左下角 → R 左上角（permutation-proof.py 里断言过的那一条）
    const afterF = run(createSolvedState(size), ['F']);
    expect(sticker(afterF, 'R', 0, 0)).toBe(COLOR.U);

    // B：U 左上角 → L 左下角
    const afterB = run(createSolvedState(size), ['B']);
    expect(sticker(afterB, 'L', 2, 0)).toBe(COLOR.U);
  });

  it('逆操作回到完全相同的状态（逐 slot）', () => {
    for (const face of ALL_FACES) {
      const start = createSolvedState(size);
      expect(equalState(start, run(start, [face, `${face}'`]))).toBe(true);
    }
  });

  it('三个阶数的方向表一致（不因 N 改变朝向语义）', () => {
    for (const cubeSize of [2, 3, 4] as CubeSize[]) {
      for (const [move, destination, source] of DIRECTIONS) {
        const after = run(createSolvedState(cubeSize), [move]);
        const foreign = faceGrid(after, destination)
          .flat()
          .filter((value) => value !== COLOR[destination]);
        expect(new Set(foreign), `${cubeSize} 阶 ${move}→${destination}`).toEqual(new Set([COLOR[source]]));
      }
    }
  });
});

describe('T-09 层语义恒等式', () => {
  it("2 阶拒绝一切层前缀（AC-07 / PRD §14.5：2R 这类写法直接拒绝，请写 L'）", () => {
    for (const move of ['2R', '2L', '2-2R']) {
      expect(codeOf(() => parseMove(move, 2))).toBe('E_MOVE_LAYER_OUT_OF_RANGE');
    }
  });

  it("3 阶 2R ≡ M'、2U ≡ E'、2F ≡ S", () => {
    const start = createSolvedState(3);
    expect(equalState(run(start, ['2R']), run(start, ["M'"]))).toBe(true);
    expect(equalState(run(start, ['2U']), run(start, ["E'"]))).toBe(true);
    expect(equalState(run(start, ['2F']), run(start, ['S']))).toBe(true);
  });

  it('4 阶 2-3Rw ≡ 先 2R 再 3R（层不相交可交换）', () => {
    const start = createSolvedState(4);
    expect(equalState(run(start, ['2-3Rw']), run(start, ['2R', '3R']))).toBe(true);
    expect(equalState(run(start, ['2R', '3R']), run(start, ['3R', '2R']))).toBe(true);
  });

  it('Rw ≡ 2Rw（3 阶与 4 阶）', () => {
    for (const cubeSize of [3, 4] as CubeSize[]) {
      const start = createSolvedState(cubeSize);
      expect(equalState(run(start, ['Rw']), run(start, ['2Rw'])), `${cubeSize} 阶`).toBe(true);
    }
  });

  it("对面外层 l=N 等价于对面面的逆时针：3/4 阶 4R ≡ L'", () => {
    for (const cubeSize of [3, 4] as CubeSize[]) {
      const start = createSolvedState(cubeSize);
      expect(equalState(run(start, [`${cubeSize}R`]), run(start, ["L'"])), `${cubeSize} 阶`).toBe(true);
    }
  });

  it('同一层同轴的两个 90° 等于 180°', () => {
    for (const cubeSize of [2, 3, 4] as CubeSize[]) {
      const start = createSolvedState(cubeSize);
      expect(equalState(run(start, ['R', 'R']), run(start, ['R2'])), `${cubeSize} 阶`).toBe(true);
    }
  });

  it('3 阶 2-3Rw 与 R\' 相对状态一致但数组不同（§3.5）', () => {
    const start = createSolvedState(3);
    const a = run(start, ['2-3Rw']);
    const b = run(start, ["R'"]);
    expect(equalState(a, b)).toBe(false);
    expect(evaluateSolved(a).solved).toBe(false);
    expect(evaluateSolved(b).solved).toBe(false);
  });
});

describe('T-10 覆盖全层的转动被拒绝，且拒绝是必要的', () => {
  const cases: Array<[CubeSize, string]> = [
    [2, 'Rw'],
    [3, '3Rw'],
    [4, '4Rw'],
    [4, '1-4Rw'],
  ];

  it.each(cases)('%i 阶 %s → E_MOVE_COVERS_ALL_LAYERS', (size, move) => {
    let caught: unknown;
    try {
      parseMove(move, size);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CubeError);
    expect((caught as CubeError).code).toBe('E_MOVE_COVERS_ALL_LAYERS');
    expect((caught as CubeError).hint.length).toBeGreaterThan(0);
  });

  it('若真执行全层转动，结果仍是「六面各自单色」——所以必须拒绝', () => {
    for (const size of [2, 3, 4] as CubeSize[]) {
      const start = createSolvedState(size);
      const all = Array.from({ length: size }, (_, i) => i);
      const perm = layerSetPermutation(size, 0, all, 3);
      const rotated: CubeState = { size, slots: applyPermutation(start.slots, perm) };
      expect(Array.from(rotated.slots)).not.toEqual(Array.from(start.slots));
      expect(evaluateSolved(rotated).solved, `${size} 阶整体旋转后仍判还原`).toBe(true);
      expect(isSolved(rotated)).toBe(true);
    }
  });
});
