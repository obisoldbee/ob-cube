/**
 * palette.ts —— CSS Token → THREE.Color 的唯一转换点（ARCHITECTURE §8.7）
 *
 * 本文件**不得**出现任何十六进制色值：色值只在 `ui/tokens.css` 里出现一次。
 * 启动时 `getComputedStyle` 读一次并缓存，配色调整不需要碰任何 TS 代码。
 */

import { Color } from 'three';
import type { FaceId } from '../contracts';

const FACE_TOKEN: Readonly<Record<FaceId, string>> = {
  U: '--cube-face-u',
  D: '--cube-face-d',
  F: '--cube-face-f',
  B: '--cube-face-b',
  R: '--cube-face-r',
  L: '--cube-face-l',
};

const MONO_TOKEN: Readonly<Record<FaceId, string>> = {
  U: '--cube-mono-U',
  D: '--cube-mono-D',
  F: '--cube-mono-F',
  B: '--cube-mono-B',
  R: '--cube-mono-R',
  L: '--cube-mono-L',
};

export interface CubePalette {
  readonly face: Readonly<Record<FaceId, Color>>;
  readonly mono: Readonly<Record<FaceId, Color>>;
  readonly body: Color;
  /** 蒙尘态唯一允许的探针参照色（PRD AC-16） */
  readonly masked: Color;
  readonly canvas: Color;
  /** 层轮廓描边：画布内唯一允许的 accent 元素 */
  readonly outline: Color;
}

function readVar(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (value === '') {
    throw new Error(`缺少设计 Token ${name}：ui/tokens.css 未加载，或该变量被改名`);
  }
  return value;
}

export function tokenColor(name: string): Color {
  return new Color(readVar(name));
}

export function readPalette(): CubePalette {
  const face = {} as Record<FaceId, Color>;
  const mono = {} as Record<FaceId, Color>;
  for (const key of Object.keys(FACE_TOKEN) as FaceId[]) {
    face[key] = tokenColor(FACE_TOKEN[key]);
    mono[key] = tokenColor(MONO_TOKEN[key]);
  }
  return {
    face,
    mono,
    body: tokenColor('--cube-body'),
    masked: tokenColor('--cube-masked'),
    canvas: tokenColor('--surface-canvas'),
    outline: tokenColor('--layer-outline'),
  };
}
