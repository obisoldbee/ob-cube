/**
 * session-panel.ts —— 左栏底部会话控制（UIUX §4.2 关键决策 3）
 *
 * 会话控制放左栏、不放中栏：它们是「挑战」级操作，不是「魔方」级操作。
 * 放中栏会和「打乱 / 重置」并列，导致用户误以为打乱可以随时在中途按。
 *
 * 「可提交」态（PRD §7.4）在这里换按钮位：主按钮由「结束」变成「提交解答」，
 * 原「结束」降为次按钮「放弃」。
 */

import type { ChallengeStatus } from '../../contracts';
import type { ChallengeView } from '../view-model';
import { icon } from '../icons';

export interface SessionPanelHost {
  onStart(): void;
  onPause(): void;
  onResume(): void;
  onSubmit(): void;
  onAbandon(): void;
  onEnd(): void;
  onReplay(): void;
  /** 再挑战一次：保留配置生成新题面，回 ready（v1.9） */
  onRetryNew(): void;
}

export class SessionPanel {
  readonly el: HTMLElement;
  /** 只有结构变了才重建。按钮被反复重建会把 mousedown/mouseup 之间的节点换掉，点击直接丢失。 */
  private signature = '';

  constructor(private readonly host: SessionPanelHost) {
    this.el = document.createElement('section');
    this.el.className = 'panel';
    this.el.setAttribute('aria-label', '会话控制');
  }

  update(view: ChallengeView): void {
    // participant 进签名：人机切换要触发按钮重建（AC-58：agent 模式无暂停按钮）
    const signature = `${view.status}|${view.solvedPending ? '1' : '0'}|${view.participant}`;
    if (signature === this.signature) return;
    this.signature = signature;
    this.el.replaceChildren(this.render(view));
  }

  private render(view: ChallengeView): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'panel__col';
    wrap.append(this.actions(view));

    const hint = document.createElement('p');
    hint.className = 'stage__hint';
    hint.textContent = this.hintOf(view.status, view.solvedPending);
    wrap.append(hint);
    return wrap;
  }

  private hintOf(status: ChallengeStatus, solvedPending: boolean): string {
    if (solvedPending) return '已还原，点「提交解答」结算';
    switch (status) {
      case 'ready':
        return '按 Space 开始';
      case 'running':
        return 'Esc 放弃挑战';
      case 'paused':
        return '计时已冻结，按继续恢复';
      default:
        return '结果见右栏';
    }
  }

  private actions(view: ChallengeView): HTMLElement {
    const row = document.createElement('div');
    row.className = 'result__actions';

    if (view.solvedPending) {
      row.append(
        this.btn('提交解答', 'action', () => this.host.onSubmit(), 'check'),
        this.btn('放弃', 'secondary', () => this.host.onAbandon()),
      );
      return row;
    }

    switch (view.status) {
      case 'ready':
        row.append(this.btn('开始挑战', 'action', () => this.host.onStart(), 'play'));
        break;
      case 'running':
        // AC-58 / PRD §7.2.1 P4'：暂停仅人类模式可用，Agent 模式不渲染暂停按钮
        if (view.participant !== 'agent') {
          row.append(this.btn('暂停', 'secondary', () => this.host.onPause(), 'pause'));
        }
        row.append(this.btn('结束', 'danger', () => this.host.onEnd()));
        break;
      case 'paused':
        row.append(
          this.btn('继续', 'action', () => this.host.onResume(), 'play'),
          this.btn('结束', 'danger', () => this.host.onEnd()),
        );
        break;
      default:
        row.append(
          this.btn('查看回放', 'action', () => this.host.onReplay(), 'play'),
          this.btn('再挑战一次', 'secondary', () => this.host.onRetryNew()),
        );
    }
    return row;
  }

  private btn(
    label: string,
    tone: 'action' | 'secondary' | 'danger',
    onClick: () => void,
    iconName?: 'play' | 'pause' | 'check',
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn--${tone} btn--sm`;
    if (iconName) btn.append(icon(iconName, 16));
    btn.append(document.createTextNode(label));
    btn.addEventListener('click', onClick);
    return btn;
  }
}
