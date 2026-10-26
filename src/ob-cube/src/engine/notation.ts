/**
 * 记法语义层：把词法结果接到几何上（ARCHITECTURE §4.4 / §5.3）。
 *
 * 两个换算是**单一规则**而不是六张表：
 *   方向：顺时针（从面外看）= 绕该轴 +90° × (该面在轴的负侧 ? +1 : -1)；`'` 取反、`2` 取 k=2
 *   层号：记法层号 l（从被命名面算起，1-based）→ 轴索引 a：正侧面 a = N-l，负侧面 a = l-1
 *
 * 判定顺序固定（先词法后语义），保证错误码可预测（§5.4）。
 */
import { CubeError } from '../contracts';
import type { CubeSize, FaceId, MoveAmount } from '../contracts';
import { mod } from '../shared';
import { FACE_GEOMETRY, equalVec, isAxisChar, axisIndexOf, negate } from './geometry';
import type { Axis, AxisIndex } from './geometry';
import { amountOfSuffix, lexNotation, suffixText } from './notation-lex';
import type { MoveSuffix } from './notation-lex';

export type SliceId = 'M' | 'E' | 'S';
export type Pivot = FaceId | SliceId;
export type MoveKind = 'turn' | 'rotation';

export const SLICE_IDS: readonly SliceId[] = ['M', 'E', 'S'];
/** 面字母集合（不含切片） */
export const TURN_FACES: readonly FaceId[] = ['R', 'L', 'U', 'D', 'F', 'B'];

/** 切片跟随的面：M 跟 L、E 跟 D、S 跟 F（Singmaster 约定） */
const SLICE_REF_FACE: Readonly<Record<SliceId, FaceId>> = { M: 'L', E: 'D', S: 'F' };

export interface MoveSpec {
  /** 调用方原样传入 */
  readonly raw: string;
  /** ss-2 归一化后的单步记法（规范命名，见 canonicalNotation） */
  readonly normalized: string;
  readonly kind: MoveKind;
  /** 转轴 */
  readonly axis: Axis;
  readonly axisIndex: AxisIndex;
  /** 参与转动的轴索引集合（升序，从负侧数）——引擎原语只认这个 */
  readonly layerSet: readonly number[];
  /** 记法层号（1-based，从被命名面算起）。切片为中层号 */
  readonly layerIndices: readonly number[];
  /** 语义转向量：1=顺时针 2=180° 3=逆时针（从被命名面外部看） */
  readonly amount: MoveAmount;
  /** 几何转角：绕 +axis 的 90° 次数，取值 1|2|3 */
  readonly quarterTurns: 1 | 2 | 3;
  readonly pivot: Pivot | null;
  readonly wide: boolean;
  readonly rangeForm: boolean;
  readonly size: CubeSize;
}

export function isSliceId(pivot: Pivot | null): pivot is SliceId {
  return pivot === 'M' || pivot === 'E' || pivot === 'S';
}

function invertAmount(amount: MoveAmount): MoveAmount {
  return amount === 1 ? 3 : amount === 3 ? 1 : 2;
}

/**
 * 规范记法（PRD §5.7 / ARCHITECTURE §5.7 唯一命名规则）：
 *
 *  1. 层区间用离它更近的外层字母命名；等距时用正侧面（R/U/F）——
 *     这条保证 4 阶第 3 层记 `2L` 而不是 `3R`、中间两层记 `2-3R` 且只用 X 侧字母。
 *  2. 只含单层外层 → 裸面字母；奇数阶的唯一中间层 → M/E/S 族（方向跟参考面）。
 *  3. 含外层的宽转：2 层写 `Xw`（不带 2 前缀），≥3 层写 `nXw`。
 *  4. 两端都不含外层 → 区间记法 `a-bX`（无 w，本平台扩展）。
 *
 * `parseMove` 的 `normalized` 与 `describeMove` 的返回值都出自本函数，
 * 因此「日志列 = 按钮角标 = API move 字段」且 AC-71 往返恒等自动成立。
 */
