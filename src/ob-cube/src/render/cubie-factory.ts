/**
 * cubie-factory.ts —— cubie mesh 构建（ARCHITECTURE §8.2）
 *
 * 关键不是「选了 cubie 方案」，而是：**每个 cubie 只回答「我这一格朝外的面该显示什么颜色」**。
 * 渲染层不维护块身份、不维护块朝向 —— 没有第二份真相，就不会出现渲染与引擎不一致。
 *
 * draw call 预算：4 阶 56 body + 96 sticker = 152（层轮廓描边另占 1，共 153）。
 * 默认关闭 shadowMap：96 张贴纸开阴影在集显上是已知掉帧源。
 */

import { Group, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3 } from 'three';
import type { BufferGeometry, Color, Material } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { FaceId } from '../contracts';
import { FACE_ORDER } from '../contracts';

/** 整数格坐标，各分量 ∈ [0, N-1] */
export type Lattice = readonly [number, number, number];

export const BODY_SIZE = 0.95;
export const STICKER_SIZE = 0.82;
const STICKER_OFFSET = 0.476;

export const FACE_NORMAL: Readonly<Record<FaceId, readonly [number, number, number]>> = {
  U: [0, 1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1],
};

export interface StickerRef {
  readonly mesh: Mesh;
  readonly face: FaceId;
  readonly lattice: Lattice;
}

export interface Cubie {
  readonly id: string;
  readonly group: Group;
  readonly lattice: Lattice;
  readonly stickers: readonly StickerRef[];
}

/** 整数格坐标 → 世界坐标。纯函数，**唯一**的变换来源。 */
export function latticeToWorld(index: number, size: number): number {
  return index - (size - 1) / 2;
}

export function latticeToVector(lattice: Lattice, size: number): Vector3 {
  return new Vector3(
    latticeToWorld(lattice[0], size),
    latticeToWorld(lattice[1], size),
    latticeToWorld(lattice[2], size),
  );
}

/** 该格是否位于外壳（只有外壳 cubie 有贴纸） */
export function isShellCubie(lattice: Lattice, size: number): boolean {
  return lattice.some((value) => value === 0 || value === size - 1);
}

/** 该格外向可见的面（0 个 → 内部块，3 个 → 角块） */
export function visibleFacesOf(lattice: Lattice, size: number): FaceId[] {
  const out: FaceId[] = [];
  for (const face of FACE_ORDER) {
    const [nx, ny, nz] = FACE_NORMAL[face];
    const x = nx > 0 ? lattice[0] === size - 1 : nx < 0 ? lattice[0] === 0 : true;
    const y = ny > 0 ? lattice[1] === size - 1 : ny < 0 ? lattice[1] === 0 : true;
    const z = nz > 0 ? lattice[2] === size - 1 : nz < 0 ? lattice[2] === 0 : true;
    if (x && y && z) out.push(face);
  }
  return out;
}

export interface CubieMaterials {
  readonly body: Material;
  readonly sticker: Material;
}

export function createCubieGeometries(): { body: BufferGeometry; sticker: BufferGeometry } {
  return {
    body: new RoundedBoxGeometry(BODY_SIZE, BODY_SIZE, BODY_SIZE, 2, 0.08),
    sticker: new PlaneGeometry(STICKER_SIZE, STICKER_SIZE),
  };
}

export function buildCubie(
  lattice: Lattice,
  size: number,
  materials: CubieMaterials,
  geometries: { body: BufferGeometry; sticker: BufferGeometry },
): Cubie {
  const id = `c${lattice[0]}${lattice[1]}${lattice[2]}`;
  const group = new Group();
  group.name = id;
  // 变换只从整数格坐标重算，绝不累积
  group.position.copy(latticeToVector(lattice, size));

  const body = new Mesh(geometries.body, materials.body);
  body.name = `${id}-body`;
  group.add(body);

  const stickers: StickerRef[] = [];
  if (isShellCubie(lattice, size)) {
    for (const face of visibleFacesOf(lattice, size)) {
      const [nx, ny, nz] = FACE_NORMAL[face];
      const mesh = new Mesh(geometries.sticker, materials.sticker);
      mesh.name = `${id}-s${face}`;
      mesh.position.set(nx * STICKER_OFFSET, ny * STICKER_OFFSET, nz * STICKER_OFFSET);
      mesh.lookAt(nx * 2, ny * 2, nz * 2);
      group.add(mesh);
      stickers.push({ mesh, face, lattice });
    }
  }
  return { id, group, lattice, stickers };
}

/** 构建全部外壳 cubie。4 阶 56 个，3 阶 26 个，2 阶 8 个。 */
export function buildCube(size: number, materials: CubieMaterials): Cubie[] {
  const geometries = createCubieGeometries();
  const cubies: Cubie[] = [];
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      for (let z = 0; z < size; z += 1) {
        const lattice: Lattice = [x, y, z];
        if (!isShellCubie(lattice, size)) continue;
        cubies.push(buildCubie(lattice, size, materials, geometries));
      }
    }
  }
  return cubies;
}

export function stickerMaterial(color: Color): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.04 });
}

/**
 * draw call 上界（含层轮廓描边 1 条）：4 阶 56 body + 96 sticker + 1 = 153。
 * 这是硬预算，任何新增常驻 Mesh 都必须先改这个函数并复核。
 */
export function drawCallBudget(size: number): number {
  const shell = size ** 3 - Math.max(0, size - 2) ** 3;
  return shell + size * size * 6 + 1;
}
