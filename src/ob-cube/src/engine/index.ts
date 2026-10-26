/**
 * 引擎层公开出口。零 DOM、零浏览器 API、零浮点（整数双倍坐标）、零手写置换数组。
 *
 * 只依赖 src/shared 与冻结契约 src/contracts.ts 的类型/常量。
 */

// ---- 几何（唯一允许手写的 6 行表 + 双倍坐标） ----
export {
  AXES,
  FACE_GEOMETRY,
  areCollinear,
  axisIndexOf,
  cross,
  dot,
  doubleCoord,
  equalVec,
  faceAt,
  faceIndexOf,
  faceletLattice,
  faceletPosition,
  isAxisChar,
  isFaceId,
  negate,
  rightOf,
  rotateVector,
} from './geometry';
export type { Axis, AxisIndex, FaceGeometry, Vec3 } from './geometry';

// ---- slot 表 ----
export { getSlotTable, slotIndexOf, slotKey } from './slots';
export type { SlotTable } from './slots';

// ---- 置换（程序化生成） ----
export {
  applyPermutation,
  composePermutation,
  cycleStructure,
  equalPerm,
  identityPermutation,
  invertPermutation,
  isIdentity,
  layerSetPermutation,
  movedSlotCount,
  permutationForAxis,
  permutationOrder,
  singleLayerPermutation,
} from './permutation';
export type { CycleStructure, Perm } from './permutation';

// ---- 记法 ----
export {
  SLICE_IDS,
  TURN_FACES,
  axisLayerOf,
  isSliceId,
  parseMove,
  protocolLayerSet,
  sameMove,
} from './notation';
export type { MoveKind, MoveSpec, Pivot, SliceId } from './notation';
export { amountOfSuffix, lexNotation, suffixText } from './notation-lex';
export type { LexResult, LexedMove, MoveSuffix } from './notation-lex';
export { describeMove, invertNotation } from './notation-normalize';
export type { DescribeRequest } from './notation-normalize';

// ---- move_catalog ----
export {
  EXPECTED_CATALOG_SIZE,
  actionKey,
  canonicalEntries,
  catalogEntryFor,
  getMoveCatalog,
  moveCatalogNotations,
  notationForAction,
} from './catalog';
export type { CatalogEntry, MoveCatalog } from './catalog';

// ---- 状态 ----
export {
  applyMove,
  cloneState,
  createSolvedState,
  createStateFromSlots,
  equalState,
  faceGrid,
  faceOfColor,
  faceStickers,
  fingerprintState,
  slotCountOf,
  toStateView,
} from './state';
export type { CubeState } from './state';

// ---- 还原判定 ----
export { evaluateSolved, isSolved } from './solved';
export type { SolvedReason, SolvedVerdict } from './solved';
