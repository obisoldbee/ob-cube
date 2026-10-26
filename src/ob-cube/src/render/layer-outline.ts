/**
 * layer-outline.ts —— 当前转动层的外轮廓描边（UIUX §5.3 L2，**不可砍**）
 *
 * 为什么不能砍：3D 视角旋转后，「R 层」与屏幕方向脱钩。视角转到背面后，面键只编码
 * 「哪个面」不编码「哪一层」，没有这条 2px 屏幕空间恒定的板块外轮廓，4 阶操作退化为盲猜。
 *
 * 实现要点：
 *  - 描边是**物理层的轮廓**（9 个 cubie 组成的板块的 12 条棱），不是 9 张贴纸各自边框
 *  - 线宽屏幕空间恒定 2px（LineMaterial 的 linewidth + resolution），不随缩放变化
 *  - 全程复用 1 个 LineSegments2 对象，不改 draw call 上界（这就是预算里预留的那 1）
 *  - 颜色用 `--layer-outline`（信号青），是「3D 舞台区禁 accent」的唯一例外，
 *    因为它必须与六色全部冲突才看得见，且生命周期只有 --dur-turn
 */

import { BoxGeometry, EdgesGeometry, Vector3 } from 'three';
import type { Color } from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import type { Axis } from './turn-animator';

const UNIT_EDGES = new EdgesGeometry(new BoxGeometry(1, 1, 1));

/** 集合按世界坐标给出的一层（或多层）板块的 12 条棱 */
function slabSegments(axis: Axis, layers: readonly number[], size: number): number[] {
  const thickness = layers.length;
  const center = (Math.min(...layers) + Math.max(...layers)) / 2;

  const sx = axis === 'x' ? thickness : size;
  const sy = axis === 'y' ? thickness : size;
  const sz = axis === 'z' ? thickness : size;

  const pos = UNIT_EDGES.getAttribute('position');
  const out: number[] = [];
  for (let i = 0; i < pos.count; i += 1) {
    out.push(pos.getX(i) * sx, pos.getY(i) * sy, pos.getZ(i) * sz);
  }
  // 板块整体沿轴平移：整数格索引 → 世界坐标（与 cubie 用同一套换算）
  const offset = center - (size - 1) / 2;
  if (axis === 'x') for (let i = 0; i < out.length; i += 3) out[i] += offset;
  if (axis === 'y') for (let i = 1; i < out.length; i += 3) out[i] += offset;
  if (axis === 'z') for (let i = 2; i < out.length; i += 3) out[i] += offset;
  return out;
}

export class LayerOutline {
  readonly object: LineSegments2;
  private readonly material: LineMaterial;
  private readonly geometry: LineSegmentsGeometry;
  private lastKey = '';

  constructor(color: Color) {
    this.material = new LineMaterial({
      color,
      linewidth: 2,
      transparent: true,
      opacity: 1,
      depthTest: false,
    });
    this.material.resolution.set(1, 1);
    this.geometry = new LineSegmentsGeometry();
    this.object = new LineSegments2(this.geometry, this.material);
    this.object.name = 'layer-outline';
    this.object.renderOrder = 10;
    this.object.visible = false;
  }

  setResolution(width: number, height: number): void {
    this.material.resolution.set(width, height);
  }

  /** hover 预览 = 30% 透明；按下 / 已选中 = 100% */
  show(axis: Axis, layers: readonly number[], size: number, opacity = 1): void {
    if (layers.length === 0) {
      this.hide();
      return;
    }
    const key = `${axis}|${layers.join(',')}|${size}`;
    if (key !== this.lastKey) {
      this.geometry.dispose();
      const next = new LineSegmentsGeometry();
      next.setPositions(slabSegments(axis, layers, size));
      this.object.geometry = next;
      this.lastKey = key;
    }
    this.material.opacity = opacity;
    this.object.visible = true;
  }

  hide(): void {
    this.object.visible = false;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export function slabCenter(axis: Axis, layers: readonly number[], size: number): Vector3 {
  const center = (Math.min(...layers) + Math.max(...layers)) / 2 - (size - 1) / 2;
  return new Vector3(axis === 'x' ? center : 0, axis === 'y' ? center : 0, axis === 'z' ? center : 0);
}
