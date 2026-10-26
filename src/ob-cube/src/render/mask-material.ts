/**
 * mask-material.ts —— 蒙尘材质（PRD AC-16 / execution/ui-visual.md §6.1、execution/UIUX.md §10.4）
 *
 * 三条不可协商：
 *  1. **unlit**：`MeshBasicMaterial`，不接任何光照。用 PBR + 方向光会让每个面亮度不同，
 *     探针像素就会偏离 --cube-masked，AC-16 的断言①（ΔE ≤ 2）直接失败。
 *     注：AC-16 的判据是「确定性探针 ΔE」，不是旧口径「画布像素颜色种类 ≤2」——
 *     后者在开启抗锯齿后恒假（MSAA 边缘必有过渡色），PRD v1.5 已明令废止。
 *  2. 颜色只读 `--cube-masked`，**不得**读 `--cube-face-*`：这样即使有人翻 DevTools，
 *     材质里也没有真色可读。
 *  3. 无纹理、无噪点、无凹槽、无描边。`--cube-dust-grain` / `--cube-dust-rough`
 *     两个 Token 已作废，**禁止读取**。
 */

import { MeshBasicMaterial } from 'three';
import type { Color } from 'three';

export interface MaskMaterials {
  /** cubie 体色（蒙尘时同色） */
  readonly body: MeshBasicMaterial;
  /** 贴纸面（蒙尘时同色，与体色完全一致 → 像素颜色只有 1 种） */
  readonly sticker: MeshBasicMaterial;
  setColor(color: Color): void;
  dispose(): void;
}

export function createMaskMaterials(color: Color): MaskMaterials {
  const body = new MeshBasicMaterial({ color: color.clone(), toneMapped: false });
  const sticker = new MeshBasicMaterial({ color: color.clone(), toneMapped: false });
  return {
    body,
    sticker,
    setColor(next: Color) {
      body.color.copy(next);
      sticker.color.copy(next);
    },
    dispose() {
      body.dispose();
      sticker.dispose();
    },
  };
}
