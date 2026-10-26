/**
 * log-panel.ts —— 右栏「操作日志」（UIUX §7.3）
 *
 * 三条最容易做错的规则：
 *  1. 列的固定宽度 `4ch | 6ch | 5ch | auto`：日志的扫描价值全在严格对齐，禁止 flex 自动分配
 *  2. 用户手动上滚后**禁止自动滚动**（否则查历史会被拽走），改为底部提示条
 *  3. 结果标记用「图标 + 文本」双通道，**不用彩色左边框**（那是 AI 侧条纹反模式）
 */

import type { LogRow } from '../view-model';
import { EM_DASH, formatMs } from '../format';
import { icon } from '../icons';

export class LogPanel {
  readonly el: HTMLElement;
  private readonly scroll: HTMLElement;
  private readonly moreWrap: HTMLElement;
  private readonly moreBtn: HTMLButtonElement;
  private readonly emptyEl: HTMLElement;
  private pending = 0;
  private stickToBottom = true;
  private rendered = -1;
  private renderedTail = '';

  constructor() {
    this.el = document.createElement('section');
    this.el.className = 'panel panel--grow';
    this.el.setAttribute('aria-label', '操作日志');

    const head = document.createElement('div');
    head.className = 'panel__head';
    const title = document.createElement('h2');
    title.className = 'panel__title-zh';
    title.textContent = '操作日志';
    const hint = document.createElement('span');
    hint.className = 'panel__title';
    hint.textContent = 'HTM';
    head.append(title, hint);

    this.emptyEl = document.createElement('div');
    this.emptyEl.className = 'empty';
    const et = document.createElement('span');
    et.className = 'empty__title';
    et.textContent = '还没有操作记录';
    const ed = document.createElement('span');
    ed.textContent = '按键盘或点击下方按钮开始';
    this.emptyEl.append(et, ed);

    const log = document.createElement('div');
    log.className = 'log';
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');
    log.setAttribute('aria-relevant', 'additions');
    this.scroll = document.createElement('div');
    this.scroll.className = 'log__scroll';
    this.scroll.addEventListener('scroll', () => {
      const distance = this.scroll.scrollHeight - this.scroll.scrollTop - this.scroll.clientHeight;
      this.stickToBottom = distance < 40;
      if (this.stickToBottom) this.clearPending();
    });
    this.moreWrap = document.createElement('div');
    this.moreWrap.className = 'log__more';
    this.moreWrap.hidden = true;
    this.moreBtn = document.createElement('button');
    this.moreBtn.type = 'button';
    this.moreBtn.className = 'btn btn--ghost btn--sm';
    this.moreBtn.addEventListener('click', () => {
      this.stickToBottom = true;
      this.clearPending();
      this.scroll.scrollTop = this.scroll.scrollHeight;
    });
    this.moreWrap.append(this.moreBtn);
    log.append(this.scroll, this.moreWrap);

    this.el.append(head, this.emptyEl, log);
  }

  update(rows: readonly LogRow[], total: number): void {
    this.emptyEl.hidden = total > 0;
    // 差分键必须包含最后一行内容：双击归并把两条 90° 原地合并成一条 X2，
    // 总条数不变（1→1）——只看条数会把合并后的 R2 永远显示成旧值 R。
    const tail = rows.length > 0 ? `${rows[rows.length - 1].seq}|${rows[rows.length - 1].move}` : '';
    if (total === this.rendered && tail === this.renderedTail) return;
    const previous = this.rendered;
    const grew = total > previous;
    this.rendered = total;
    this.renderedTail = tail;
    this.scroll.replaceChildren(...rows.map((row, index) => this.renderRow(row, index === rows.length - 1 && grew)));
    if (this.stickToBottom) {
      this.scroll.scrollTop = this.scroll.scrollHeight;
    } else if (grew) {
      this.pending += total - Math.max(previous, 0);
      this.renderMore();
    }
  }

  private renderMore(): void {
    this.moreWrap.hidden = this.pending === 0;
    this.moreBtn.textContent = `${this.pending} 条新记录（点击回到底部）`;
  }

  private clearPending(): void {
    this.pending = 0;
    this.renderMore();
  }

  private renderRow(row: LogRow, fresh: boolean): HTMLElement {
    const el = document.createElement('div');
    el.className = 'log__row';
    if (fresh) el.dataset.fresh = 'true';
    if (row.mergedFrom) el.title = `merged_from: ${row.mergedFrom.join(' + ')}`;

    const idx = document.createElement('span');
    idx.className = 'log__idx';
    idx.textContent = `#${String(row.seq).padStart(3, '0')}`;

    const move = document.createElement('span');
    move.className = 'log__move';
    move.textContent = row.move;

    const ms = document.createElement('span');
    ms.className = 'log__ms';
    ms.textContent = row.elapsedMs > 0 ? formatMs(row.elapsedMs) : EM_DASH;

    const result = document.createElement('span');
    result.className = 'log__result';
    result.dataset.ok = String(row.ok);
    result.append(icon(row.ok ? 'check' : 'x', 16));
    result.append(document.createTextNode(row.ok ? 'OK' : (row.errorCode ?? 'NO')));

    el.append(idx, move, ms, result);
    return el;
  }
}
