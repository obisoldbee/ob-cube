import { describe, expect, it } from 'vitest';
import { FACE_ORDER } from '../../src/contracts';
import type { CubeSize, ColorId } from '../../src/contracts';
import {
  FACE_GEOMETRY,
  applyMove,
  applyPermutation,
  createSolvedState,
  createStateFromSlots,
  cross,
  dot,
  equalState,
  evaluateSolved,
  isSolved,
  layerSetPermutation,
  parseMove,
} from '../../src/engine';
import type { CubeState, Vec3 } from '../../src/engine';

function run(state: CubeState, moves: string[]): CubeState {
  return moves.reduce((acc, move) => applyMove(acc, parseMove(move, acc.size)), state);
}

/** 造一个「六面各自单色」但配色映射任意的状态（用于手性检查） */
function uniformStateWithMapping(size: CubeSize, mapping: readonly ColorId[]): CubeState {
  const per = size * size;
  const slots = new Uint8Array(6 * per);
  for (let faceIndex = 0; faceIndex < 6; faceIndex += 1) {
    for (let i = 0; i < per; i += 1) slots[faceIndex * per + i] = mapping[faceIndex];
  }
  return createStateFromSlots(size, slots);
}

describe('T-14 还原判定', () => {
  it('已还原状态判定为真', () => {
    for (const size of [2, 3, 4] as CubeSize[]) {
      const verdict = evaluateSolved(createSolvedState(size));
      expect(verdict.solved).toBe(true);
      expect(verdict.reason).toBe('uniform');
      expect(verdict.wrongFaces).toEqual([]);
      expect(verdict.wrongStickers).toBe(0);
    }
  });

  it('单步打乱后判定为假，且给出错位面与错位贴纸数', () => {
    const after = run(createSolvedState(3), ['R']);
    const verdict = evaluateSolved(after);
    expect(verdict.solved).toBe(false);
    expect(verdict.reason).toBe('mixed');
    expect(verdict.wrongFaces.sort()).toEqual(['B', 'D', 'F', 'U']);
    expect(verdict.wrongStickers).toBeGreaterThan(0);
  });

  it('仅两块错位判定为假', () => {
    const state = createSolvedState(3);
    const slots = new Uint8Array(state.slots);
    const per = 9;
    // F(0,0) 与 R(0,0) 互换：两面同时变杂
    const fSlot = 2 * per;
    const rSlot = 1 * per;
    [slots[fSlot], slots[rSlot]] = [slots[rSlot], slots[fSlot]];
    const broken = createStateFromSlots(3, slots);
    expect(isSolved(broken)).toBe(false);
    expect(evaluateSolved(broken).wrongFaces.length).toBeGreaterThanOrEqual(2);
  });

  it('AC-23/24/25：每面单色但整体被转动过的状态判定为真', () => {
    for (const size of [2, 3, 4] as CubeSize[]) {
      const start = createSolvedState(size);
      const all = Array.from({ length: size }, (_, i) => i);
      for (let axis = 0; axis < 3; axis += 1) {
        for (const k of [1, 2, 3]) {
          const perm = layerSetPermutation(size, axis as 0 | 1 | 2, all, k);
          const rotated: CubeState = { size, slots: applyPermutation(start.slots, perm) };
          expect(equalState(start, rotated), `${size} 阶 axis${axis} k${k} 数组应不同`).toBe(false);
          expect(evaluateSolved(rotated).solved, `${size} 阶 axis${axis} k${k}`).toBe(true);
        }
      }
    }
  });

  it('AC-26：6 面单色但配色为镜像 → invalid-scheme（不是「已还原」）', () => {
    // U 与 D 交换颜色：det(M) = -1
    const mirrored = uniformStateWithMapping(4, [3, 1, 2, 0, 4, 5]);
    const verdict = evaluateSolved(mirrored);
    expect(verdict.solved).toBe(false);
    expect(verdict.reason).toBe('invalid-scheme');

    // 另一条镜像：R 与 L 交换颜色
    expect(evaluateSolved(uniformStateWithMapping(3, [0, 4, 2, 3, 1, 5])).reason).toBe('invalid-scheme');
    // 再一条：F 与 B 交换颜色
    expect(evaluateSolved(uniformStateWithMapping(3, [0, 1, 5, 3, 4, 2])).reason).toBe('invalid-scheme');
  });

  it('6 面单色且配色是合法旋转 → 已还原（24 个整旋转全覆盖）', () => {
    // 独立于引擎的旋转逻辑：直接枚举 24 个行列式 +1 的带符号置换矩阵
    const signedUnits: Vec3[] = [];
    for (const axis of [0, 1, 2]) {
      for (const sign of [1, -1]) {
        const v = [0, 0, 0];
        v[axis] = sign;
        signedUnits.push(v as unknown as Vec3);
      }
    }
    const normalToFace = new Map<string, number>();
    FACE_ORDER.forEach((face, index) => normalToFace.set(FACE_GEOMETRY[face].normal.join(','), index));

    let legal = 0;
    let mirrored = 0;
    for (const ex of signedUnits) {
      for (const ey of signedUnits) {
        if (dot(ex, ey) !== 0) continue;
        for (const flip of [1, -1]) {
          const ezBase = cross(ex, ey);
          const ez: Vec3 = [ezBase[0] * flip, ezBase[1] * flip, ezBase[2] * flip];
          // M 的三列分别是 ex / ey / ez，作用在法向量上
          const map = (n: Vec3): string => {
            const out = [0, 1, 2].map(
              (row) => ex[row] * n[0] + ey[row] * n[1] + ez[row] * n[2],
            );
            return out.join(',');
          };
          const mapping = FACE_ORDER.map((face) => normalToFace.get(map(FACE_GEOMETRY[face].normal)) as ColorId);
          const verdict = evaluateSolved(uniformStateWithMapping(3, mapping));
          if (flip === 1) {
            expect(verdict.solved, `合法旋转 ${mapping.join('')}`).toBe(true);
            legal += 1;
          } else {
            expect(verdict.reason, `镜像配色 ${mapping.join('')}`).toBe('invalid-scheme');
            expect(verdict.solved).toBe(false);
            mirrored += 1;
          }
        }
      }
    }
    expect(legal).toBe(24);
    expect(mirrored).toBe(24);
  });

  it('AC-01：各阶颜色计数恒为 4 / 9 / 16 且总数 24 / 54 / 96', () => {
    const movesBySize: Record<number, string[]> = {
      2: ['R', 'U', "F'", 'R2', "U'", 'B2'],
      3: ['R', 'U', "F'", 'Rw', '2R', "M'", 'E2'],
      4: ['R', 'U', "F'", 'Rw', '2R', '3Rw', '2-3Rw'],
    };
    for (const size of [2, 3, 4] as CubeSize[]) {
      const state = run(createSolvedState(size), movesBySize[size]);
      const counts = [0, 0, 0, 0, 0, 0];
      for (const value of state.slots) counts[value] += 1;
      const per = size * size;
      for (const count of counts) expect(count, `${size} 阶`).toBe(per);
      expect(state.slots.length).toBe(6 * per);
    }
  });
});
