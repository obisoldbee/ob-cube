import { describe, expect, it } from 'vitest';
import {
  INT_IDENTITY,
  multiplyInt,
  quaternionOf,
  rotateLattice,
  rot90,
} from '../../src/render/turn-animator';
import { latticeToWorld, drawCallBudget } from '../../src/render/cubie-factory';

describe('整数旋转矩阵（不累积变换的基础）', () => {
  it('绕任一轴转 4 次 90° 回到单位矩阵', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(rot90(axis, 4)).toEqual(INT_IDENTITY);
      expect(rot90(axis, 0)).toEqual(INT_IDENTITY);
    }
  });

  it('转 -1 份等于转 3 份', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(rot90(axis, -1)).toEqual(rot90(axis, 3));
    }
  });

  it('矩阵元始终是 -1 / 0 / 1，保证二进制精确', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      for (let q = -5; q <= 5; q += 1) {
        for (const value of rot90(axis, q)) {
          expect([-1, 0, 1]).toContain(value);
        }
      }
    }
  });
});

describe('整数格坐标旋转', () => {
  it('4 阶 R 面外层绕 y 轴转 +90° 落到背面（右手定则），且仍是整数', () => {
    // lattice x=3 → 世界 x=+1.5；绕 +y 转 +90° 后应到 世界 z=-1.5 → lattice z=0
    const moved = rotateLattice([3, 0, 0], rot90('y', 1), 4);
    expect(moved).toEqual([0, 0, 0]);
    expect(latticeToWorld(moved[0], 4)).toBe(-1.5);
    expect(latticeToWorld(moved[2], 4)).toBe(-1.5);
  });

  it('旋转不改变格子到中心的距离（正交变换）', () => {
    const start: [number, number, number] = [0, 1, 3];
    const moved = rotateLattice(start, rot90('x', 1), 4);
    const norm = (v: readonly [number, number, number]): number => {
      const mid = 1.5;
      return Math.hypot(v[0] - mid, v[1] - mid, v[2] - mid);
    };
    expect(norm(moved)).toBeCloseTo(norm(start), 10);
  });

  it('三百步随机转动后，逆序走回来仍精确落回原位（零漂移）', () => {
    const size = 4;
    const start: [number, number, number] = [0, 1, 3];
    let lattice = start;
    let orientation = INT_IDENTITY;
    const history: { axis: 'x' | 'y' | 'z'; quarters: number }[] = [];
    const axes = ['x', 'y', 'z'] as const;

    for (let step = 0; step < 300; step += 1) {
      const axis = axes[step % 3];
      const quarters = step % 2 === 0 ? 1 : -1;
      history.push({ axis, quarters });
      lattice = rotateLattice(lattice, rot90(axis, quarters), size);
      orientation = multiplyInt(rot90(axis, quarters), orientation);
    }
    for (let step = history.length - 1; step >= 0; step -= 1) {
      const { axis, quarters } = history[step];
      lattice = rotateLattice(lattice, rot90(axis, -quarters), size);
      orientation = multiplyInt(rot90(axis, -quarters), orientation);
    }
    expect(lattice).toEqual(start);
    expect(orientation).toEqual(INT_IDENTITY);
    const quaternion = quaternionOf(orientation);
    expect(quaternion.x).toBeCloseTo(0, 12);
    expect(quaternion.y).toBeCloseTo(0, 12);
    expect(quaternion.z).toBeCloseTo(0, 12);
    expect(Math.abs(quaternion.w)).toBeCloseTo(1, 12);
  });

  it('格坐标到世界坐标以立方体中心为原点', () => {
    expect(latticeToWorld(0, 4)).toBe(-1.5);
    expect(latticeToWorld(3, 4)).toBe(1.5);
    expect(latticeToWorld(1, 3)).toBe(0);
  });
});

describe('draw call 预算（ARCHITECTURE §8.2）', () => {
  it('4 阶 56 body + 96 sticker + 1 条层轮廓 = 153', () => {
    expect(drawCallBudget(4)).toBe(153);
  });

  it('3 阶 26 + 54 + 1 = 81；2 阶 8 + 24 + 1 = 33', () => {
    expect(drawCallBudget(3)).toBe(81);
    expect(drawCallBudget(2)).toBe(33);
  });
});
