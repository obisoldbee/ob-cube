/**
 * kbd-chip.ts —— 快捷键角标的四种形态（UIUX §5.1 / §5.0）
 *
 * 视觉语法（这是必须区分的三件事，不能都渲染成 `Shift+D` 字符串）：
 *   修饰 = 紧贴（无间隔）        ⇧D          —— 同时按
 *   前缀 = 分离（2px + 空心）    [2] D       —— 先按后按
 *   重复 = 后缀文本              D ×2        —— 同一个键两次
 *   单键 = 实心键帽              D
 */

import type { KbdSpec } from './keymap';

export type KbdPartKind = 'key' | 'mod' | 'prefix' | 'repeat';

export function kbdChip(text: string, kind: KbdPartKind = 'key', lit = false): HTMLElement {
  const el = document.createElement('span');
  el.className = kind === 'key' ? 'kbd' : `kbd kbd--${kind}`;
  el.textContent = text;
  if (lit) el.dataset.lit = 'true';
  return el;
}

/** 完整角标（可含前缀 + 修饰 + 重复），返回可插入按钮的容器 */
export function renderKbdSpec(spec: KbdSpec, litPrefix = false): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'kbd-set';
  if (spec.prefix) wrap.append(kbdChip(spec.prefix, 'prefix', litPrefix));
  if (spec.shift) wrap.append(kbdChip('⇧', 'mod'));
  wrap.append(kbdChip(spec.key, 'key'));
  if (spec.repeat) wrap.append(kbdChip('×2', 'repeat'));
  return wrap;
}

/** 单键或「修饰 + 键」两段式（按钮上只用这两种） */
export function renderKeyAndMod(key: string, shift: boolean): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'kbd-set';
  if (shift) wrap.append(kbdChip('⇧', 'mod'));
  wrap.append(kbdChip(key, 'key'));
  return wrap;
}

/** 前缀 + 键两段式（状态栏、键位图、浮层使用） */
export function renderPrefixAndKey(prefix: string, key: string, lit = false): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'kbd-set';
  wrap.append(kbdChip(prefix, 'prefix', lit));
  wrap.append(kbdChip(key, 'key'));
  return wrap;
}
