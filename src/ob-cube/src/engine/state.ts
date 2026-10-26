/**
 * facelet 状态（ARCHITECTURE §3）：`Uint8Array(6·N²)`，slot = faceIndex·N² + row·N + col，
 * 颜色 id 直接用面名（0=U,1=R,2=F,3=D,4=L,5=B），因此引擎内不出现任何色值。
 *
 * 状态不可变：每次转动返回新数组。4 阶也只有 96 字节，纯函数带来的可测试性远大于拷贝成本。
 */
import { FACE_ORDER } from '../contracts';
import type { ColorId, CubeSize, CubeStateView, FaceId, Fingerprint } from '../contracts';
import { fp32, invariant } from '../shared';
import { faceIndexOf } from './geometry';
import type { MoveSpec } from './notation';
import { applyPermutation, layerSetPermutation } from './permutation';

export interface CubeState {
  readonly size: CubeSize;
  readonly slots: Uint8Array;
}

const SLOT_COUNT: Readonly<Record<CubeSize, number>> = { 2: 24, 3: 54, 4: 96 };

export function slotCountOf(size: CubeSize): number {
  return SLOT_COUNT[size];
}

export function createSolvedState(size: CubeSize): CubeState {
  const per = size * size;
  const slots = new Uint8Array(slotCountOf(size));
  for (let faceIndex = 0; faceIndex < 6; faceIndex += 1) {
    for (let i = 0; i < per; i += 1) slots[faceIndex * per + i] = faceIndex;
  }
  return { size, slots };
}

export function createStateFromSlots(size: CubeSize, slots: Uint8Array | readonly number[]): CubeState {
  invariant(slots.length === slotCountOf(size), `slot count ${slots.length} != ${slotCountOf(size)}`);
  const copy = new Uint8Array(slots.length);
  for (let i = 0; i < slots.length; i += 1) {
    const value = slots[i];
    invariant(value >= 0 && value <= 5, `illegal color id ${value} at slot ${i}`);
    copy[i] = value;
  }
  return { size, slots: copy };
}

export function cloneState(state: CubeState): CubeState {
  return { size: state.size, slots: new Uint8Array(state.slots) };
}

export function equalState(a: CubeState, b: CubeState): boolean {
  if (a.size !== b.size) return false;
  for (let i = 0; i < a.slots.length; i += 1) if (a.slots[i] !== b.slots[i]) return false;
  return true;
}

/**
 * 应用一个单步动作。整体旋转（kind:'rotation'）在这里被拒绝——它只属于 rotate_view。
 * 宽转/区间/切片由「不相交层的复合置换」一次完成（层间不相交，复合顺序无关）。
 */
export function applyMove(state: CubeState, spec: MoveSpec): CubeState {
  invariant(spec.kind === 'turn', 'rotation must not enter state (use rotate_view)');
  invariant(spec.size === state.size, `move size ${spec.size} != state size ${state.size}`);
  const perm = layerSetPermutation(state.size, spec.axisIndex, spec.layerSet, spec.quarterTurns);
  return { size: state.size, slots: applyPermutation(state.slots, perm) };
}

/** 某面的贴纸颜色（行优先扁平数组，长度 N²）。 */
export function faceStickers(state: CubeState, face: FaceId): ColorId[] {
  const per = state.size * state.size;
  const base = faceIndexOf(face) * per;
  const out: ColorId[] = [];
  for (let i = 0; i < per; i += 1) out.push(state.slots[base + i] as ColorId);
  return out;
}

/** 某面的二维颜色矩阵，行 0 = 该面正视时的上沿，列 0 = 左沿。 */
export function faceGrid(state: CubeState, face: FaceId): ColorId[][] {
  const n = state.size;
  const flat = faceStickers(state, face);
  const grid: ColorId[][] = [];
  for (let row = 0; row < n; row += 1) {
    grid.push(flat.slice(row * n, row * n + n));
  }
  return grid;
}

/** 颜色 id → 面名（供 to-wire 映射成 StickerColor）。 */
export function faceOfColor(color: ColorId): FaceId {
  const face = FACE_ORDER[color];
  invariant(face !== undefined, `illegal color id ${color}`);
  return face;
}

/**
 * 状态指纹：fp32(facelet 数字串)。
 *
 * 正确用途只有一个：校验「同一段序列在同一版本引擎上重放出同一结果」。
 * 它不是局面等价性判据——两个不同动作序列可能得到同一个魔方但不同的数组（§3.5）。
 */
export function fingerprintState(state: CubeState): Fingerprint {
  let text = '';
  for (let i = 0; i < state.slots.length; i += 1) text += String.fromCharCode(48 + state.slots[i]);
  return fp32(text);
}

/** 渲染层只读视图：给一份副本，避免渲染层意外持有可写引用。 */
export function toStateView(state: CubeState): CubeStateView {
  return { size: state.size, slots: new Uint8Array(state.slots) };
}
