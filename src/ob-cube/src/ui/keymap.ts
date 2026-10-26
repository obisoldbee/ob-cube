/**
 * keymap.ts —— 键盘映射的唯一数据源（纯数据 + 纯函数，零 DOM，可在 node 环境单测）
 *
 * 依据：PRD §5.3 / §5.6、UIUX §5.0–§5.1
 *  - 面键按「展开图投影到左手十字」：W=U  S=F  D=R  A=L  X=D  Q=B
 *  - Shift = 反向（同时按的修饰）；数字/字母前缀 = 先按后按的「待生效状态」
 *  - 角标字符与按钮标签故意不同：`R` 按钮的角标是 `D`
 */

import type { CubeSize, FaceId, MoveAmount } from '../contracts';
import { FACE_ORDER } from '../contracts';

/** 六个面键的物理字符 */
export type FaceKeyChar = 'W' | 'A' | 'S' | 'D' | 'X' | 'Q';

/** 层深前缀的物理字符（`1` 为显式单层，与「无前缀」等价但会点亮状态栏） */
export type PrefixChar = '1' | '2' | '3' | 'Z';

export const FACE_KEY_OF: Readonly<Record<FaceId, FaceKeyChar>> = {
  U: 'W',
  R: 'D',
  F: 'S',
  D: 'X',
  L: 'A',
  B: 'Q',
};

export const FACE_OF_KEY: Readonly<Record<FaceKeyChar, FaceId>> = {
  W: 'U',
  D: 'R',
  S: 'F',
  X: 'D',
  A: 'L',
  Q: 'B',
};

export const PREFIX_CHARS: readonly PrefixChar[] = ['1', '2', '3', 'Z'];

/** 面名的中文（只出现在面卡标题与面视按钮，不出现于按钮标签） */
export const FACE_ZH: Readonly<Record<FaceId, string>> = {
  U: '上层',
  R: '右层',
  F: '前层',
  D: '下层',
  L: '左层',
  B: '后层',
};

export const FACE_VIEW_ZH: Readonly<Record<FaceId, string>> = {
  U: '上视',
  R: '右视',
  F: '前视',
  D: '下视',
  L: '左视',
  B: '后视',
};

/** 相对面成对：UIUX §4.4「默认视角可见的三面在前」 */
export const FACE_PAIRS: readonly (readonly [FaceId, FaceId])[] = [
  ['U', 'D'],
  ['R', 'L'],
  ['F', 'B'],
];

/** 默认视角可见面（顺序即单层 tab 的 L3 布局第一行） */
export const VISIBLE_FACES: readonly FaceId[] = ['U', 'R', 'F'];
export const HIDDEN_FACES: readonly FaceId[] = ['D', 'L', 'B'];

/** `opposite` 用索引异或：FACE_ORDER = [U,R,F,D,L,B]，0↔3 / 1↔4 / 2↔5 */
export function oppositeFace(face: FaceId): FaceId {
  const i = FACE_ORDER.indexOf(face);
  return FACE_ORDER[(i + 3) % 6];
}

// ---------------------------------------------------------------------------
// 层规格 —— 键盘、按钮矩阵、自由层三个通道共用的唯一表达
// ---------------------------------------------------------------------------

export type LayerSpec =
  | { readonly kind: 'outer' }
  | { readonly kind: 'wide'; readonly depth: 2 | 3 }
  | { readonly kind: 'inner'; readonly near: boolean }
  /** 自由层：1-based、从被命名面算起的层号集合 */
  | { readonly kind: 'set'; readonly layers: readonly number[] };

/** 一次「转动意图」。UI 只产出它，不产出记法字符串（记法由引擎描述，见 move-preview.ts） */
export interface TurnIntent {
  readonly face: FaceId;
  readonly layers: LayerSpec;
  readonly amount: MoveAmount;
  readonly source: 'keyboard' | 'button' | 'free-layer';
}

export const OUTER: LayerSpec = { kind: 'outer' };

/** 把层规格展开成 1-based 层号数组（从 face 算起） */
export function layersOf(spec: LayerSpec, size: CubeSize): number[] {
  switch (spec.kind) {
    case 'outer':
      return [1];
    case 'wide': {
      const out: number[] = [];
      for (let l = 1; l <= Math.min(spec.depth, size); l += 1) out.push(l);
      return out;
    }
    case 'inner':
      return spec.near ? [2] : [size - 1];
    case 'set':
      return [...spec.layers].sort((a, b) => a - b);
  }
}

