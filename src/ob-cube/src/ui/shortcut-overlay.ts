/**
 * shortcut-overlay.ts —— 完整快捷键浮层（PRD §5.5 / UIUX §5.2 二级）
 *
 * 每段末尾都有一句「为什么这样设计」：用户不理解取舍就会自己改键位，
 * 而 MVP 不做自定义键位。这不是废话，是减少误用成本。
 *
 * 用 popover 而不是全屏 modal：玩家正在连续按键，modal 会中断节奏。
 */

import { icon } from './icons';
import { kbdChip } from './kbd-chip';

interface RowDef {
  readonly keys: readonly { text: string; kind: 'key' | 'mod' | 'prefix' | 'repeat' }[];
  readonly desc: string;
}

interface SectionDef {
  readonly title: string;
  readonly rows: readonly RowDef[];
  readonly why: string;
}

const SECTIONS: readonly SectionDef[] = [
  {
    title: '转动量',
    rows: [
      { keys: [{ text: 'W', kind: 'key' }], desc: 'U 面顺时针 90°（面键＝默认动作）' },
      { keys: [{ text: '⇧', kind: 'mod' }, { text: 'W', kind: 'key' }], desc: 'U 面逆时针 90°（Shift 反向）' },
      { keys: [{ text: 'W', kind: 'key' }, { text: '×2', kind: 'repeat' }], desc: 'U 面 180°（300ms 内连按两次同键）' },
    ],
    why: '「转两下就是 180°」是物理直觉；Shift 既是「反向」也符合撤销操作的通用直觉。三者合成 18 个外层动作。',
  },
  {
    title: '层深前缀（先按后按，不是同时按）',
    rows: [
      { keys: [{ text: '2', kind: 'prefix' }, { text: 'W', kind: 'key' }], desc: '宽转 2 层 → Uw' },
      { keys: [{ text: '3', kind: 'prefix' }, { text: 'W', kind: 'key' }], desc: '宽转 3 层 → 3Uw（仅 4 阶）' },
      { keys: [{ text: 'Z', kind: 'prefix' }, { text: 'W', kind: 'key' }], desc: '该侧内层 → 2U（3 阶即 E\'）' },
      { keys: [{ text: 'Z', kind: 'prefix' }, { text: 'X', kind: 'key' }], desc: '对面侧内层 → 2D（仅 4 阶，Z + 对面面键）' },
    ],
    why: '前缀 3 秒内没有面键输入会自动取消，并在状态栏留一句「层深已取消」——避免「以为在转外层，实际转了宽转」。',
  },
  {
    title: '视角与流程',
    rows: [
      { keys: [{ text: '←', kind: 'key' }, { text: '→', kind: 'key' }, { text: '↑', kind: 'key' }, { text: '↓', kind: 'key' }], desc: '视角 90° 步进（不计步）' },
      { keys: [{ text: 'Home', kind: 'key' }], desc: '复位默认视角（前 / 上 / 右）' },
      { keys: [{ text: 'Space', kind: 'key' }], desc: '仅待开始态＝开始挑战；进行中不绑定任何操作' },
      { keys: [{ text: 'Esc', kind: 'key' }], desc: '放弃挑战确认层（确认层内再按一次＝取消）' },
      { keys: [{ text: '?', kind: 'key' }], desc: '打开 / 关闭这份说明' },
    ],
    why: '视角旋转不改变魔方状态、不计步，与转动是两个通道，所以它们物理位置也必须分开：视角在画布右上角，转动在下方矩阵。',
  },
  {
    title: '禁用键与原因',
    rows: [
      { keys: [{ text: 'Ctrl', kind: 'key' }, { text: 'Cmd', kind: 'key' }], desc: '不注册、不拦截，完全交还浏览器（Ctrl+W / Ctrl+T 无法可靠拦截）' },
      { keys: [{ text: 'Alt', kind: 'key' }], desc: '会触发浏览器菜单栏聚焦，各浏览器表现不一致' },
      { keys: [{ text: '/', kind: 'key' }], desc: 'Firefox 快速查找。`?` 是 Shift+/，不触发它' },
      { keys: [{ text: 'Tab', kind: 'key' }], desc: '焦点切换是重要的可访问性通道，不占用' },
      { keys: [{ text: '长按', kind: 'key' }], desc: '重复事件一律忽略，避免按住不放导致误转' },
    ],
    why: '82 个动作由 12 个物理键覆盖：单手可达 + 不撞浏览器键 + 有空间记忆规律，这三条不可能同时满足于「一个动作一个键」。',
  },
];

export class ShortcutOverlay {
  readonly el: HTMLElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'popover-backdrop';
    this.el.hidden = true;
    this.el.addEventListener('click', (event) => {
      if (event.target === this.el) this.close();
    });
    this.render();
  }

  isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.el.hidden = false;
    const close = this.el.querySelector<HTMLElement>('[data-close]');
    close?.focus();
  }

  close(): void {
    this.el.hidden = true;
  }

  toggle(): void {
    if (this.isOpen()) this.close();
    else this.open();
  }

  private render(): void {
    const box = document.createElement('div');
    box.className = 'popover';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'false');
    box.setAttribute('aria-label', '快捷键说明');

    const head = document.createElement('div');
    head.className = 'popover__head';
    const title = document.createElement('h2');
    title.className = 'popover__title';
    title.textContent = '快捷键说明';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'icon-btn';
    close.dataset.close = 'true';
    close.setAttribute('aria-label', '关闭快捷键说明');
    close.append(icon('x', 16));
    close.addEventListener('click', () => this.close());
    head.append(title, close);
    box.append(head);

    for (const section of SECTIONS) box.append(this.renderSection(section));

    const note = document.createElement('p');
    note.className = 'popover__note';
    note.textContent = 'MVP 不提供自定义键位。若某键无法捕获，界面按钮是唯一保证路径。';
    box.append(note);

    this.el.replaceChildren(box);
  }

  private renderSection(section: SectionDef): HTMLElement {
    const wrap = document.createElement('section');
    wrap.className = 'popover__section';
    const heading = document.createElement('h3');
    heading.textContent = section.title;
    wrap.append(heading);

    for (const row of section.rows) {
      const line = document.createElement('div');
      line.className = 'popover__row';
      const keys = document.createElement('div');
      keys.className = 'popover__keys';
      for (const key of row.keys) keys.append(kbdChip(key.text, key.kind));
      const desc = document.createElement('span');
      desc.textContent = row.desc;
      line.append(keys, desc);
      wrap.append(line);
    }

    const why = document.createElement('p');
    why.className = 'popover__why';
    why.textContent = section.why;
    wrap.append(why);
    return wrap;
  }
}
