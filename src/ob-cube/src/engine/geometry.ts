/**
 * 坐标系定义 —— 本项目唯一允许手写的几何表（ARCHITECTURE §4.1）。
 *
 * 坐标系：右手系，+x 右（R 面）、+y 上（U 面）、+z 前（F 面朝观察者）。
 * 每个面给出：外法向量 n、列方向基 u（贴纸列号增大方向）、行方向基 v（行号增大
 * 方向，即从面外看时的向下）。约束 u × v = -n（右手屏幕基，行朝下），T-01 断言它。
 *
 * 贴纸位置（双倍整数坐标，零浮点）：
 *   p = n·(N-1) + u·c(col) + v·c(row)，  c(i) = 2i - (N-1)
 * N=2 时 c ∈ {-1,+1}；N=3 时 {-2,0,+2}；N=4 时 {-3,-1,+1,+3}。
 *
 * 表里没有、也不允许有任何置换数组：置换由这张表 + ROT90 推导（见 permutation.ts）。
 */
import { FACE_ORDER } from '../contracts';
import type { CubeSize, FaceId } from '../contracts';
import { invariant } from '../shared';

export type Axis = 'x' | 'y' | 'z';
export type AxisIndex = 0 | 1 | 2;
export type Vec3 = readonly [number, number, number];

export const AXES: readonly Axis[] = ['x', 'y', 'z'];

export interface FaceGeometry {
  /** 外法向量 */
  readonly normal: Vec3;
  /** 列方向基 */
  readonly col: Vec3;
  /** 行方向基（从面外看时的向下） */
  readonly row: Vec3;
  /** 该面法向量所在的轴索引 */
  readonly axis: AxisIndex;
  /** 该面在轴上的哪一端：+ / - */
  readonly side: 1 | -1;
}

export const FACE_GEOMETRY: Readonly<Record<FaceId, FaceGeometry>> = {
  U: { normal: [0, 1, 0], col: [1, 0, 0], row: [0, 0, 1], axis: 1, side: 1 },
  D: { normal: [0, -1, 0], col: [1, 0, 0], row: [0, 0, -1], axis: 1, side: -1 },
  F: { normal: [0, 0, 1], col: [1, 0, 0], row: [0, -1, 0], axis: 2, side: 1 },
  B: { normal: [0, 0, -1], col: [-1, 0, 0], row: [0, -1, 0], axis: 2, side: -1 },
  R: { normal: [1, 0, 0], col: [0, 0, -1], row: [0, -1, 0], axis: 0, side: 1 },
  L: { normal: [-1, 0, 0], col: [0, 0, 1], row: [0, -1, 0], axis: 0, side: -1 },
};

export function faceIndexOf(face: FaceId): number {
  return FACE_ORDER.indexOf(face);
}

export function faceAt(index: number): FaceId {
  const face = FACE_ORDER[index];
  invariant(face !== undefined, `face index out of range: ${index}`);
  return face;
}

export function isFaceId(value: unknown): value is FaceId {
  return typeof value === 'string' && (FACE_ORDER as readonly string[]).includes(value);
}

export function isAxisChar(value: unknown): value is Axis {
  return value === 'x' || value === 'y' || value === 'z';
}

export function axisIndexOf(axis: Axis): AxisIndex {
  return AXES.indexOf(axis) as AxisIndex;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function negate(v: Vec3): Vec3 {
  return [-v[0], -v[1], -v[2]];
}

export function equalVec(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/**
 * 绕 +axis 旋转 quarters 个 90°（右手定则：从轴正端看原点为逆时针）。
 * 单次形式：x:(x,y,z)→(x,-z,y)  y:(z,y,-x)  z:(-y,x,z)
 * 三阶整数正交矩阵，行列式 +1，全程无浮点。
 */
export function rotateVector(v: Vec3, axis: AxisIndex, quarters: number): Vec3 {
  let [x, y, z] = v;
  const times = ((quarters % 4) + 4) % 4;
  for (let i = 0; i < times; i += 1) {
    if (axis === 0) {
      const nextY = -z;
      z = y;
      y = nextY;
    } else if (axis === 1) {
      const nextX = z;
      z = -x;
      x = nextX;
    } else {
      const nextX = -y;
      y = x;
      x = nextX;
    }
  }
  return [x, y, z];
}

/** 格点 i ∈ [0, N-1] → 双倍坐标 2i-(N-1)，取值 {-(N-1), ..., N-1}。 */
export function doubleCoord(i: number, size: CubeSize): number {
  return 2 * i - (size - 1);
}

/** 贴纸三维位置（双倍整数坐标）。 */
export function faceletPosition(size: CubeSize, face: FaceId, row: number, col: number): Vec3 {
  const g = FACE_GEOMETRY[face];
  const m = size - 1;
  const cCol = doubleCoord(col, size);
  const cRow = doubleCoord(row, size);
  return [
    g.normal[0] * m + g.col[0] * cCol + g.row[0] * cRow,
    g.normal[1] * m + g.col[1] * cCol + g.row[1] * cRow,
    g.normal[2] * m + g.col[2] * cCol + g.row[2] * cRow,
  ];
}

/** 贴纸格点坐标（整数 0..N-1）。渲染层由它算世界坐标，引擎本身只用双倍坐标。 */
export function faceletLattice(size: CubeSize, face: FaceId, row: number, col: number): Vec3 {
  const p = faceletPosition(size, face, row, col);
  return [(p[0] + size - 1) / 2, (p[1] + size - 1) / 2, (p[2] + size - 1) / 2];
}

/** 视图中「右」面 = up × front（U×F=R 已验证）。 */
export function rightOf(up: FaceId, front: FaceId): Vec3 {
  return cross(FACE_GEOMETRY[up].normal, FACE_GEOMETRY[front].normal);
}

/** 两个面是否共线（同向或反向）。 */
export function areCollinear(a: FaceId, b: FaceId): boolean {
  const na = FACE_GEOMETRY[a].normal;
  const nb = FACE_GEOMETRY[b].normal;
  return equalVec(na, nb) || equalVec(na, negate(nb));
}