/** 该层规格在当前阶数下是否合法（非法组合一律前置拦截，见 UIUX §4.5E） */
export function isLayerSpecLegal(spec: LayerSpec, size: CubeSize): boolean {
  if (spec.kind === 'inner' && size < 3) return false;
  if (spec.kind === 'wide' && spec.depth === 3 && size < 4) return false;
  const layers = layersOf(spec, size);
  if (layers.length === 0) return false;
  if (layers.length >= size) return false; // 覆盖全层 → E_MOVE_COVERS_ALL_LAYERS
  // 记法只能序列化连续区间（SPEC §3 Out-of-Scope：非连续层组合）
  for (let i = 1; i < layers.length; i += 1) {
    if (layers[i] !== layers[i - 1] + 1) return false;
  }
  return layers.every((l) => l >= 1 && l <= size);
}

/** 键盘前缀 → 层规格（`1` 等价于无前缀，仅用于点亮状态栏） */
export function layerSpecOfPrefix(prefix: PrefixChar): LayerSpec {
  switch (prefix) {
    case '1':
      return OUTER;
    case '2':
      return { kind: 'wide', depth: 2 };
    case '3':
      return { kind: 'wide', depth: 3 };
    case 'Z':
      return { kind: 'inner', near: true };
  }
}

export function prefixOfLayerSpec(spec: LayerSpec): PrefixChar | null {
  if (spec.kind === 'outer') return null;
  if (spec.kind === 'wide') return spec.depth === 2 ? '2' : '3';
  // 两个内层都走 Z 前缀：近本侧 Z+本侧面键，近对面 Z+对面面键（AC-34，无 C 前缀）
  if (spec.kind === 'inner') return 'Z';
  return null;
}

// ---------------------------------------------------------------------------
// 角标（kbd chip）描述 —— UI 只负责渲染，不负责判断形态
// ---------------------------------------------------------------------------

export interface KbdSpec {
  /** 前缀字符（空心 chip，与面键键帽 2px 分离） */
  readonly prefix: PrefixChar | null;
  /** 修饰键紧贴（⇧） */
  readonly shift: boolean;
  readonly key: FaceKeyChar;
  /** ×2 后缀（双击归并出的 180°） */
  readonly repeat: boolean;
}

export function kbdSpecOf(intent: TurnIntent): KbdSpec {
  return {
    prefix: prefixOfLayerSpec(intent.layers),
    shift: intent.amount === 3,
    key: FACE_KEY_OF[intent.face],
    repeat: intent.amount === 2,
  };
}

/** 可读回退文本，仅用于 aria-label / tooltip（不用于按钮可见标签） */
export function kbdSpecToText(spec: KbdSpec): string {
  const parts: string[] = [];
  if (spec.prefix) parts.push(spec.prefix);
  parts.push(spec.shift ? `Shift+${spec.key}` : spec.key);
  if (spec.repeat) parts.push('×2');
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// 转动量与流程键
// ---------------------------------------------------------------------------

export const AMOUNTS: readonly MoveAmount[] = [1, 2, 3];

/**
 * 迷你键位图的十字布局（PRD §5.2 的展开图投影）
 * 物理位置：Q W 在 A S D 上方，X 在 S 下方 —— Q 落在左上角，是唯一「看不见的面」。
 */
export const KEY_CROSS_LAYOUT: readonly {
  readonly key: FaceKeyChar | null;
  readonly face: FaceId | null;
  readonly area: string;
}[] = [
  { key: 'Q', face: 'B', area: '1 / 1' },
  { key: 'W', face: 'U', area: '1 / 2' },
  { key: null, face: null, area: '1 / 3' },
  { key: 'A', face: 'L', area: '2 / 1' },
  { key: 'S', face: 'F', area: '2 / 2' },
  { key: 'D', face: 'R', area: '2 / 3' },
  { key: null, face: null, area: '3 / 1' },
  { key: 'X', face: 'D', area: '3 / 2' },
  { key: null, face: null, area: '3 / 3' },
];