export function canonicalNotation(
  size: CubeSize,
  face: FaceId,
  layers: readonly number[],
  amount: MoveAmount,
): string {
  const sorted = [...layers].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  // 就近命名：near = 离 face 的层数，far = 离对面的层数；等距归正侧面
  const near = first;
  const far = size - last + 1;
  const geometry = FACE_GEOMETRY[face];
  let namedFace = face;
  let namedAmount = amount;
  let i = first;
  let j = last;
  if (near > far || (near === far && geometry.side === -1)) {
    namedFace = faceOfNegative(face);
    namedAmount = invertAmount(amount);
    i = size + 1 - last;
    j = size + 1 - first;
  }
  const suffix = suffixText(namedAmount);
  if (i === j) {
    if (i === 1) return `${namedFace}${suffix}`;
    if (size % 2 === 1 && i === (size + 1) / 2) {
      const axis = (['x', 'y', 'z'] as const)[FACE_GEOMETRY[namedFace].axis];
      const slice = SLICE_OF_AXIS[axis];
      const sliceAmount = SLICE_REF_FACE[slice] === namedFace ? namedAmount : invertAmount(namedAmount);
      return `${slice}${suffixText(sliceAmount)}`;
    }
    return `${i}${namedFace}${suffix}`;
  }
  if (i === 1) {
    return j === 2 ? `${namedFace}w${suffix}` : `${j}${namedFace}w${suffix}`;
  }
  return `${i}-${j}${namedFace}${suffix}`;
}

const SLICE_OF_AXIS: Readonly<Record<Axis, SliceId>> = { x: 'M', y: 'E', z: 'S' };

function faceOfNegative(face: FaceId): FaceId {
  const opposite = negate(FACE_GEOMETRY[face].normal);
  for (const candidate of TURN_FACES) {
    if (equalVec(FACE_GEOMETRY[candidate].normal, opposite)) return candidate;
  }
  throw malformed('', 'internal: normal has no opposite face', 'report this as a bug');
}

function malformed(raw: string, message: string, hint: string): CubeError {
  return new CubeError('E_NOTATION_MALFORMED', `${message}（收到「${raw}」）`, hint);
}

/** 顺时针 = 绕正轴的 +90° × (负侧 ? 1 : -1)，再由转向后缀取反 / 加倍。 */
function quarterTurnsOf(side: 1 | -1, amount: MoveAmount): 1 | 2 | 3 {
  const sign = side === 1 ? -1 : 1;
  const k = mod(sign * amount, 4);
  if (k === 1 || k === 2 || k === 3) return k;
  // sign≠0 且 amount∈{1,2,3}，k 不可能为 0
  throw malformed('', 'internal: quarterTurns resolved to 0', 'report this as a bug');
}

/** 记法层号 → 轴索引。正侧面 a = N-l，负侧面 a = l-1。 */
export function axisLayerOf(size: CubeSize, side: 1 | -1, layerIndex: number): number {
  return side === 1 ? size - layerIndex : layerIndex - 1;
}

function buildTurn(
  size: CubeSize,
  face: FaceId,
  layerIndices: number[],
  amount: MoveAmount,
  wide: boolean,
  rangeForm: boolean,
  raw: string,
): MoveSpec {
  const geometry = FACE_GEOMETRY[face];
  const layerSet = layerIndices.map((l) => axisLayerOf(size, geometry.side, l)).sort((a, b) => a - b);
  // 归一化 = 规范命名（就近命名 + 家族选择），别名（2Rw/3R/2-3Rw/2R 3 阶）折叠到唯一写法
  const normalized = canonicalNotation(size, face, layerIndices, amount);
  return {
    raw,
    normalized,
    kind: 'turn',
    axis: (['x', 'y', 'z'] as const)[geometry.axis],
    axisIndex: geometry.axis,
    layerSet,
    layerIndices: [...layerIndices].sort((a, b) => a - b),
    amount,
    quarterTurns: quarterTurnsOf(geometry.side, amount),
    pivot: face,
    wide,
    rangeForm,
    size,
  };
}

