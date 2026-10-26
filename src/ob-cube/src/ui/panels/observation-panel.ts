/**
 * observation-panel.ts —— 右栏「观察数据」（UIUX §7.5 / §2.5.3 二级色盲补偿）
 *
 * 两条硬要求：
 *  1. `ready` 态不显示任何颜色，只显示「观察已锁定 / 开始后可读取」——
 *     锁不是错误，是设计，所以不用红色也不放大锁形大字。
 *  2. 面中心字母标记**默认开启、不可关**（PRD §11 P1：操作本身不以颜色为唯一信息载体）。
 *     颜色只通过 CSS 类引用 Token，本文件零色值。
 */

import type { FaceGrid, FaceId, StickerColor } from '../../contracts';
import { COLOR_OF_FACE } from '../../contracts';
import type { ObservationView } from '../view-model';
import { icon } from '../icons';

export interface ObservationPanelHost {
  onCopyObservationId(text: string): void;
  /** 显式获取一份观察：有门控的档（after_move / restricted）靠它交付 */
  onObserve(): void;
}

const COLOR_FACE: Readonly<Record<StickerColor, FaceId>> = {
  white: 'U',
  yellow: 'D',
  green: 'F',
  blue: 'B',
  red: 'R',
  orange: 'L',
};

const FACE_ORDER_VIEW: readonly FaceId[] = ['U', 'R', 'F', 'D', 'L', 'B'];

export class ObservationPanel {
  readonly el: HTMLElement;
  private readonly body: HTMLElement;
  private readonly meta: HTMLElement;
  private readonly observeButton: HTMLButtonElement;

  constructor(private readonly host: ObservationPanelHost) {
    this.el = document.createElement('section');
    this.el.className = 'panel';
    this.el.setAttribute('aria-label', '观察数据');

    const head = document.createElement('div');
    head.className = 'panel__head';
    const title = document.createElement('h2');
    title.className = 'panel__title-zh';
    title.textContent = '观察数据';
    this.meta = document.createElement('span');
    this.meta.className = 'datarow__k';
    head.append(title, this.meta);

    this.body = document.createElement('div');
    this.body.className = 'facelet-grids';

    // 显式取用入口：after_move「转动后开放一次」、restricted 的 24 次预算，
    // 都必须由参与者主动取，不能靠面板偷偷读到实时状态（R2-02）。
    const foot = document.createElement('div');
    foot.className = 'panel__foot';
    this.observeButton = document.createElement('button');
    this.observeButton.type = 'button';
    this.observeButton.className = 'btn btn--sm';
    this.observeButton.append(icon('eye', 16), document.createTextNode('获取观察'));
    this.observeButton.hidden = true;
    this.observeButton.addEventListener('click', () => this.host.onObserve());
    foot.append(this.observeButton);

    this.el.append(head, this.body, foot);
  }

  update(view: ObservationView): void {
    this.meta.replaceChildren();
    if (view.budgetLeft !== null) {
      const budget = document.createElement('span');
      budget.className = 'datarow__v';
      budget.textContent = `观察预算 ${view.budgetLeft}`;
      this.meta.append(budget);
    }
    if (view.observationId) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'btn btn--ghost btn--sm';
      chip.title = '复制观察 ID';
      chip.append(icon('copy', 16), document.createTextNode(view.observationId));
      chip.addEventListener('click', () => this.host.onCopyObservationId(view.observationId!));
      this.meta.append(chip);
    }
    this.observeButton.hidden = !view.canObserve;

    if (view.locked) {
      this.body.replaceChildren(this.lockedState(view.lockReason));
      return;
    }

    const grids: HTMLElement[] = [];
    for (const face of FACE_ORDER_VIEW) {
      const grid = view.faceColors[face];
      if (!grid) continue;
      grids.push(this.renderFace(face, grid));
    }
    if (grids.length === 0) {
      this.body.replaceChildren(this.lockedState(view.lockReason));
      return;
    }
    this.body.replaceChildren(...grids);

    const note = document.createElement('p');
    note.className = 'keymap__legend';
    note.textContent = `已授权 ${view.visibleFaces.length} / 6 面。未授权面不返回数据，不是空值。`;
    this.body.append(note);
  }

  private lockedState(reason: 'not-started' | 'paused' | 'no-observation' | null): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'empty';
    const title = document.createElement('span');
    title.className = 'empty__title';
    title.textContent = '观察已锁定';
    const desc = document.createElement('span');
    // 暂停期间屏蔽观察（PRD §7.2.1 P7'）：不能把暂停当无限观察用
    desc.textContent =
      reason === 'paused'
        ? '挑战已暂停，计时已冻结，观察暂不可用；继续挑战后恢复。'
        : reason === 'no-observation'
          ? '本档只显示已交付的观察快照，不显示实时状态。观察次数用尽后不再更新。'
          : '开始后可读取。本模式用于防止误看，不能阻止通过开发者工具读取内存。';
    wrap.append(title, desc);
    return wrap;
  }

  private renderFace(face: FaceId, grid: FaceGrid): HTMLElement {
    const size = grid.length;
    const wrap = document.createElement('figure');
    wrap.className = 'facelet';
    wrap.dataset.face = face;

    const caption = document.createElement('figcaption');
    caption.className = 'facelet__caption';
    caption.textContent = `${face} · ${COLOR_OF_FACE[face]}`;

    const cells = document.createElement('div');
    cells.className = 'facelet__cells';
    cells.style.gridTemplateColumns = `repeat(${size}, minmax(0, 1fr))`;
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const color = grid[row]?.[col] ?? 'white';
        const cell = document.createElement('span');
        cell.className = 'facelet__cell';
        cell.dataset.color = COLOR_FACE[color];
        cell.title = `${COLOR_FACE[color]} 面色`;
        if (isLetterCell(size, row, col)) {
          cell.dataset.label = face;
          cell.textContent = face;
        }
        cells.append(cell);
      }
    }
    wrap.append(caption, cells);
    return wrap;
  }
}

/** 奇数阶标中心 1 格；偶数阶标 4 个中心块（无单中心块） */
export function isLetterCell(size: number, row: number, col: number): boolean {
  if (size % 2 === 1) {
    const mid = (size - 1) / 2;
    return row === mid && col === mid;
  }
  const mid = size / 2;
  return (row === mid - 1 || row === mid) && (col === mid - 1 || col === mid);
}
