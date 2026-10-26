/**
 * mini-keymap.ts —— 舞台右下角常驻迷你键位图（PRD §5.5 / UIUX §5.2 一级）
 *
 * 它不是表格，是键盘片段示意图：空间记忆靠图形，表格化会毁掉它的作用。
 * 折叠状态持久化到设置（经 services 出口，不直接读 storage）。
 */

import { icon } from './icons';
import { KEY_CROSS_LAYOUT } from './keymap';

export interface MiniKeymapHost {
  isCollapsed(): boolean;
  setCollapsed(value: boolean): void;
  onOpenOverlay(): void;
}

export class MiniKeymap {
  readonly el: HTMLElement;

  constructor(private readonly host: MiniKeymapHost) {
    this.el = document.createElement('div');
    this.el.className = 'keymap';
    this.render();
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    this.el.replaceChildren();
    const collapsed = this.host.isCollapsed();
    this.el.dataset.collapsed = String(collapsed);

    if (collapsed) {
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'icon-btn';
      open.title = '展开键位图';
      open.setAttribute('aria-label', '展开键位图');
      open.append(icon('keyboard', 16));
      open.addEventListener('click', () => {
        this.host.setCollapsed(false);
        this.render();
      });
      this.el.append(open);
      return;
    }

    const head = document.createElement('div');
    head.className = 'panel__head';
    const title = document.createElement('span');
    title.className = 'slot-row__label';
    title.textContent = '面键';
    const actions = document.createElement('span');
    actions.className = 'keymap__actions';
    const expand = document.createElement('button');
    expand.type = 'button';
    expand.className = 'icon-btn';
    expand.title = '打开完整快捷键说明';
    expand.setAttribute('aria-label', '打开完整快捷键说明');
    expand.append(icon('info', 16));
    expand.addEventListener('click', () => this.host.onOpenOverlay());
    const fold = document.createElement('button');
    fold.type = 'button';
    fold.className = 'icon-btn';
    fold.title = '折叠键位图';
    fold.setAttribute('aria-label', '折叠键位图');
    fold.append(icon('chevron-down', 16));
    fold.addEventListener('click', () => {
      this.host.setCollapsed(true);
      this.render();
    });
    actions.append(expand, fold);
    head.append(title, actions);

    const cross = document.createElement('div');
    cross.className = 'keymap__cross';
    cross.setAttribute('aria-hidden', 'true');
    for (const cell of KEY_CROSS_LAYOUT) {
      const cap = document.createElement('span');
      cap.className = 'keymap__cap';
      cap.style.gridArea = cell.area;
      if (!cell.key) {
        cap.dataset.blank = 'true';
      } else {
        const k = document.createElement('b');
        k.textContent = cell.key;
        const f = document.createElement('i');
        f.textContent = cell.face;
        cap.append(k, f);
      }
      cross.append(cap);
    }

    const legend = document.createElement('p');
    legend.className = 'keymap__legend';
    legend.textContent = 'Shift 反向 · 连按两下 180° · 1/2/3/Z 层深前缀';

    this.el.append(head, cross, legend);
  }
}