function resolveLayerIndices(
  size: CubeSize,
  prefixA: number | null,
  prefixB: number | null,
  wide: boolean,
  raw: string,
): number[] {
  const out: number[] = [];
  const outOfRange = (value: number): CubeError =>
    new CubeError(
      'E_MOVE_LAYER_OUT_OF_RANGE',
      `层号 ${value} 超出 ${size} 阶的范围 1..${size}`,
      `layer_indices 只能是 1..${size}；读 allowed_actions.layer_indices`,
    );

  if (prefixA !== null && prefixB !== null) {
    if (size === 2) {
      // AC-07 / PRD §14.5：2 阶没有内层，一切带前缀的层写法都拒绝（2R 就是 L'，请写 L'）
      throw new CubeError(
        'E_MOVE_LAYER_OUT_OF_RANGE',
        '2 阶只有外层，不支持层前缀',
        '2 阶写 R / L / U / D / F / B 即可；2R 这类写法请换成对面外层（2R = L\'）',
      );
    }
    if (prefixA > prefixB) {
      throw new CubeError(
        'E_MOVE_LAYER_OUT_OF_RANGE',
        `层区间下界 ${prefixA} 大于上界 ${prefixB}`,
        '区间必须写成「小-大」，例如 2-3R',
      );
    }
    if (prefixA < 1 || prefixB > size) throw outOfRange(prefixA < 1 ? prefixA : prefixB);
    for (let l = prefixA; l <= prefixB; l += 1) out.push(l);
    return out;
  }

  if (prefixA !== null) {
    if (size === 2) {
      throw new CubeError(
        'E_MOVE_LAYER_OUT_OF_RANGE',
        '2 阶只有外层，不支持层前缀',
        '2 阶写 R / L / U / D / F / B 即可；2R 这类写法请换成对面外层（2R = L\'）',
      );
    }
    if (prefixA < 1 || prefixA > size) throw outOfRange(prefixA);
    if (wide) {
      for (let l = 1; l <= prefixA; l += 1) out.push(l);
      return out;
    }
    if (prefixA < 2) {
      throw malformed(raw, '单层切片的前缀必须 ≥ 2，1R 请直接写 R', '外层直接写 R；第 2 层写 2R');
    }
    out.push(prefixA);
    return out;
  }

  if (wide) {
    // Rw 的定义是「恰好 2 层」，不随 N 变化
    for (let l = 1; l <= Math.min(2, size); l += 1) out.push(l);
    return out;
  }

  out.push(1);
  return out;
}

function sliceSpec(size: CubeSize, slice: SliceId, suffix: MoveSuffix, raw: string): MoveSpec {
  if (size % 2 === 0) {
    throw new CubeError(
      'E_SLICE_NOT_AVAILABLE',
      `${slice} 只对奇数阶有定义，${size} 阶没有唯一中间层`,
      `改用内层写法：第 2 层写 2${SLICE_REF_FACE[slice]}${suffixText(amountOfSuffix(suffix))}`,
    );
  }
  const ref = SLICE_REF_FACE[slice];
  const geometry = FACE_GEOMETRY[ref];
  const amount = amountOfSuffix(suffix);
  const middle = (size + 1) / 2;
  return {
    raw,
    normalized: `${slice}${suffixText(amount)}`,
    kind: 'turn',
    axis: (['x', 'y', 'z'] as const)[geometry.axis],
    axisIndex: geometry.axis,
    layerSet: [(size - 1) / 2],
    layerIndices: [middle],
    amount,
    quarterTurns: quarterTurnsOf(geometry.side, amount),
    pivot: slice,
    wide: false,
    rangeForm: false,
    size,
  };
}

function rotationSpec(axis: Axis, suffix: MoveSuffix, raw: string, size: CubeSize): MoveSpec {
  const amount = amountOfSuffix(suffix);
  const allLayers: number[] = [];
  const allIndices: number[] = [];
  for (let a = 0; a < size; a += 1) allLayers.push(a);
  for (let l = 1; l <= size; l += 1) allIndices.push(l);
  const k = mod(-amount, 4);
  return {
    raw,
    normalized: `${axis}${suffixText(amount)}`,
    kind: 'rotation',
    axis,
    axisIndex: axisIndexOf(axis),
    layerSet: allLayers,
    layerIndices: allIndices,
    amount,
    quarterTurns: (k === 0 ? 2 : k) as 1 | 2 | 3,
    pivot: null,
    wide: false,
    rangeForm: false,
    size,
  };
}

