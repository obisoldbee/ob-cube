/**
 * challenge-panel.ts —— 左栏「挑战信息」+ 计时器 + 提交机会（UIUX §7.1 / §7.2 / §7.4.3）
 *
 * 计时器铁律：`aria-live="off"`。计数器每 10ms 更新，绝不能进 live region。
 * 超时事件由独立的一句 `aria-live="assertive"` 播报一次。
 */

import type { CubeSize } from '../../contracts';
import type { ChallengeView } from '../view-model';
import { clockParts, formatMoveCount, formatSize, timerTone } from '../format';
import { icon } from '../icons';
import { STATUS_META } from './status-meta';

export interface ChallengePanelHost {
  onSizeChange(size: CubeSize): void;
  onCopyChallengeId(text: string): void;
}

const SIZES: readonly CubeSize[] = [2, 3, 4];

export class ChallengePanel {
  readonly el: HTMLElement;
  private readonly sizeSlots: HTMLElement;
  private readonly badge: HTMLElement;
  private readonly timerEl: HTMLElement;
  private readonly timerInt: HTMLElement;
  private readonly timerFrac: HTMLElement;
  private readonly countdownFill: HTMLElement;
  private readonly countdown: HTMLElement;
  private readonly idValue: HTMLElement;
  private readonly copyBtn: HTMLButtonElement;
  private readonly remainingValue: HTMLElement;
  private readonly elapsedValue: HTMLElement;
  private readonly movesValue: HTMLElement;
  private readonly attemptsEl: HTMLElement;
  private readonly difficultyValue: HTMLElement;
  private currentId: string | null = null;

  constructor(private readonly host: ChallengePanelHost) {
    this.el = document.createElement('section');
    this.el.className = 'panel';
    this.el.setAttribute('aria-label', '挑战信息');

    const head = document.createElement('div');
    head.className = 'panel__head';
    const title = document.createElement('h2');
    title.className = 'panel__title-zh';
    title.textContent = '挑战信息';
    this.badge = document.createElement('span');
    this.badge.className = 'badge';
    head.append(title, this.badge);

    this.sizeSlots = document.createElement('div');
    this.sizeSlots.className = 'slot-row';
    this.renderSizes(3);

    this.timerEl = document.createElement('div');
    this.timerEl.className = 'timer';
    this.timerEl.setAttribute('aria-live', 'off');
    this.timerEl.setAttribute('role', 'timer');
    this.timerInt = document.createElement('span');
    this.timerInt.className = 'timer__int';
    this.timerInt.textContent = '0:00';
    this.timerFrac = document.createElement('span');
    this.timerFrac.className = 'timer__frac';
    this.timerFrac.textContent = '.00';
    this.timerEl.append(this.timerInt, this.timerFrac);

    this.countdown = document.createElement('div');
    this.countdown.className = 'countdown';
    this.countdown.hidden = true;
    this.countdownFill = document.createElement('div');
    this.countdownFill.className = 'countdown__fill';
    this.countdownFill.style.width = '100%';
    this.countdown.append(this.countdownFill);

    const rows = document.createElement('div');
    rows.className = 'datarows';
    const idRow = this.makeRow('题面 ID');
    this.idValue = idRow.value;
    this.idValue.textContent = '未生成';
    this.copyBtn = document.createElement('button');
    this.copyBtn.type = 'button';
    this.copyBtn.className = 'icon-btn';
    this.copyBtn.setAttribute('aria-label', '复制题面 ID');
    this.copyBtn.title = '复制题面 ID';
    this.copyBtn.append(icon('copy', 16));
    this.copyBtn.addEventListener('click', () => {
      if (this.currentId) this.host.onCopyChallengeId(this.currentId);
    });
    idRow.value.parentElement?.append(this.copyBtn);

    const remainingRow = this.makeRow('剩余时间');
    this.remainingValue = remainingRow.value;
    const elapsedRow = this.makeRow('已用时间');
    this.elapsedValue = elapsedRow.value;
    const movesRow = this.makeRow('步数 · HTM');
    this.movesValue = movesRow.value;
    const difficultyRow = this.makeRow('难度估计');
    this.difficultyValue = difficultyRow.value;
    this.difficultyValue.textContent = '—';
    rows.append(idRow.root, remainingRow.root, elapsedRow.root, movesRow.root, difficultyRow.root);

    const attemptsWrap = document.createElement('div');
    attemptsWrap.className = 'slot-row';
    const attemptsLabel = document.createElement('span');
    attemptsLabel.className = 'slot-row__label';
    attemptsLabel.textContent = '提交机会';
    this.attemptsEl = document.createElement('span');
    this.attemptsEl.className = 'attempts';
    this.attemptsEl.setAttribute('role', 'img');
    attemptsWrap.append(attemptsLabel, this.attemptsEl);

    this.el.append(head, this.sizeSlots, this.timerEl, this.countdown, rows, attemptsWrap);
    this.renderAttempts(3);
  }

