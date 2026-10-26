/**
 * cube-net.ts —— 2D 展开图降级视图（PRD §12.2 第 7 条 / AC-53）
 *
 * WebGL 初始化失败时，用 6 个网格展示状态。它只读 `CubeStateView`，
 * 不持有第二份语义：颜色 id 直接对应面索引（与 engine/state.ts 同源）。
 *
 * `masked` 为 true 时（ready 且蒙尘=开 / 暂停）全部格子用遮蔽色，
 * 与 3D 路径的 AC-16 口径一致：不能因为降级就泄露题面。
 */

import { FACE_ORDER } from '../contracts';
import type { CubeSize, FaceId } from '../contracts';

const FACE_TOKEN: Readonly<Record<FaceId, string>> = {
  U: '--cube-U',
  D: '--cube-D',
  F: '--cube-F',
  B: '--cube-B',
  R: '--cube-R',
  L: '--cube-L',
};

const FACE_LABEL: Readonly<Record<FaceId, string>> = {
  U: '上',
  R: '右',
  F: '前',
  D: '下',
  L: '左',
  B: '后',
};

/** 十字展开的网格定位（上 / 中排 L F R B / 下） */
const FACE_AREA: Readonly<Record<FaceId, string>> = {
  U: '1 / 2',
  L: '2 / 1',
  F: '2 / 2',
  R: '2 / 3',
  B: '2 / 4',
  D: '3 / 2',
};

export interface NetView {
  readonly size: CubeSize;
  /** null = 尚未接线（渲染层不持有状态） */
  readonly slots: Uint8Array | null;
  /** 当前授权可见的面；未列出的面显示「未授权」而不是颜色 */
  readonly visible: readonly FaceId[];
  readonly masked: boolean;
}

export class CubeNet {
  readonly el: HTMLElement;
  private readonly note: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly cells = new Map<FaceId, HTMLElement>();
  private readonly faceGrids = new Map<FaceId, HTMLElement>();
  private size: CubeSize = 3;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'cube-net';
    this.el.setAttribute('role', 'img');
    this.el.setAttribute('aria-label', '魔方二维展开图');

    this.note = document.createElement('p');
    this.note.className = 'cube-net__note';
    this.note.textContent =
      'WebGL 不可用，已降级为 2D 展开图。键盘与按钮操作、计时与还原判定照常可用。';

    this.grid = document.createElement('div');
    this.grid.className = 'cube-net__grid';
    this.el.append(this.note, this.grid);
    this.build();
  }

  update(view: NetView): void {
    if (view.size !== this.size) {
      this.size = view.size;
      this.build();
    }
    for (const face of FACE_ORDER) {
      const cell = this.cells.get(face);
      const grid = this.faceGrids.get(face);
      if (!cell || !grid) continue;
      const visible = view.visible.includes(face) && view.slots !== null;
      cell.dataset.locked = String(!visible);
      if (!visible || !view.slots) {
        grid.replaceChildren(this.lockedLabel());
        continue;
      }
      const n = view.size;
      const base = FACE_ORDER.indexOf(face) * n * n;
      const children: HTMLElement[] = [];
      for (let i = 0; i < n * n; i += 1) {
        const slot = view.slots[base + i] ?? 0;
        const colorFace = FACE_ORDER[slot] ?? 'U';
        const sticker = document.createElement('span');
        sticker.className = 'cube-net__sticker';
        sticker.style.background = view.masked ? 'var(--cube-masked)' : `var(${FACE_TOKEN[colorFace]})`;
        children.push(sticker);
      }
      grid.replaceChildren(...children);
      grid.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
    }
  }

  private build(): void {
    this.cells.clear();
    this.faceGrids.clear();
    const panels: HTMLElement[] = [];
    for (const face of FACE_ORDER) {
      const cell = document.createElement('div');
      cell.className = 'cube-net__face';
      cell.style.gridArea = FACE_AREA[face];
      const head = document.createElement('span');
      head.className = 'cube-net__label';
      head.textContent = `${face} · ${FACE_LABEL[face]}`;
      const grid = document.createElement('div');
      grid.className = 'cube-net__stickers';
      grid.style.gridTemplateColumns = `repeat(${this.size}, 1fr)`;
      grid.append(this.lockedLabel());
      cell.append(head, grid);
      panels.push(cell);
      this.cells.set(face, cell);
      this.faceGrids.set(face, grid);
    }
    this.grid.replaceChildren(...panels);
  }

  private lockedLabel(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cube-net__locked';
    span.textContent = '未授权';
    return span;
  }
}
