/**
 * status-bar.ts —— 操作区头右侧状态栏（UIUX §5.4）
 *
 * 为什么必须有「将提交」预览：前缀是可组合的（`2` + `⇧` + `D` = `Rw'`），
 * 只显示「层深 2」用户还得自己推。显示完整预览指令，用户按下之前就知道结果。
 *
 * 决策（文档未写死）：前缀态下尚未按面键，预览里的面字母取「最近一次用过的面」，
 * 从未用过时显示 `?`（--fg-disabled），表示面待定。这样既不编造，也不空着。
 */

import type { CubeSize, FaceId } from '../contracts';
import type { PrefixChar, TurnIntent } from './keymap';
import { OUTER, layerSpecOfPrefix, layersOf } from './keymap';
import { describeMove } from './move-preview';
import { kbdChip } from './kbd-chip';

export interface StatusInput {
  readonly size: CubeSize;
  readonly prefix: PrefixChar | null;
  readonly shift: boolean;
  /** 最近一次操作的面，用于前缀态预览 */
  readonly lastFace: FaceId | null;
  /** 渲染队列长度（UIUX §5.5 快速连击） */
  readonly queue: number;
}

type Tone = 'normal' | 'merged';

const LONG_MS = 1500;
const SHORT_MS = 1200;

function prefixLabel(prefix: PrefixChar, _face: FaceId | null): string {
  switch (prefix) {
    case '1':
      return '单层';
    case '2':
      return '层深 2 层';
    case '3':
      return '层深 3 层';
    case 'Z':
      return '内层（Z+本侧面键近本侧，Z+对面面键近对面）';
  }
}

export class StatusBar {
  readonly el: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly metaEl: HTMLElement;
  private flashText: string | null = null;
  private flashTone: Tone = 'normal';
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private current: StatusInput = { size: 3, prefix: null, shift: false, lastFace: null, queue: 0 };

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'statusbar';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    this.textEl = document.createElement('div');
    this.textEl.className = 'statusbar__text';
    this.metaEl = document.createElement('div');
    this.metaEl.className = 'statusbar__meta';
    this.el.append(this.textEl, this.metaEl);
    this.render();
  }

  update(input: StatusInput): void {
    this.current = input;
    this.render();
  }

  /** 一次性提示（合并 / 取消 / 非法组合），到期自动回落到常驻态 */
  flash(text: string, tone: Tone = 'normal', ms = SHORT_MS): void {
    this.flashText = text;
    this.flashTone = tone;
    if (this.flashTimer !== null) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this.flashTimer = null;
      this.flashText = null;
      this.flashTone = 'normal';
      this.render();
    }, ms);
    this.render();
  }

  destroy(): void {
    if (this.flashTimer !== null) clearTimeout(this.flashTimer);
  }

  private render(): void {
    this.textEl.replaceChildren();
    this.el.dataset.lit = String(this.current.prefix !== null || this.current.shift);
    this.el.dataset.tone = this.flashTone;

    if (this.flashText !== null) {
      this.textEl.append(document.createTextNode(this.flashText));
      this.renderMeta();
      return;
    }

    const { prefix, shift, size, lastFace } = this.current;

    if (prefix !== null) {
      this.textEl.append(kbdChip(prefix, 'prefix', true));
      this.textEl.append(document.createTextNode(` ${prefixLabel(prefix, lastFace)} → 将提交 `));
      this.appendPreview(prefix, shift, size, lastFace);
    } else if (shift) {
      this.textEl.append(kbdChip('⇧', 'mod'));
      this.textEl.append(document.createTextNode(' 反向 → 等待面键'));
    } else {
      this.textEl.append(document.createTextNode('就绪'));
    }
    this.renderMeta();
  }

  private appendPreview(prefix: PrefixChar, shift: boolean, size: CubeSize, lastFace: FaceId | null): void {
    const move = document.createElement('b');
    move.className = 'statusbar__preview';
    if (lastFace === null) {
      move.textContent = `?${prefix === '1' ? '' : 'w'}`;
      move.dataset.pending = 'true';
      this.textEl.append(move);
      return;
    }
    const intent: TurnIntent = {
      face: lastFace,
      layers: prefix === '1' ? OUTER : layerSpecOfPrefix(prefix),
      amount: shift ? 3 : 1,
      source: 'button',
    };
    const desc = describeMove(intent, size);
    const layers = layersOf(intent.layers, size).join(',');
    const tail = desc.alias ? `（${desc.alias}）` : `（第 ${layers} 层）`;
    move.textContent = desc.legal ? desc.move : '—';
    this.textEl.append(move, document.createTextNode(desc.legal ? tail : ` ${desc.reason ?? ''}`));
  }

  private renderMeta(): void {
    this.metaEl.replaceChildren();
    const sizeTag = document.createElement('span');
    sizeTag.textContent = `${this.current.size}×${this.current.size}`;
    const metric = document.createElement('span');
    metric.textContent = 'HTM';
    this.metaEl.append(sizeTag, metric);
    if (this.current.queue > 0) {
      const q = document.createElement('span');
      q.className = 'statusbar__queue';
      q.dataset.level = this.current.queue >= 5 ? 'warn' : 'normal';
      q.textContent = `执行中 ${this.current.queue}`;
      this.metaEl.append(q);
    }
  }
}

export const STATUS_FLASH = { LONG_MS, SHORT_MS } as const;
