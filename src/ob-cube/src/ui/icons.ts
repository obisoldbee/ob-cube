/**
 * 全项目唯一图标出口（UIUX §10.2 / 反模式 #1）
 *
 * 图标源锁定 lucide-static，`?raw` 导入原始 SVG 字符串，`stroke="currentColor"`
 * 使颜色全部由 CSS Token 控制 —— 因此本文件不出现任何色值。
 * 尺寸只允许 16 / 20 / 24 三档；不覆写 stroke-width（保持同套图标粗细一致）。
 */

import ChevronDown from 'lucide-static/icons/chevron-down.svg?raw';
import ChevronLeft from 'lucide-static/icons/chevron-left.svg?raw';
import ChevronRight from 'lucide-static/icons/chevron-right.svg?raw';
import ChevronUp from 'lucide-static/icons/chevron-up.svg?raw';
import Check from 'lucide-static/icons/check.svg?raw';
import Clock from 'lucide-static/icons/clock.svg?raw';
import Copy from 'lucide-static/icons/copy.svg?raw';
import Home from 'lucide-static/icons/home.svg?raw';
import Info from 'lucide-static/icons/info.svg?raw';
import Keyboard from 'lucide-static/icons/keyboard.svg?raw';
import Pause from 'lucide-static/icons/pause.svg?raw';
import Play from 'lucide-static/icons/play.svg?raw';
import RotateCcw from 'lucide-static/icons/rotate-ccw.svg?raw';
import RotateCw from 'lucide-static/icons/rotate-cw.svg?raw';
import Settings from 'lucide-static/icons/settings.svg?raw';
import Shuffle from 'lucide-static/icons/shuffle.svg?raw';
import Square from 'lucide-static/icons/square.svg?raw';
import TriangleAlert from 'lucide-static/icons/triangle-alert.svg?raw';
import X from 'lucide-static/icons/x.svg?raw';

export type IconName =
  | 'chevron-up'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'check'
  | 'clock'
  | 'copy'
  | 'home'
  | 'info'
  | 'keyboard'
  | 'pause'
  | 'play'
  | 'rotate-ccw'
  | 'rotate-cw'
  | 'settings'
  | 'shuffle'
  | 'square'
  | 'triangle-alert'
  | 'x';

/** 只允许三档（UIUX §10.2） */
export type IconSize = 16 | 20 | 24;

const RAW: Readonly<Record<IconName, string>> = {
  'chevron-up': ChevronUp,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  check: Check,
  clock: Clock,
  copy: Copy,
  home: Home,
  info: Info,
  keyboard: Keyboard,
  pause: Pause,
  play: Play,
  'rotate-ccw': RotateCcw,
  'rotate-cw': RotateCw,
  settings: Settings,
  shuffle: Shuffle,
  square: Square,
  'triangle-alert': TriangleAlert,
  x: X,
};

export const ICON_NAMES: readonly IconName[] = Object.keys(RAW) as IconName[];

/** 把 lucide 原始字符串转成 `<svg>` 元素，并归一化尺寸 / 无障碍属性 */
export function icon(name: IconName, size: IconSize = 16): SVGSVGElement {
  const markup = RAW[name].replace(/<!--[\s\S]*?-->/g, '').trim();
  const template = document.createElement('template');
  template.innerHTML = markup;
  const svg = template.content.firstElementChild;
  if (!(svg instanceof SVGSVGElement)) {
    throw new Error(`图标 ${name} 的原始资源不是合法 <svg>`);
  }
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `lucide lucide-${name}`);
  return svg;
}

/** 在按钮内部放置一个图标（替换既有内容） */
export function mountIcon(host: HTMLElement, name: IconName, size: IconSize = 16): void {
  host.replaceChildren(icon(name, size));
}
