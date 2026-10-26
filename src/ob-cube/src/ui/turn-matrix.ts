/**
 * turn-matrix.ts —— 中栏转动按钮矩阵（本项目交互最复杂的组件）
 *
 * 硬约束：
 *  - 数据驱动：6 面 × 3 变体的 18 个按钮由 `buildMatrixSpec` 生成，不手写
 *  - 标签一律 Singmaster（`R` / `R'` / `R2` / `Rw` / `2R`），中文只出现在面卡标题
 *  - 角标显示键盘字符，与标签**故意不同**（`R` 按钮的角标是 `D`）
 *  - 三种变体宽度 `1fr / 0.8fr / 1fr`：180° 视觉更窄，避免「整齐三等分」的模板感
 *  - 转动按钮零颜色编码（18 个键同色），颜色编码会和魔方六色打架
 */

import type { CubeSize, FaceId } from '../contracts';
import type { LayerSpec, PrefixChar, TurnIntent } from './keymap';
import { FACE_ZH } from './keymap';
import { renderKbdSpec } from './kbd-chip';
import { FreePanel } from './turn-matrix-free';
import type { TabId, TurnButtonDef } from './turn-matrix-data';
import { buildMatrixSpec, defaultTabFor, PREFIX_HELP, TAB_HELP, tabsFor } from './turn-matrix-data';
import { icon } from './icons';

/** hover 预览目标：只有知道「哪个面 + 哪几层」才能算出唯一的轴与物理层集合 */
export interface LayerHoverTarget {
  readonly face: FaceId;
  readonly layers: LayerSpec;
}

export interface TurnMatrixHost {
  onTurn(intent: TurnIntent): void;
  /** hover 转动按钮 / 层槽 → 该层集合的 3D 外轮廓（30% 透明，UIUX §4.8） */
  onLayerHover(target: LayerHoverTarget | null): void;
  onPrefixSync(prefix: PrefixChar | null): void;
}

export class TurnMatrix {
  readonly el: HTMLElement;
  readonly tablist: HTMLElement;
  private size: CubeSize;
  private tab: TabId;
  private innerPosition: 2 | 3 = 2;
  private free: FreePanel | null = null;
  private readonly grid: HTMLElement;
  private readonly subbar: HTMLElement;
  private helpOverlay: HTMLElement;
  private locked = false;

  constructor(
    size: CubeSize,
    private readonly host: TurnMatrixHost,
  ) {
    this.size = size;
    this.tab = defaultTabFor(size);
    this.el = document.createElement('div');
    this.el.className = 'matrix';
    this.el.setAttribute('aria-label', '转动按钮矩阵');
    this.tablist = document.createElement('div');
    this.tablist.className = 'tabs';
    this.tablist.setAttribute('role', 'tablist');
    this.tablist.setAttribute('aria-label', '转动层分类');
    this.subbar = document.createElement('div');
    this.subbar.className = 'matrix__subbar';
    this.grid = document.createElement('div');
    this.grid.className = 'matrix__grid';
    this.helpOverlay = this.buildHelpOverlay();
    this.el.append(this.subbar, this.grid, this.helpOverlay);
    this.render();
  }

  /**
   * v1.9（AC-28）：非 running 态整体锁死。
   * 旧实现里矩阵按钮永远可点，点击后靠会话层抛错兜底——用户看到的是
   * "按了没反应"，而不是"明确禁止"。锁死必须发生在状态迁移的同一帧。
   * 注意不能在容器上设 aria-disabled：Chromium 会把它传染给 tab 行与说明
   * 按钮，连"看说明"都点不了。禁用语义只作用于转动按钮本身。
   */
  setEnabled(enabled: boolean): void {
    if (this.locked === !enabled) return;
    this.locked = !enabled;
    this.applyLock();
  }

  /** 视觉 + 按钮禁用双保险；render() 重建 DOM 后也要重放（见 render()） */
  private applyLock(): void {
    this.el.classList.toggle("matrix--locked", this.locked);
    this.grid.querySelectorAll<HTMLButtonElement>("button").forEach((btn) => {
      btn.disabled = this.locked;
    });
    // 层位选择器（subbar 里的 slot-chip）也锁，但说明按钮除外——文档任何时刻可看
    this.subbar
      .querySelectorAll<HTMLButtonElement>("button:not(.matrix__help)")
      .forEach((btn) => {
        btn.disabled = this.locked;
      });
  }

  getTab(): TabId {
    return this.tab;
  }

  setTab(tab: TabId): void {
    if (tab === this.tab) return;
    this.tab = tab;
    this.render();
  }

