/**
 * cube-view.ts —— 状态 → 贴纸颜色的唯一派生点（ARCHITECTURE §8.1）
 *
 * 渲染层不持有第二份魔方语义：不维护块身份、不维护块朝向的「语义」，
 * 只保留用于精确落位的整数格坐标与整数朝向矩阵（纯几何，不含任何游戏含义）。
 *
 * `slotResolver` 由引擎提供：`(lattice, face) => slot`。
 * 这样「面片位置 ↔ facelet slot」的映射只有一份实现，渲染层不重复推导几何。
 */

import { Group, MeshStandardMaterial, Vector3 } from 'three';
import type { CubeSize, CubeStateView, FaceId } from '../contracts';
import type { Color } from 'three';
import type { CubePalette } from './palette';
import type { Axis, IntMatrix, Register } from './turn-animator';
import { INT_IDENTITY, multiplyInt, quaternionOf, rotateLattice, rot90 } from './turn-animator';
import type { Cubie, Lattice } from './cubie-factory';
import { FACE_NORMAL, buildCube, latticeToVector, stickerMaterial } from './cubie-factory';
import type { MaskMaterials } from './mask-material';
import { createMaskMaterials } from './mask-material';

export type SlotResolver = (lattice: Lattice, face: FaceId) => number;

const FACE_BY_NORMAL: Readonly<Record<string, FaceId>> = {
  '0,1,0': 'U',
  '0,-1,0': 'D',
  '0,0,1': 'F',
  '0,0,-1': 'B',
  '-1,0,0': 'L',
  '1,0,0': 'R',
};

/**
 * 贴纸的**世界**朝向 = cubie 整数朝向矩阵 × 局部法向。
 * 转动之后 cubie 已换向，直接用局部面查 slot 会把颜色贴到错误的面上。
 * 朝向矩阵元素只有 0/±1，四元数由它精确生成，取整后必定落在轴向上。
 */
function worldFaceOf(record: { orientation: IntMatrix }, local: FaceId): FaceId {
  const normal = FACE_NORMAL[local];
  const rotated = new Vector3(normal[0], normal[1], normal[2]).applyQuaternion(
    quaternionOf(record.orientation),
  );
  const key = `${Math.round(rotated.x)},${Math.round(rotated.y)},${Math.round(rotated.z)}`;
  return FACE_BY_NORMAL[key] ?? local;
}

interface Record_ {
  cubie: Cubie;
  lattice: [number, number, number];
  orientation: IntMatrix;
}

export class CubeView {
  readonly group = new Group();
  private records: Record_[] = [];
  private size: CubeSize = 3;
  private readonly faceMaterials: MeshStandardMaterial[];
  private readonly bodyMaterial: MeshStandardMaterial;
  private readonly masks: MaskMaterials;
  private dust = true;
  private resolver: SlotResolver | null = null;
  /** 观察者回放：仅这些世界面显示真实颜色，其余面用遮蔽色（null = 全部显示） */
  private reveal: ReadonlySet<FaceId> | null = null;

  constructor(private readonly palette: CubePalette) {
    this.group.name = 'cube';
    this.faceMaterials = (['U', 'R', 'F', 'D', 'L', 'B'] as FaceId[]).map((face) =>
      stickerMaterial(palette.face[face]),
    );
    this.bodyMaterial = stickerMaterial(palette.body);
    this.masks = createMaskMaterials(palette.masked);
  }

  /** 引擎接线点：传入 slot 解析函数后，`applyFacelets` 才可用 */
  setSlotResolver(resolver: SlotResolver): void {
    this.resolver = resolver;
  }

  build(size: CubeSize): void {
    this.disposeChildren();
    this.size = size;
    const cubies = buildCube(size, { body: this.masks.body, sticker: this.masks.sticker });
    this.records = cubies.map((cubie) => ({
      cubie,
      lattice: [...cubie.lattice] as [number, number, number],
      orientation: INT_IDENTITY,
    }));
    for (const record of this.records) this.group.add(record.cubie.group);
    this.setDust(this.dust);
  }

