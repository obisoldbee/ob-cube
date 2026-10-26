/**
 * turn-animator.ts —— 转动动画（ARCHITECTURE §8.3）
 *
 * 这是本类项目最经典的坑：若每步结束时用 `quaternion.multiply(delta)` 或
 * `position.add(offset)` 累积，误差随步数线性增长，几百步后魔方会肉眼可见地「歪掉、散开」。
 *
 * 规则（钉死）：任何 Object3D 的变换都**不得**累积。变换的唯一来源是
 * 「整数格坐标 + 整数朝向矩阵 → 精确变换」的纯函数。所有角度都是 π/2 的整数倍，
 * 二进制可精确表示，因此每步都是重新计算而非叠加。
 *
 * 本模块不接触 WebGLRenderer，three 的数学类在 Node 里可用，因此可直接单测。
 */

import { Group, Matrix4, Quaternion, Vector3 } from 'three';
import type { Object3D } from 'three';

/** 行主序 3×3 整数矩阵，元素只允许 -1 / 0 / 1 */
export type IntMatrix = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export const INT_IDENTITY: IntMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export type Axis = 'x' | 'y' | 'z';

/** 绕轴 +90° 的整数矩阵。`quarters` 为份数（可负，可 >4，自动取模）。 */
export function rot90(axis: Axis, quarters: number): IntMatrix {
  const step = ((quarters % 4) + 4) % 4;
  return powInt(baseRot(axis), step);
}

function baseRot(axis: Axis): IntMatrix {
  switch (axis) {
    case 'x':
      return [1, 0, 0, 0, 0, -1, 0, 1, 0];
    case 'y':
      return [0, 0, 1, 0, 1, 0, -1, 0, 0];
    case 'z':
      return [0, -1, 0, 1, 0, 0, 0, 0, 1];
  }
}

export function multiplyInt(a: IntMatrix, b: IntMatrix): IntMatrix {
  const out = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      let sum = 0;
      for (let k = 0; k < 3; k += 1) sum += a[r * 3 + k] * b[k * 3 + c];
      out[r * 3 + c] = sum;
    }
  }
  return out as unknown as IntMatrix;
}

function powInt(m: IntMatrix, exponent: number): IntMatrix {
  let result: IntMatrix = INT_IDENTITY;
  for (let i = 0; i < exponent; i += 1) result = multiplyInt(result, m);
  return result;
}

/** 应用整数矩阵到整数格坐标（0..N-1），绕立方体中心旋转，全程整数运算 */
export function rotateLattice(
  lattice: readonly [number, number, number],
  matrix: IntMatrix,
  size: number,
): [number, number, number] {
  const mid = size - 1;
  const doubled: [number, number, number] = [
    2 * lattice[0] - mid,
    2 * lattice[1] - mid,
    2 * lattice[2] - mid,
  ];
  const rotated: [number, number, number] = [
    matrix[0] * doubled[0] + matrix[1] * doubled[1] + matrix[2] * doubled[2],
    matrix[3] * doubled[0] + matrix[4] * doubled[1] + matrix[5] * doubled[2],
    matrix[6] * doubled[0] + matrix[7] * doubled[1] + matrix[8] * doubled[2],
  ];
  return [(rotated[0] + mid) / 2, (rotated[1] + mid) / 2, (rotated[2] + mid) / 2];
}

export function quaternionOf(matrix: IntMatrix): Quaternion {
  const m = new Matrix4().set(
    matrix[0], matrix[1], matrix[2], 0,
    matrix[3], matrix[4], matrix[5], 0,
    matrix[6], matrix[7], matrix[8], 0,
    0, 0, 0, 1,
  );
  return new Quaternion().setFromRotationMatrix(m);
}

export function axisVector(axis: Axis, sign: number): [number, number, number] {
  const base: Record<Axis, [number, number, number]> = {
    x: [1, 0, 0],
    y: [0, 1, 0],
    z: [0, 0, 1],
  };
  const [x, y, z] = base[axis];
  return [x * sign, y * sign, z * sign];
}

/** 确定性缓动：减速、终点确定、**零回弹**（回弹会让「转完没转完」产生视觉歧义） */
export function easeOutCubic(t: number): number {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return 1 - (1 - clamped) ** 3;
}

export interface TurnAnimation {
  readonly axis: Axis;
  /** 带符号的 90° 份数：+1 顺、-1 逆、+2 一百八 */
  readonly quarters: number;
  readonly durationMs: number;
}

export interface Register {
  readonly object: Object3D;
  /** 由整数状态计算精确变换的纯函数 */
  readonly exact: () => { position: [number, number, number]; quaternion: Quaternion };
}

export class TurnAnimator {
  private readonly pivot = new Group();
  private active: { animation: TurnAnimation; parts: Register[]; startedAt: number } | null = null;

  constructor(private readonly parent: Object3D) {
    this.pivot.name = 'turn-pivot';
    this.parent.add(this.pivot);
  }

  get running(): boolean {
    return this.active !== null;
  }

  /** 开始一次转动。动画不可被打断；输入排队由上层负责（队列上限 8）。 */
  begin(animation: TurnAnimation, parts: Register[], nowMs: number): void {
    if (this.active) throw new Error('转动动画不可被打断：上层必须先排队');
    this.active = { animation, parts, startedAt: nowMs };
    this.pivot.quaternion.identity();
    for (const part of parts) this.pivot.attach(part.object);
  }

  /** 每帧调用。返回 true 表示本帧动画仍在进行。 */
  tick(nowMs: number): boolean {
    const active = this.active;
    if (!active) return false;
    const { animation } = active;
    const raw = animation.durationMs <= 0 ? 1 : (nowMs - active.startedAt) / animation.durationMs;
    const eased = easeOutCubic(raw);
    const [ax, ay, az] = axisVector(animation.axis, Math.sign(animation.quarters) || 1);
    const total = (Math.abs(animation.quarters) * Math.PI) / 2;
    this.pivot.quaternion.setFromAxisAngle(new Vector3(ax, ay, az), total * eased);
    return raw < 1;
  }

  /**
   * 落位：把参与的 cubie 交回静态父节点，并**用整数重算精确变换**。
   * 关键顺序：先由上层推进引擎状态（整数运算），再调用本方法。
   */
  finish(): void {
    const active = this.active;
    if (!active) return;
    for (const part of active.parts) {
      this.parent.attach(part.object);
      const exact = part.exact();
      part.object.position.set(...exact.position);
      part.object.quaternion.copy(exact.quaternion);
    }
    this.pivot.quaternion.identity();
    this.active = null;
  }

  dispose(): void {
    this.active = null;
    this.parent.remove(this.pivot);
  }
}
