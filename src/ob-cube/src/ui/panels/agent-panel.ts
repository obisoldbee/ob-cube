/**
 * agent-panel.ts —— 右栏「Agent 会话」（UIUX §7.6）
 *
 * 数字要密，未接入时全部显示 `—`（em dash 而不是 0——0 会被误读成「调用过 0 次」）。
 * 「上一次观察 ID」必须显示且可复制：它是 Agent 操作的溯源锚点，
 * 也是这个平台区别于普通魔方游戏的核心信息。
 */

import type { AgentView } from '../view-model';
import { EM_DASH, formatMs } from '../format';
import { icon } from '../icons';

export interface AgentPanelHost {
  onCopyObservationId(text: string): void;
}

export class AgentPanel {
  readonly el: HTMLElement;
  private readonly dot: HTMLElement;
  private readonly statusText: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly counters: HTMLElement;
  private readonly obsSlot: HTMLElement;

  constructor(private readonly host: AgentPanelHost) {
    this.el = document.createElement('section');
    this.el.className = 'panel';
    this.el.setAttribute('aria-label', 'Agent 会话');

    const head = document.createElement('div');
    head.className = 'panel__head';
    const title = document.createElement('h2');
    title.className = 'panel__title-zh';
    title.textContent = 'Agent 会话';
    head.append(title);

    const status = document.createElement('div');
    status.className = 'agent__head';
    this.dot = document.createElement('span');
    this.dot.className = 'agent__dot';
    this.dot.dataset.state = 'idle';
    this.statusText = document.createElement('span');
    this.statusText.textContent = '未连接 Agent';
    status.append(this.dot, this.statusText);

    this.progress = document.createElement('div');
    this.progress.className = 'agent__progress';
    this.progress.dataset.active = 'false';

    this.counters = document.createElement('div');
    this.counters.className = 'agent__grid';

    this.obsSlot = document.createElement('div');
    this.obsSlot.className = 'datarow';

    this.el.append(head, status, this.progress, this.counters, this.obsSlot);
    this.counters.append(
      this.counter('工具调用', EM_DASH),
      this.counter('观察', EM_DASH),
      this.counter('操作', EM_DASH),
      this.counter('平均单步', EM_DASH),
    );
  }

  private counter(key: string, value: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'datarow';
    row.dataset.role = 'counter';
    const k = document.createElement('span');
    k.className = 'datarow__k';
    k.textContent = key;
    const v = document.createElement('span');
    v.className = 'datarow__v';
    v.textContent = value;
    row.append(k, v);
    return row;
  }

  update(view: AgentView): void {
    this.dot.dataset.state = view.state;
    this.statusText.textContent = view.statusText;
    this.progress.dataset.active = String(view.progressActive);

    const values = [
      view.callCount === null ? EM_DASH : String(view.callCount),
      view.observeCount === null ? EM_DASH : String(view.observeCount),
      view.moveCount === null ? EM_DASH : String(view.moveCount),
      view.avgStepMs === null ? EM_DASH : formatMs(view.avgStepMs),
    ];
    const rows = this.counters.querySelectorAll<HTMLElement>('[data-role="counter"]');
    rows.forEach((row, index) => {
      const v = row.querySelector<HTMLElement>('.datarow__v');
      if (v && values[index] !== undefined) v.textContent = values[index];
    });

    this.obsSlot.replaceChildren();
    const k = document.createElement('span');
    k.className = 'datarow__k';
    k.textContent = '上次观察';
    const v = document.createElement('span');
    v.className = 'datarow__v';
    if (view.lastObservationId) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--ghost btn--sm';
      btn.append(icon('copy', 16), document.createTextNode(view.lastObservationId));
      btn.addEventListener('click', () => this.host.onCopyObservationId(view.lastObservationId!));
      v.append(btn);
    } else {
      v.textContent = EM_DASH;
    }
    this.obsSlot.append(k, v);
  }
}