  /** 蒙尘开关：unlit 单色，探针像素须落在 --cube-masked 上（PRD AC-16，确定性探针 ΔE 判定） */
  setDust(dust: boolean): void {
    this.dust = dust;
    for (const record of this.records) {
      record.cubie.group.traverse((child) => {
        if (!('material' in child)) return;
        const mesh = child as unknown as { material: unknown };
        const isSticker = child.name.includes('-s');
        if (dust) {
          mesh.material = isSticker ? this.masks.sticker : this.masks.body;
        } else {
          mesh.material = isSticker ? this.faceMaterials[0] : this.bodyMaterial;
        }
      });
    }
  }

  /** 观察者回放：只显示授权的世界面。调用后需立刻 applyFacelets 以重绘。 */
  setReveal(faces: readonly FaceId[] | null): void {
    this.reveal = faces === null ? null : new Set(faces);
  }

  /** 按 facelet 状态逐面派生贴纸颜色。渲染层不缓存状态，每次全量重算。 */
  applyFacelets(state: CubeStateView): void {
    if (!this.resolver) throw new Error('slot 解析函数未接线：请先 setSlotResolver(engine.slotOf)');
    if (state.size !== this.size) this.build(state.size);
    // 蒙尘态下材质是 unlit 遮蔽色，颜色派生会把它覆盖回彩色贴纸 —— AC-16 直接挂。
    // 蒙尘态没有可泄露的颜色信息，直接跳过。
    if (this.dust) return;
    const resolver = this.resolver;
    for (const record of this.records) {
      for (const sticker of record.cubie.stickers) {
        const worldFace = worldFaceOf(record, sticker.face);
        if (this.reveal !== null && !this.reveal.has(worldFace)) {
          sticker.mesh.material = this.masks.sticker;
          continue;
        }
        const slot = resolver(record.lattice, worldFace);
        const colorId = state.slots[slot] ?? 0;
        const material = this.faceMaterials[colorId];
        if (material) sticker.mesh.material = material;
      }
    }
  }

  /** 该层集合包含哪些 cubie（用整数格坐标判定，与引擎层语义同源） */
  registersAt(axis: Axis, layerIndices: readonly number[]): Register[] {
    const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    return this.records
      .filter((record) => layerIndices.includes(record.lattice[index]))
      .map((record) => ({
        object: record.cubie.group,
        exact: () => {
          const p = latticeToVector(record.lattice, this.size);
          return {
            position: [p.x, p.y, p.z] as [number, number, number],
            quaternion: quaternionOf(record.orientation),
          };
        },
      }));
  }

  /**
   * 动画落位时调用：把这些 cubie 的整数格坐标与整数朝向矩阵推进一格。
   * 全程整数运算，重复几百步也不会漂移（这是「不累积变换」的实现方式）。
   */
  advance(axis: Axis, layerIndices: readonly number[], quarters: number): void {
    const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    const matrix = rot90(axis, quarters);
    for (const record of this.records) {
      if (!layerIndices.includes(record.lattice[index])) continue;
      record.lattice = rotateLattice(record.lattice, matrix, this.size);
      record.orientation = multiplyInt(matrix, record.orientation);
    }
  }

  setMono(enabled: boolean): void {
    for (const [i, face] of (['U', 'R', 'F', 'D', 'L', 'B'] as FaceId[]).entries()) {
      this.faceMaterials[i].color.copy(enabled ? this.palette.mono[face] : this.palette.face[face]);
    }
  }

  setFaceMaterial(index: number, color: Color): void {
    this.faceMaterials[index]?.color.copy(color);
  }

  private disposeChildren(): void {
    for (const record of this.records) {
      this.group.remove(record.cubie.group);
    }
    this.records = [];
  }

  dispose(): void {
    this.disposeChildren();
    this.masks.dispose();
    for (const material of this.faceMaterials) material.dispose();
  }
}