/**
 * 解析单步记法。
 * 整体旋转 x/y/z 会被解析为 kind:'rotation'（§5.5：解析层支持，apply_move 拒绝）。
 */
export function parseMove(input: string, size: CubeSize): MoveSpec {
  const lexed = lexNotation(input);
  if (lexed.kind === 'multiple') {
    throw new CubeError(
      'E_NOTATION_MULTIPLE_MOVES',
      'apply_move 只接受单步转动，收到了多步序列',
      '拆成多次 apply_move 逐个提交，例如先 "R" 再 "U"',
    );
  }
  if (lexed.kind === 'malformed') {
    throw new CubeError(
      'E_NOTATION_MALFORMED',
      '无法解析为 ss-2 单步记法',
      '合法形态如 R、R\'、R2、Rw、3Rw、2-3R、2R、2L、M；可先用 parse_notation 试跑',
    );
  }

  const raw = String(input).trim();
  const { letter, wide, suffix, prefixA, prefixB } = lexed;
  const amount = amountOfSuffix(suffix);

  if (isAxisChar(letter)) {
    if (prefixA !== null || wide) {
      throw malformed(raw, '整体旋转不接受层前缀或 w', '整体旋转写作 x / y / z，且只能在 rotate_view 通道使用');
    }
    return rotationSpec(letter, suffix, raw, size);
  }

  if (/^[rludfbmes]$/.test(letter)) {
    throw new CubeError(
      'E_NOTATION_LOWERCASE',
      `面字母必须大写，「${letter}」是非法写法`,
      `改写成大写 ${letter.toUpperCase()}；注意速拧社区把 r 约定为 Rw，与 R 语义不同，所以这里直接拒绝`,
    );
  }

  if (!(TURN_FACES as readonly string[]).includes(letter) && !(SLICE_IDS as readonly string[]).includes(letter)) {
    throw malformed(raw, `未知面字母「${letter}」`, '面字母只有 U R F D L B，切片只有 M E S');
  }

  if ((SLICE_IDS as readonly string[]).includes(letter)) {
    if (prefixA !== null || wide) {
      throw malformed(raw, '切片不接受层前缀与宽转标记 w', '切片直接写 M / E / S，后缀可加 \' 或 2');
    }
    return sliceSpec(size, letter as SliceId, suffix, raw);
  }

  const face = letter as FaceId;
  const layerIndices = resolveLayerIndices(size, prefixA, prefixB, wide, raw);
  if (layerIndices.length >= size) {
    throw new CubeError(
      'E_MOVE_COVERS_ALL_LAYERS',
      `该转动覆盖了全部 ${size} 层，那是整体旋转而不是层转动`,
      '若意图是改观察方向，改用 rotate_view；层转动至少要留一层不动',
    );
  }
  return buildTurn(size, face, layerIndices, amount, wide, prefixA !== null && prefixB !== null, raw);
}

/** 两个 spec 是否表示同一动作（归一化记法相同即可）。 */
export function sameMove(a: MoveSpec, b: MoveSpec): boolean {
  return a.normalized === b.normalized;
}

/**
 * 契约口径的 `layer_set`（PRD §7.1 / AC-05）：
 * **记法层号，1-based，从（规范化后的）被命名面算起，升序**。
 *
 * 引擎原语的 `layerSet` 是「轴索引、0 基、从负侧数」，不能直接外泄给 Agent。
 * 这里以 `normalized` 重新解析一次：规范化记法的面字母就是「被命名面」，
 * 因此 `3R → 2L'` 这类就近改名也能得到正确的 `[2]`。
 */
export function protocolLayerSet(spec: MoveSpec): number[] {
  if (spec.kind === 'rotation') return [...spec.layerIndices];
  return [...parseMove(spec.normalized, spec.size).layerIndices];
}