  setSize(size: CubeSize): void {
    if (size === this.size) return;
    this.size = size;
    if (!tabsFor(size).some((t) => t.id === this.tab)) this.tab = defaultTabFor(size);
    // 说明弹层随阶数重建（tab 家族随阶数变化，如 3 阶无内层/宽转 3）
    this.helpOverlay.replaceWith((this.helpOverlay = this.buildHelpOverlay()));
    this.el.append(this.helpOverlay);
    this.render();
  }

  private render(): void {
    this.renderTabs();
    this.renderSubbar();
    this.renderBody();
    this.applyLock();
    const compact = document.documentElement.clientHeight < 700;
    this.el.classList.toggle("matrix--compact", compact);
  }

  private renderTabs(): void {
    this.tablist.replaceChildren();
    for (const def of tabsFor(this.size)) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'tab';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(def.id === this.tab));
      tab.id = `tab-${def.id}`;
      tab.textContent = def.label;
      tab.addEventListener('click', () => this.setTab(def.id));
      tab.addEventListener('keydown', (event) => {
        const tabs = tabsFor(this.size);
        const index = tabs.findIndex((t) => t.id === this.tab);
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        event.stopPropagation();
        const next = event.key === 'ArrowRight' ? index + 1 : index - 1;
        this.setTab(tabs[(next + tabs.length) % tabs.length].id);
      });
      this.tablist.append(tab);
    }
  }

  /**
   * v1.9：层转说明入口（用户反馈"不知道单层/双层/宽转的区别"）。
   * 挂在 subbar 行尾而不是 tablist 内——tablist 的 children 必须只有 tab
   * （PRD §3.4 的 2/3/5 组验收 + role=tablist 的 ARIA 语义）。
   * AC-54 约束图标必须是 <svg>（lucide info），禁 emoji。
   */
  private buildHelpButton(): HTMLButtonElement {
    const help = document.createElement('button');
    help.type = 'button';
    help.className = 'icon-btn matrix__help';
    help.setAttribute('aria-label', '层转分类说明');
    help.title = '单层 / 宽转 / 内层是什么？';
    help.append(icon('info', 16));
    help.addEventListener('click', () => this.openHelp());
    return help;
  }

  openHelp(): void {
    this.helpOverlay.hidden = false;
    this.helpOverlay.querySelector<HTMLElement>('[data-close]')?.focus();
  }

  private buildHelpOverlay(): HTMLElement {
    const backdrop = document.createElement('div');
    backdrop.className = 'popover-backdrop popover-backdrop--local';
    backdrop.hidden = true;
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) backdrop.hidden = true;
    });

    const box = document.createElement('div');
    box.className = 'popover popover--help';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'false');
    box.setAttribute('aria-label', '层转分类说明');

    const head = document.createElement('div');
    head.className = 'popover__head';
    const title = document.createElement('h2');
    title.className = 'popover__title';
    title.textContent = '转动层分类说明';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'icon-btn';
    close.dataset.close = 'true';
    close.setAttribute('aria-label', '关闭层转说明');
    close.append(icon('x', 16));
    close.addEventListener('click', () => {
      backdrop.hidden = true;
    });
    head.append(title, close);
    box.append(head);

    const section = document.createElement('div');
    section.className = 'popover__section';
    for (const def of tabsFor(this.size)) {
      const block = document.createElement('div');
      block.className = 'help-block';
      const name = document.createElement('h3');
      name.textContent = def.label;
      block.append(name);
      for (const line of TAB_HELP[def.id]) {
        const p = document.createElement('p');
        p.textContent = line;
        block.append(p);
      }
      section.append(block);
    }
    box.append(section);

    const prefixBlock = document.createElement('div');
    prefixBlock.className = 'popover__section';
    const prefixTitle = document.createElement('h3');
    prefixTitle.textContent = '键盘层深前缀（先按前缀，再按面键）';
    prefixBlock.append(prefixTitle);
    const table = document.createElement('div');
    table.className = 'help-table';
    for (const row of PREFIX_HELP) {
      const line = document.createElement('div');
      line.className = 'help-table__row';
      const key = document.createElement('span');
      key.className = 'help-table__key';
      key.textContent = row.prefix;
      const meaning = document.createElement('span');
      meaning.textContent = row.meaning;
      const example = document.createElement('span');
      example.className = 'help-table__example';
      example.textContent = row.example;
      line.append(key, meaning, example);
      table.append(line);
    }
    prefixBlock.append(table);
    box.append(prefixBlock);

    const note = document.createElement('p');
    note.className = 'popover__note';
    note.textContent = '按钮标签就是该按钮实际提交的记法；角标是键盘字符（R 按钮的角标是 D）。视角旋转不转层、不计步。';
    box.append(note);

    backdrop.replaceChildren(box);
    return backdrop;
  }

  private renderSubbar(): void {
    this.subbar.replaceChildren();
    if (this.tab === 'inner') {
      this.subbar.append(this.segmented('层位', ['2', '3'], String(this.innerPosition), (value) => {
        this.innerPosition = value === '3' ? 3 : 2;
        this.render();
      }));
    } else if (this.tab === 'free') {
      const hint = document.createElement('span');
      hint.className = 'slot-row__label';
      hint.textContent = '任意层组合：先选轴，再勾层，最后选转向';
      this.subbar.append(hint);
    }
    this.subbar.append(this.buildHelpButton());
  }

  private segmented(
    label: string,
    options: readonly string[],
    current: string,
    onPick: (value: string) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'slot-row';
    const text = document.createElement('span');
    text.className = 'slot-row__label';
    text.textContent = label;
    const slots = document.createElement('div');
    slots.className = 'slots';
    slots.setAttribute('role', 'radiogroup');
    slots.setAttribute('aria-label', label);
    for (const option of options) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'slot-chip';
      chip.dataset.checked = String(option === current);
      chip.setAttribute('role', 'radio');
      chip.setAttribute('aria-checked', String(option === current));
      chip.textContent = option;
      chip.addEventListener('click', () => onPick(option));
      slots.append(chip);
    }
    row.append(text, slots);
    return row;
  }

  private renderBody(): void {
    this.grid.replaceChildren();
    this.grid.dataset.layout = 'L3';
    if (this.tab === 'free') {
      this.grid.dataset.layout = 'L1';
      this.free = new FreePanel(this.size, {
        onTurn: (intent) => this.host.onTurn(intent),
        onPrefixSync: (prefix) => this.host.onPrefixSync(prefix),
        onHover: (target) => this.host.onLayerHover(target),
      });
      this.grid.append(this.free.el);
      return;
    }
    const spec = buildMatrixSpec(this.tab, this.size, this.innerPosition);
    if (document.documentElement.clientWidth < 1280) this.grid.dataset.layout = 'L2';
    for (const group of spec.groups) {
      this.grid.append(this.renderFaceCard(group.label, group.zh, group.buttons, group.id));
    }
  }

  private renderFaceCard(
    label: string,
    zh: string,
    buttons: readonly TurnButtonDef[],
    id: string,
  ): HTMLElement {
    const card = document.createElement('div');
    card.className = 'face-card';
    card.dataset.group = id;
    const first = buttons[0];
    const face = first?.intent.face;
    card.addEventListener('pointerenter', () => {
      card.dataset.hover = 'true';
      if (first) this.host.onLayerHover({ face: first.intent.face, layers: first.intent.layers });
    });
    card.addEventListener('pointerleave', () => {
      delete card.dataset.hover;
      this.host.onLayerHover(null);
    });

    const head = document.createElement('div');
    head.className = 'face-card__head';
    const labelEl = document.createElement('span');
    labelEl.className = 'face-card__label';
    labelEl.textContent = label;
    const zhEl = document.createElement('span');
    zhEl.className = 'face-card__zh';
    zhEl.textContent = face ? FACE_ZH[face] : zh;
    head.append(labelEl, zhEl);

    const keys = document.createElement('div');
    keys.className = 'face-card__keys';
    for (const def of buttons) keys.append(this.renderTurnButton(def));
    card.append(head, keys);
    return card;
  }

  private renderTurnButton(def: TurnButtonDef): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'turn-btn';
    btn.dataset.move = def.label;
    btn.setAttribute('aria-label', def.aria);
    btn.title = `${def.aria}${def.kbd ? `（键 ${def.kbd.prefix ?? ''}${def.kbd.shift ? '⇧' : ''}${def.kbd.key}）` : ''}`;
    // 标签放进独立 span：textContent 会连角标一起读出来，屏幕阅读器会把「U」读成「UW」
    const labelSpan = document.createElement('span');
    labelSpan.className = 'turn-btn__label';
    labelSpan.textContent = def.label;
    btn.append(labelSpan);
    if (def.kbd) {
      const badge = document.createElement('span');
      badge.className = 'turn-btn__kbd';
      badge.append(renderKbdSpec(def.kbd));
      btn.append(badge);
    } else {
      btn.dataset.kbdHidden = 'true';
    }
    btn.addEventListener('pointerenter', () =>
      this.host.onLayerHover({ face: def.intent.face, layers: def.intent.layers }),
    );
    btn.addEventListener('pointerleave', () => this.host.onLayerHover(null));
    btn.addEventListener('focus', () =>
      this.host.onLayerHover({ face: def.intent.face, layers: def.intent.layers }),
    );
    btn.addEventListener('blur', () => this.host.onLayerHover(null));
    btn.addEventListener('click', () => this.host.onTurn(def.intent));
    return btn;
  }
}

export type { TabId } from './turn-matrix-data';