  private renderSizes(active: CubeSize): void {
    this.sizeSlots.replaceChildren();
    const label = document.createElement('span');
    label.className = 'slot-row__label';
    label.textContent = '阶数';
    const group = document.createElement('div');
    group.className = 'slots';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', '选择阶数');
    for (const size of SIZES) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'slot-chip';
      chip.dataset.size = String(size);
      chip.dataset.checked = String(size === active);
      chip.setAttribute('role', 'radio');
      chip.setAttribute('aria-checked', String(size === active));
      chip.textContent = String(size);
      chip.title = `${formatSize(size)} 魔方`;
      chip.addEventListener('click', () => this.host.onSizeChange(size));
      group.append(chip);
    }
    this.sizeSlots.append(label, group);
  }

  private makeRow(key: string): { root: HTMLElement; value: HTMLElement } {
    const root = document.createElement('div');
    root.className = 'datarow';
    const k = document.createElement('span');
    k.className = 'datarow__k';
    k.textContent = key;
    const value = document.createElement('span');
    value.className = 'datarow__v';
    root.append(k, value);
    return { root, value };
  }

  private renderAttempts(left: number): void {
    this.attemptsEl.replaceChildren();
    for (let i = 0; i < 3; i += 1) {
      const dot = document.createElement('span');
      dot.className = 'attempts__dot';
      dot.dataset.used = String(i >= left);
      this.attemptsEl.append(dot);
    }
    this.attemptsEl.setAttribute('aria-label', `剩余 ${left} 次提交机会`);
  }

  update(view: ChallengeView): void {
    const meta = STATUS_META[view.status];
    this.badge.textContent = view.solvedPending ? '可提交' : meta.label;
    this.badge.dataset.tone = view.solvedPending ? 'solved' : meta.tone;

    this.renderSizes(view.size);

    const tone = timerTone({
      status: view.solvedPending ? 'running' : view.status,
      remainingMs: view.remainingMs,
      hasLimit: view.timeLimitMs !== null,
    });
    const shown = view.timeLimitMs !== null ? view.remainingMs : view.elapsedMs;
    const parts = clockParts(shown);
    this.timerEl.dataset.tone = tone;
    this.timerInt.textContent = parts.int;
    this.timerFrac.textContent = parts.frac ? `.${parts.frac}` : '';

    const hasLimit = view.timeLimitMs !== null;
    this.countdown.hidden = !hasLimit;
    if (hasLimit && view.remainingMs !== null) {
      const ratio = Math.max(0, Math.min(1, view.remainingMs / view.timeLimitMs!));
      this.countdownFill.style.width = `${(ratio * 100).toFixed(2)}%`;
      this.countdown.dataset.tone = tone;
    }

    this.currentId = view.challengeId;
    this.idValue.textContent = view.challengeId ?? '未生成';
    this.copyBtn.disabled = view.challengeId === null;
    this.remainingValue.textContent = hasLimit ? formatClockShort(view.remainingMs) : '不限时';
    this.elapsedValue.textContent = formatClockShort(view.elapsedMs);
    this.movesValue.textContent = formatMoveCount(view.moveCount, view.moveLimit);
    this.movesValue.dataset.tone = view.moveLimit !== null && view.moveCount / view.moveLimit >= 0.8 ? 'warn' : 'normal';
    this.difficultyValue.textContent =
      view.difficultyLabel === null
        ? '—'
        : `${view.difficultyLabel}${view.difficultyScore === null ? '' : ` · ${view.difficultyScore.toFixed(2)}`}`;
    this.renderAttempts(view.attemptsLeft);
  }
}

function formatClockShort(ms: number | null): string {
  const parts = clockParts(ms);
  return parts.frac ? `${parts.int}.${parts.frac}` : parts.int;
}
