/**
 * history-panel.ts —— 右栏「历史运行」（F11，PRD §2.2 步骤 1 + §9.3）。
 *
 * 三条硬要求：
 *  1. 最近 5 条按时间倒序；数据来自 services/history 的 list()，本面板零存储逻辑。
 *  2. 空状态用具体可读文案（§9.3：不得用「暂无数据」这类空洞占位）。
 *  3. 损坏记录显示「这次运行的记录无法读取」并提供「删除该记录 / 导出原始数据」，
 *     不静默丢弃。run-index 本身损坏时只提示，不给删除按钮（删索引等于清空全部历史）。
 */

import type { HistoryRowView, HistoryView } from '../view-model';

export interface HistoryPanelHost {
  onDeleteRecord(id: string): void;
  onExportRecord(id: string): void;
}

/** PRD §2.2：右栏只展示最近 5 条 */
const MAX_ROWS = 5;

export class HistoryPanel {
  readonly el: HTMLElement;
  private readonly body: HTMLElement;
  private readonly meta: HTMLElement;
  private lastSignature = '';

  constructor(private readonly host: HistoryPanelHost) {
    this.el = document.createElement('section');
    this.el.className = 'panel panel--history';
    this.el.setAttribute('aria-label', '历史运行');

    const head = document.createElement('div');
    head.className = 'panel__head';
    const title = document.createElement('h2');
    title.className = 'panel__title-zh';
    title.textContent = '历史运行';
    this.meta = document.createElement('span');
    this.meta.className = 'panel__head-note';
    head.append(title, this.meta);

    this.body = document.createElement('div');
    this.body.className = 'history-list';
    this.el.append(head, this.body);
  }

  update(view: HistoryView): void {
    const signature = JSON.stringify(view);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.render(view);
  }

  private render(view: HistoryView): void {
    this.meta.textContent = view.canPersist ? `最近 ${Math.min(view.rows.length, MAX_ROWS)} 条` : '存储不可用';
    const parts: HTMLElement[] = view.corrupt.map((entry) => this.corruptRow(entry.id));
    if (view.rows.length === 0) {
      parts.push(this.emptyState());
    } else {
      for (const row of view.rows.slice(0, MAX_ROWS)) parts.push(this.recordRow(row));
    }
    this.body.replaceChildren(...parts);
  }

  private emptyState(): HTMLElement {
    const p = document.createElement('p');
    p.className = 'history-list__empty';
    p.textContent = '还没有运行记录。创建第一个挑战后，这里会按时间倒序列出结果。';
    return p;
  }

  private recordRow(row: HistoryRowView): HTMLElement {
    const item = document.createElement('div');
    item.className = 'history-list__item';
    item.dataset.runId = row.runId;

    const badge = document.createElement('span');
    badge.className = `history-badge history-badge--${row.solved ? 'solved' : 'unsolved'}`;
    badge.textContent = row.resultLabel;

    const facts = document.createElement('span');
    facts.className = 'history-list__facts';
    facts.textContent = `${row.sizeText} · ${row.moveText} · ${row.elapsedText}`;

    const time = document.createElement('span');
    time.className = 'history-list__time';
    time.textContent = row.savedAtText;

    item.append(badge, facts, time);
    return item;
  }

  private corruptRow(id: string): HTMLElement {
    const item = document.createElement('div');
    item.className = 'history-list__item history-list__item--corrupt';
    const note = document.createElement('span');
    note.className = 'history-list__facts';
    note.textContent = '这次运行的记录无法读取';
    item.append(note);
    // 索引键损坏没有对应的单条记录可删；给删除按钮会误导用户「清掉一条」
    if (id.startsWith('run:')) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn--ghost btn--sm';
      del.textContent = '删除该记录';
      del.addEventListener('click', () => this.host.onDeleteRecord(id.slice('run:'.length)));
      const raw = document.createElement('button');
      raw.type = 'button';
      raw.className = 'btn btn--ghost btn--sm';
      raw.textContent = '导出原始数据';
      raw.addEventListener('click', () => this.host.onExportRecord(id));
      item.append(del, raw);
    }
    return item;
  }
}
