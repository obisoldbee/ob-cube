import { describe, expect, it } from 'vitest';
import { FACE_ORDER } from '../../src/contracts';
import {
  FACE_GEOMETRY,
  areCollinear,
  cross,
  dot,
  equalVec,
  faceletLattice,
  getSlotTable,
  negate,
  rightOf,
  rotateVector,
} from '../../src/engine';
import type { CubeSize, FaceId } from '../../src/contracts';

const SIZES: CubeSize[] = [2, 3, 4];

describe('T-01 几何表自洽', () => {
  it('每面满足 u × v = -n（右手屏幕基，行方向朝下）', () => {
    for (const face of FACE_ORDER) {
      const g = FACE_GEOMETRY[face];
      expect(equalVec(cross(g.col, g.row), negate(g.normal)), `${face} 的 u×v 必须等于 -n`).toBe(true);
    }
  });

  it('6 个法向量两两不同且都是单位轴向量', () => {
    const normals = FACE_ORDER.map((face) => FACE_GEOMETRY[face].normal);
    for (const n of normals) {
      expect(Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2])).toBe(1);
    }
    const keys = normals.map((n) => n.join(','));
    expect(new Set(keys).size).toBe(6);
  });

  it('法向量与面名的语义一致：U 朝 +y、R 朝 +x、F 朝 +z', () => {
    expect(FACE_GEOMETRY.U.normal).toEqual([0, 1, 0]);
    expect(FACE_GEOMETRY.R.normal).toEqual([1, 0, 0]);
    expect(FACE_GEOMETRY.F.normal).toEqual([0, 0, 1]);
    expect(equalVec(negate(FACE_GEOMETRY.D.normal), FACE_GEOMETRY.U.normal)).toBe(true);
    expect(equalVec(negate(FACE_GEOMETRY.L.normal), FACE_GEOMETRY.R.normal)).toBe(true);
    expect(equalVec(negate(FACE_GEOMETRY.B.normal), FACE_GEOMETRY.F.normal)).toBe(true);
  });

  it('rightOf(U, F) = R，且共线判定正确', () => {
    expect(rightOf('U', 'F')).toEqual(FACE_GEOMETRY.R.normal);
    expect(areCollinear('U', 'D')).toBe(true);
    expect(areCollinear('U', 'U')).toBe(true);
    expect(areCollinear('U', 'F')).toBe(false);
  });
});

describe('T-02 slot 表唯一性', () => {
  it('6N² 个 (pos, normal) 键互不相同', () => {
    for (const size of SIZES) {
      const table = getSlotTable(size);
      expect(table.count).toBe(6 * size * size);
      expect(table.lookup.size).toBe(table.count);
      const keys = new Set<string>();
      for (let i = 0; i < table.count; i += 1) {
        const pos = table.positions[i];
        const n = table.normals[i];
        keys.add(`${pos.join(',')}|${n.join(',')}`);
      }
      expect(keys.size).toBe(table.count);
    }
  });

  it('每张贴纸的 pos 至少一个分量绝对值等于 N-1（确实在表面）', () => {
    for (const size of SIZES) {
      const table = getSlotTable(size);
      for (let i = 0; i < table.count; i += 1) {
        const pos = table.positions[i];
        expect(Math.max(...pos.map(Math.abs))).toBe(size - 1);
      }
    }
  });

  it('slot 编号顺序为 faceIndex·N² + row·N + col', () => {
    for (const size of SIZES) {
      const table = getSlotTable(size);
      for (let faceIndex = 0; faceIndex < 6; faceIndex += 1) {
        for (let row = 0; row < size; row += 1) {
          for (let col = 0; col < size; col += 1) {
            const slot = faceIndex * size * size + row * size + col;
            expect(table.faces[slot]).toBe(FACE_ORDER[faceIndex]);
            expect(table.rows[slot]).toBe(row);
            expect(table.cols[slot]).toBe(col);
          }
        }
      }
    }
  });
});

describe('双倍整数坐标与旋转（零浮点）', () => {
  it('格点坐标 = (pos + N - 1) / 2，恒为整数', () => {
    for (const size of SIZES) {
      for (const face of FACE_ORDER) {
        for (let row = 0; row < size; row += 1) {
          for (let col = 0; col < size; col += 1) {
            const lattice = faceletLattice(size, face, row, col);
            for (const value of lattice) {
              expect(Number.isInteger(value)).toBe(true);
              expect(value).toBeGreaterThanOrEqual(0);
              expect(value).toBeLessThanOrEqual(size - 1);
            }
          }
        }
      }
    }
  });

  it('ROT90 四个四分之一转回到原点，且是整数正交变换', () => {
    for (let axis = 0; axis < 3; axis += 1) {
      for (const v of [
        [1, 2, 3],
        [-1, 0, 2],
        [2, -3, 1],
      ] as const) {
        let current = v as unknown as readonly [number, number, number];
        for (let k = 0; k < 4; k += 1) {
          current = rotateVector(current, axis as 0 | 1 | 2, 1);
        }
        expect(current).toEqual(v);
      }
    }
    // 模长守恒（正交）
    const v = [1, -2, 3] as const;
    for (let axis = 0; axis < 3; axis += 1) {
      for (let k = 1; k <= 3; k += 1) {
        const rotated = rotateVector(v, axis as 0 | 1 | 2, k);
        expect(dot(rotated, rotated)).toBe(dot(v, v));
      }
    }
  });

  it('六个单次 ROT90 的方向与 ARCHITECTURE §4.3 一致', () => {
    // x: (x,y,z) → (x,-z,y)
    expect(rotateVector([1, 2, 3], 0, 1)).toEqual([1, -3, 2]);
    // y: (x,y,z) → (z,y,-x)
    expect(rotateVector([1, 2, 3], 1, 1)).toEqual([3, 2, -1]);
    // z: (x,y,z) → (-y,x,z)
    expect(rotateVector([1, 2, 3], 2, 1)).toEqual([-2, 1, 3]);
  });

  it('已知逐面坐标（与 permutation-proof.py 的 facelet_position 逐面一致）', () => {
    // N=3, row=2, col=1 → 与参考实现 U(c,N-1,r) / D(c,0,N-1-r) / … 完全对齐
    const size: CubeSize = 3;
    const cases: Array<[FaceId, [number, number, number]]> = [
      ['U', [1, 2, 2]],
      ['D', [1, 0, 0]],
      ['F', [1, 0, 2]],
      ['B', [1, 0, 0]],
      ['L', [0, 0, 1]],
      ['R', [2, 0, 1]],
    ];
    for (const [face, expected] of cases) {
      expect(faceletLattice(size, face, 2, 1), `${face}(2,1)`).toEqual(expected);
    }
    // F 的行基朝下（row 增大 → y 减小）
    expect(faceletLattice(size, 'F', 0, 0)[1]).toBe(2);
    expect(faceletLattice(size, 'F', 2, 0)[1]).toBe(0);
    // R 的列基朝 -z（col 增大 → z 减小）
    expect(faceletLattice(size, 'R', 0, 0)[2]).toBe(2);
    expect(faceletLattice(size, 'R', 0, 2)[2]).toBe(0);
  });
});
