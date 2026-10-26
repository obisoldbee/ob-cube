/**
 * render/index.ts —— 渲染层公共出口
 *
 * 依赖方向（SPEC §4）：`render/` 只依赖 engine 的类型 + shared，
 * 不得 import ui/ 或 services/。颜色全部来自 CSS Token（palette.ts）。
 */

export { createCubeStage, measureFrameBudget } from './scene';
export type { CubeStage, FrameBudget } from './scene';
export { CubeView } from './cube-view';
export type { SlotResolver } from './cube-view';
export { CameraRig, DEFAULT_VIEW, directionOf, shortestAngle } from './camera-rig';
export { LayerOutline, slabCenter } from './layer-outline';
export {
  TurnAnimator,
  INT_IDENTITY,
  axisVector,
  easeOutCubic,
  multiplyInt,
  quaternionOf,
  rotateLattice,
  rot90,
} from './turn-animator';
export type { Axis, IntMatrix, Register, TurnAnimation } from './turn-animator';
export { createMaskMaterials } from './mask-material';
export { drawCallBudget, latticeToWorld, latticeToVector, FACE_NORMAL } from './cubie-factory';
export { readPalette, tokenColor } from './palette';
export type { CubePalette } from './palette';
