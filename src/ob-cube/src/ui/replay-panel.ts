/**
 * replay-panel.ts —— F09b 回放控制条（PRD §10.2 / AC-47 / AC-48 / AC-50）
 *
 * 布局替换转动矩阵（`height: 56px` 的控制条 + 校验视角矩阵），
 * 3D 画面仍由 wiring 驱动：本组件只发意图，不持有魔方状态。
 */

import type { FaceId } from '../contracts';
import type { ReplayView, ReplayViewMode } from './view-model';
import { formatElapsed } from './format';

export interface ReplayPanelHost {
  onPlay(): void;
  onPause(): void;
  onStep(delta: -1 | 1): void;
  onSeek(step: number): void;
  onSpeed(rate: number): void;
  onMode(mode: ReplayViewMode): void;
  onConfirmVersion(): void;
  onClose(): void;
}

const COLOR_TOKEN: Readonly<Record<string, string>> = {
  white: '--cube-U',
  yellow: '--cube-D',
  green: '--cube-F',
  orange: '--cube-L',
  blue: '--cube-B',
  red: '--cube-R',
};

const FACE_LABEL: Readonly<Record<FaceId, string>> = {
  U: '上',
  R: '右',
  F: '前',
  D: '下',
  L: '左',
  B: '后',
};

const MODES: readonly { value: ReplayViewMode; label: string }[] = [
  { value: 'god', label: '上帝视角' },
  { value: 'observer', label: '观察者视角' },
  { value: 'verify', label: '校验视角' },
];

export class ReplayPanel {
  readonly el: HTMLElement;
  private readonly stepLabel: HTMLElement;
  private readonly timeLabel: HTMLElement;
  private readonly range: HTMLInputElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly warning: HTMLElement;
  private readonly warningText: HTMLElement;
  private readonly verify: HTMLElement;
  private readonly modeButtons = new Map<ReplayViewMode, HTMLButtonElement>();

  constructor(private readonly host: ReplayPanelHost) {
    this.el = document.createElement('section');
    this.el.className = 'replay';
    this.el.setAttribute('aria-label', '过程回放');

    const head = document.createElement('div');
    head.className = 'replay__head';
    const title = document.createElement('h2');
    title.className = 'replay__title';
    title.textContent = '过程回放';
    this.stepLabel = document.createElement('span');
    this.stepLabel.className = 'replay__step';
    this.timeLabel = document.createElement('span');
    this.timeLabel.className = 'replay__time';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn--ghost btn--sm';
    close.textContent = '退出回放';
    close.addEventListener('click', () => this.host.onClose());
    head.append(title, this.stepLabel, this.timeLabel, close);

    const controls = document.createElement('div');
    controls.className = 'replay__controls';
    this.playBtn = this.ctrl('播放', () => this.host.onPlay());
    this.pauseBtn = this.ctrl('暂停', () => this.host.onPause());
    const prev = this.ctrl('上一步', () => this.host.onStep(-1));
    const next = this.ctrl('下一步', () => this.host.onStep(1));
    this.range = document.createElement('input');
    this.range.type = 'range';
    this.range.className = 'replay__range';
    this.range.min = '0';
    this.range.setAttribute('aria-label', '回放进度');
    this.range.addEventListener('input', () => this.host.onSeek(Number(this.range.value)));
    controls.append(prev, this.playBtn, this.pauseBtn, next, this.range);

    const speeds = document.createElement('div');
    speeds.className = 'replay__speeds';
    speeds.setAttribute('role', 'radiogroup');
    speeds.setAttribute('aria-label', '回放速度');
    for (const rate of [0.5, 1, 2, 4]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot-chip';
      btn.setAttribute('role', 'radio');
      btn.textContent = `${rate}x`;
      btn.dataset.rate = String(rate);
      btn.addEventListener('click', () => this.host.onSpeed(rate));
      speeds.append(btn);
    }
    controls.append(speeds);

    const modes = document.createElement('div');
    modes.className = 'replay__modes';
    modes.setAttribute('role', 'radiogroup');
    modes.setAttribute('aria-label', '回放视角');
    for (const mode of MODES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot-chip';
      btn.setAttribute('role', 'radio');
      btn.textContent = mode.label;
      btn.addEventListener('click', () => this.host.onMode(mode.value));
      this.modeButtons.set(mode.value, btn);
      modes.append(btn);
    }
    controls.append(modes);

    this.warning = document.createElement('div');
    this.warning.className = 'replay__warning';
    this.warning.hidden = true;
    this.warningText = document.createElement('span');
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'btn btn--secondary btn--sm';
    confirm.textContent = '仍要回放';
    confirm.addEventListener('click', () => this.host.onConfirmVersion());
    this.warning.append(this.warningText, confirm);

    this.verify = document.createElement('div');
    this.verify.className = 'replay__verify';
    this.verify.hidden = true;

    this.el.append(head, controls, this.warning, this.verify);
  }

  update(view: ReplayView): void {
    this.stepLabel.textContent = `第 ${view.currentStep} / ${view.totalSteps} 步`;
    this.timeLabel.textContent = formatElapsed(view.elapsedMs);
    this.range.max = String(view.totalSteps);
    this.range.value = String(view.currentStep);
    this.playBtn.hidden = view.playing;
    this.pauseBtn.hidden = !view.playing;
    this.playBtn.disabled = view.versionMismatch && !view.versionConfirmed;
    this.pauseBtn.disabled = view.versionMismatch && !view.versionConfirmed;
    for (const btn of this.el.querySelectorAll<HTMLButtonElement>('[data-rate]')) {
      const on = Number(btn.dataset.rate) === view.speed;
      btn.dataset.checked = String(on);
      btn.setAttribute('aria-checked', String(on));
    }
    for (const [mode, btn] of this.modeButtons) {
      const on = mode === view.mode;
      btn.dataset.checked = String(on);
      btn.setAttribute('aria-checked', String(on));
    }
    this.warning.hidden = !(view.versionMismatch && !view.versionConfirmed);
    this.warningText.textContent =
      '本次运行由旧版引擎生成，回放结果可能与当时不完全一致。';
    this.verify.hidden = view.mode !== 'verify';
    if (view.mode === 'verify') this.renderVerify(view);
  }

  private renderVerify(view: ReplayView): void {
    const cells: HTMLElement[] = [];
    for (const { face, grid } of view.grids) {
      const panel = document.createElement('div');
      panel.className = 'replay__face';
      panel.dataset.changed = String(view.changedFaces.includes(face));
      const label = document.createElement('span');
      label.className = 'replay__face-label';
      label.textContent = `${face} · ${FACE_LABEL[face]}`;
      const matrix = document.createElement('div');
      matrix.className = 'replay__matrix';
      matrix.style.gridTemplateColumns = `repeat(${grid[0]?.length ?? 0}, 1fr)`;
      for (const row of grid) {
        for (const color of row) {
          const cell = document.createElement('span');
          cell.className = 'replay__cell';
          cell.style.background = `var(${COLOR_TOKEN[color] ?? '--cube-masked'})`;
          matrix.append(cell);
        }
      }
      panel.append(label, matrix);
      cells.push(panel);
    }
    this.verify.replaceChildren(...cells);
  }

  private ctrl(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--secondary btn--sm';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }
}
