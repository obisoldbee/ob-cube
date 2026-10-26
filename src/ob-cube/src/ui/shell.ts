/**
 * shell.ts —— 三栏工作台装配（DOM 骨架 + 组件编排）
 *
 * 纪律：这里只做「点按钮后该做什么」的编排（ARCHITECTURE §9.3），不实现任何规则。
 * 规则、计步、判定全部在引擎/挑战层；本层通过 `UiPorts` 单向调用。
 *
 * 第二阶段接线点：`new Workspace(ports)` —— 把 ports 换成真实实现即可，
 * 界面组件本身一行都不用改。
 */

import type { CubeSize, FaceId } from '../contracts';
import type { AppSettings, ChallengeConfig } from '../services';
import type { StagePhase } from './stage';
import type { LayerSpec, TurnIntent } from './keymap';
import type { KeySignal, ViewStep } from './keyboard';
import type { AgentView, ChallengeView, ConfigView, HistoryView, LogRow, ObservationView, ReplayView, ReplayViewMode, ResultView } from './view-model';
import { KeyboardController } from './keyboard';
import { StatusBar } from './status-bar';
import { Stage } from './stage';
import { TurnMatrix } from './turn-matrix';
import { ReplayPanel } from './replay-panel';
import { ShortcutOverlay } from './shortcut-overlay';
import { icon } from './icons';
import { ChallengePanel } from './panels/challenge-panel';
import { ConfigPanel } from './panels/config-panel';
import { SessionPanel } from './panels/session-panel';
import { ObservationPanel } from './panels/observation-panel';
import { LogPanel } from './panels/log-panel';
import { AgentPanel } from './panels/agent-panel';
import { ResultPanel } from './panels/result-panel';
import { HistoryPanel } from './panels/history-panel';

export interface UiPorts {
  startChallenge(): void;
  pauseChallenge(): void;
  resumeChallenge(): void;
  submitSolution(): void;
  abandonChallenge(): void;
  endChallenge(): void;
  changeSize(size: CubeSize): void;
  scramble(): void;
  resetCube(): void;
  applyTurn(intent: TurnIntent, merged: boolean): void;
  /** F16（P1）：直接提交一条记法（如 `2Rw'`），与按钮/键盘共用同一提交点 */
  applyNotation(raw: string): void;
  /** AC-81：hover 预览被转动物理层的外轮廓（30% 透明） */
  previewLayer(face: FaceId, layers: LayerSpec): void;
  clearLayerPreview(): void;
  viewStep(step: ViewStep): void;
  viewReset(): void;
  faceView(face: FaceId): void;
  replay(): void;
  /** F09b 回放控制 */
  replayPlay(): void;
  replayPause(): void;
  replayStep(delta: -1 | 1): void;
  replaySeek(step: number): void;
  replaySpeed(rate: number): void;
  replayMode(mode: ReplayViewMode): void;
  replayConfirmVersion(): void;
  replayClose(): void;
  rerun(): void;
  /** v1.9：再挑战一次 = 保留配置生成新题面（区别于同题面重跑） */
  retryNew(): void;
  /** v1.9：挑战配置变更（时限/步数/蒙尘/参与者/题目来源）；telemetry/mono 是设置项 */
  updateConfig(patch: Partial<ChallengeConfig> & { telemetryEnabled?: boolean; monoMode?: boolean }): void;
  /** F11：历史记录处置（删除 / 导出原始数据） */
  deleteHistoryRecord(id: string): void;
  exportHistoryRecord(key: string): void;
  exportJson(): void;
  copy(text: string, label: string): void;
}

export interface WorkspaceDeps {
  readonly settings: {
    get(): AppSettings;
    patch(patch: Partial<AppSettings>): AppSettings;
  };
  readonly canPersist: boolean;
}

const NOOP_PORTS: UiPorts = {
  startChallenge: () => undefined,
  pauseChallenge: () => undefined,
  resumeChallenge: () => undefined,
  submitSolution: () => undefined,
  abandonChallenge: () => undefined,
  endChallenge: () => undefined,
  changeSize: () => undefined,
  scramble: () => undefined,
  resetCube: () => undefined,
  applyTurn: () => undefined,
  applyNotation: () => undefined,
  previewLayer: () => undefined,
  clearLayerPreview: () => undefined,
  viewStep: () => undefined,
  viewReset: () => undefined,
  faceView: () => undefined,
  replay: () => undefined,
  replayPlay: () => undefined,
  replayPause: () => undefined,
  replayStep: () => undefined,
  replaySeek: () => undefined,
  replaySpeed: () => undefined,
  replayMode: () => undefined,
  replayConfirmVersion: () => undefined,
  replayClose: () => undefined,
  rerun: () => undefined,
  retryNew: () => undefined,
  updateConfig: () => undefined,
  deleteHistoryRecord: () => undefined,
  exportHistoryRecord: () => undefined,
  exportJson: () => undefined,
  copy: () => undefined,
};

export const EMPTY_CHALLENGE: ChallengeView = {
  size: 3,
  challengeId: null,
  status: 'idle',
  elapsedMs: 0,
  remainingMs: null,
  timeLimitMs: null,
  moveCount: 0,
  moveLimit: null,
  tps: 0,
  solvedPending: false,
  attemptsLeft: 3,
  firstMoveMs: null,
  observationMode: 'full',
  dustMode: true,
  participant: 'human',
  scrambleMethod: 'random_moves',
  seed: null,
  difficultyScore: null,
  difficultyLabel: null,
};

export class Workspace {
  readonly root: HTMLElement;
  readonly stage: Stage;
  private readonly ports: UiPorts;
  private readonly deps: WorkspaceDeps;
  private readonly challengePanel: ChallengePanel;
  private readonly configPanel: ConfigPanel;
  private readonly sessionPanel: SessionPanel;
  private readonly matrix: TurnMatrix;
  private readonly statusBar: StatusBar;
  private readonly notationForm: HTMLFormElement;
  private readonly notationInput: HTMLInputElement;
  private readonly obsPanel: ObservationPanel;
  private readonly logPanel: LogPanel;
  private readonly agentPanel: AgentPanel;
  private readonly historyPanel: HistoryPanel;
  private readonly resultPanel: ResultPanel;
  private readonly replayPanel: ReplayPanel;
  private readonly keyboard: KeyboardController;
  private readonly overlay = new ShortcutOverlay();
  private readonly toastEl: HTMLElement;
  private toastTimer: number | null = null;
  private readonly appbar: HTMLElement;
  private readonly modal: HTMLElement;
  /** §5.2 三级：首次进入 running 的一次性引导条（pointer-events:none） */
  private readonly firstRunEl: HTMLElement;
  private view: ChallengeView = EMPTY_CHALLENGE;
  private lastFace: FaceId | null = null;
  private resultShowing = false;

  constructor(ports: Partial<UiPorts> = {}, deps: WorkspaceDeps) {
    this.ports = { ...NOOP_PORTS, ...ports };
    this.deps = deps;

    this.root = document.createElement('div');
    this.root.className = 'workspace';

    this.challengePanel = new ChallengePanel({
      onSizeChange: (size) => this.ports.changeSize(size),
      onCopyChallengeId: (text) => this.ports.copy(text, '题面 ID'),
    });
    this.configPanel = new ConfigPanel({
      onConfigChange: (patch) => this.ports.updateConfig(patch),
    });
    this.sessionPanel = new SessionPanel({
      onStart: () => this.ports.startChallenge(),
      onPause: () => this.ports.pauseChallenge(),
      onResume: () => this.ports.resumeChallenge(),
      onSubmit: () => this.ports.submitSolution(),
      onAbandon: () => this.askAbandon(),
      onEnd: () => this.askAbandon(),
      onReplay: () => this.ports.replay(),
      onRetryNew: () => this.ports.retryNew(),
    });

    this.statusBar = new StatusBar();
    const notation = this.buildNotationForm();
    this.notationForm = notation.form;
    this.notationInput = notation.input;
    this.stage = new Stage({
      onScramble: () => this.ports.scramble(),
      onReset: () => this.ports.resetCube(),
      onViewStep: (step) => this.ports.viewStep(step),
      onViewReset: () => this.ports.viewReset(),
      onFaceView: (face) => this.ports.faceView(face),
      onStart: () => this.ports.startChallenge(),
      isKeymapCollapsed: () => this.deps.settings.get().keymapCollapsed,
      setKeymapCollapsed: (value) => {
        this.deps.settings.patch({ keymapCollapsed: value });
        this.stage.refreshKeymap();
      },
      onOpenHelp: () => this.overlay.open(),
    });

    this.matrix = new TurnMatrix(this.view.size, {
      onTurn: (intent) => this.ports.applyTurn(intent, false),
      onLayerHover: (target) => {
        if (target) this.ports.previewLayer(target.face, target.layers);
        else this.ports.clearLayerPreview();
      },
      onPrefixSync: (prefix) => this.keyboard.syncPrefix(prefix),
    });

    this.obsPanel = new ObservationPanel({ onCopyObservationId: (text) => this.ports.copy(text, '观察 ID') });
    this.logPanel = new LogPanel();
    this.agentPanel = new AgentPanel({ onCopyObservationId: (text) => this.ports.copy(text, '观察 ID') });
    this.historyPanel = new HistoryPanel({
      onDeleteRecord: (id) => this.ports.deleteHistoryRecord(id),
      onExportRecord: (key) => this.ports.exportHistoryRecord(key),
    });
    this.resultPanel = new ResultPanel({
      onReplay: () => this.ports.replay(),
      onRerun: () => this.ports.rerun(),
      onExport: () => this.ports.exportJson(),
      onRetry: () => this.ports.retryNew(),
      onCopyFingerprint: (text) => this.ports.copy(text ?? '', '题面指纹'),
      onShowLog: () => this.clearResult(),
    });
    this.replayPanel = new ReplayPanel({
      onPlay: () => this.ports.replayPlay(),
      onPause: () => this.ports.replayPause(),
      onStep: (delta) => this.ports.replayStep(delta),
      onSeek: (step) => this.ports.replaySeek(step),
      onSpeed: (rate) => this.ports.replaySpeed(rate),
      onMode: (mode) => this.ports.replayMode(mode),
      onConfirmVersion: () => this.ports.replayConfirmVersion(),
      onClose: () => this.ports.replayClose(),
    });

    this.keyboard = new KeyboardController({
      size: () => this.view.size,
      canStart: () => this.view.status === 'ready',
      acceptTurns: () => this.view.status === 'running',
      mergeEnabled: () => this.deps.settings.get().mergeDoubleTap,
      onTurn: (event) => this.onTurn(event.intent, event.merged),
      onSignal: (signal) => this.onKeySignal(signal),
      onStart: () => this.ports.startChallenge(),
      onViewStep: (step) => this.ports.viewStep(step),
      onViewReset: () => this.ports.viewReset(),
      onHelpToggle: () => this.overlay.toggle(),
      onNotationFocus: () => this.focusNotation(),
      onAbandon: () => {
        if (this.overlay.isOpen()) {
          this.overlay.close();
          return;
        }
        // Esc 只在 running / paused 有「放弃」语义。ready 下按 Esc 若直接结算，
        // 会把还没开始的运行判成 ended_abandoned；ended 下也不该重复结算。
        if (this.view.status === 'running' || this.view.status === 'paused') this.askAbandon();
      },
    });

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    this.toastEl.hidden = true;
    this.appbar = this.buildAppbar();
    this.modal = this.buildModal();
    this.firstRunEl = this.buildFirstRunHint();
    this.buildLayout();
  }

  mount(host: HTMLElement): void {
    host.replaceChildren(this.root, this.appbar, this.overlay.el, this.modal, this.toastEl);
    this.keyboard.attach();
    this.update(this.view);
  }

  destroy(): void {
    this.keyboard.detach();
    this.statusBar.destroy();
    this.overlay.close();
  }

  setStagePhase(phase: StagePhase): void {
    this.stage.setPhase(phase);
  }

  /** execution/render.md §8.5：帧预算降级的可见标记 */
  setPerformanceNote(text: string | null): void {
    this.stage.setPerformanceNote(text);
  }

  update(view: ChallengeView): void {
    const sizeChanged = view.size !== this.view.size;
    this.view = view;
    this.challengePanel.update(view);
    this.sessionPanel.update(view);
    if (sizeChanged) this.matrix.setSize(view.size);
    // v1.9（AC-28）：非 running 态矩阵整体锁死，随状态迁移同帧生效
    this.matrix.setEnabled(view.status === 'running');
    this.stage.setSolvedPending(view.solvedPending);
    this.stage.setDustMode(view.dustMode);
    this.syncStatus();
  }

  updateConfig(view: ConfigView): void {
    this.configPanel.update(view);
  }

  updateObservation(view: ObservationView): void {
    this.obsPanel.update(view);
  }

  updateLogs(rows: readonly LogRow[], total: number): void {
    this.logPanel.update(rows, total);
  }

  updateAgent(view: AgentView): void {
    this.agentPanel.update(view);
  }

  updateHistory(view: HistoryView): void {
    this.historyPanel.update(view);
  }

  /** v1.9：参与者=人类时整个 Agent 会话面板不占位（window.cubeAgent 仍恒挂载） */
  setAgentVisible(visible: boolean): void {
    this.agentPanel.el.hidden = !visible;
  }

  showResult(view: ResultView): void {
    this.resultShowing = true;
    const right = this.root.querySelector('.col--right');
    if (!right) return;
    right.replaceChildren(this.resultPanel.el);
    this.resultPanel.render(view);
  }

  clearResult(): void {
    this.resultShowing = false;
    this.buildRightColumn();
  }

  /** F09b：进入回放模式（控制条替换转动矩阵） */
  showReplayPanel(): void {
    this.matrix.el.hidden = true;
    this.firstRunEl.hidden = true;
    this.replayPanel.el.hidden = false;
  }

  hideReplayPanel(): void {
    this.replayPanel.el.hidden = true;
    this.matrix.el.hidden = false;
  }

  updateReplay(view: ReplayView): void {
    this.replayPanel.update(view);
  }

  setStorageWarning(text: string | null): void {
    this.appbar.hidden = text === null;
    this.appbar.querySelector('[data-role="text"]')!.textContent = text ?? '';
    const viewBtn = this.appbar.querySelector<HTMLButtonElement>('[data-role="view-records"]');
    if (viewBtn) viewBtn.hidden = true;
  }

  /**
   * UIUX §7.5：上次运行 interrupted 时的重进提示条。
   * 「查看记录」由调用方注入行为（wiring 里滚动到历史面板）。
   */
  setInterruptedNotice(text: string, onViewRecords: () => void): void {
    this.appbar.hidden = false;
    this.appbar.querySelector('[data-role="text"]')!.textContent = text;
    const viewBtn = this.appbar.querySelector<HTMLButtonElement>('[data-role="view-records"]');
    if (viewBtn) {
      viewBtn.hidden = false;
      viewBtn.onclick = () => {
        this.appbar.hidden = true;
        onViewRecords();
      };
    }
  }

  /** §5.2 三级（B12）：首次进入 running 的一次性引导。 */
  showFirstRunHint(): void {
    this.firstRunEl.hidden = false;
  }

  hideFirstRunHint(): void {
    this.firstRunEl.hidden = true;
  }

  get isFirstRunHintShowing(): boolean {
    return !this.firstRunEl.hidden;
  }

  /** §7.5 提示条「查看记录」：滚动到右栏历史区并短暂高亮 */
  focusHistory(): void {
    const el = this.historyPanel.el;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    el.dataset.highlight = 'true';
    window.setTimeout(() => delete el.dataset.highlight, 1600);
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.hidden = false;
    // 连续两条提示时，前一条的定时器不能提前隐藏后一条。
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastTimer = null;
      this.toastEl.hidden = true;
    }, 1800);
  }

  private onTurn(intent: TurnIntent, merged: boolean): void {
    this.lastFace = intent.face;
    this.ports.applyTurn(intent, merged);
  }

  private onKeySignal(signal: KeySignal): void {
    if (signal.kind === 'merged') {
      this.syncStatus();
      this.statusBar.flash('已合并为 180°', 'merged');
      return;
    }
    if (signal.kind === 'rejected') {
      this.statusBar.flash(signal.reason, 'normal', 1500);
      return;
    }
    if (signal.kind === 'cancelled') {
      this.statusBar.flash('层深已取消', 'normal');
      return;
    }
    this.syncStatus();
  }

  private syncStatus(): void {
    const state = this.keyboard.getState();
    this.statusBar.update({
      size: this.view.size,
      prefix: state.prefix,
      shift: state.shift,
      lastFace: this.lastFace,
      queue: 0,
    });
  }

  private askAbandon(): void {
    if (this.view.status !== 'running' && this.view.status !== 'paused') {
      this.ports.abandonChallenge();
      return;
    }
    this.modal.hidden = false;
    this.modal.querySelector<HTMLElement>('[data-role="confirm"]')?.focus();
  }

  /** F16（P1）：记法输入框。Enter 提交；输入中的按键由键盘层放行给控件本身。 */
  private buildNotationForm(): { form: HTMLFormElement; input: HTMLInputElement } {
    const form = document.createElement('form');
    form.className = 'notation';
    form.setAttribute('aria-label', '记法输入');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'notation__input';
    input.placeholder = '记法 e.g. R U2 2-3Rw';
    input.maxLength = 32;
    input.setAttribute('aria-label', '输入一条转动记法');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn--secondary btn--sm';
    submit.textContent = '执行';
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const raw = input.value.trim();
      if (!raw) return;
      this.ports.applyNotation(raw);
    });
    form.append(input, submit);
    return { form, input };
  }

  focusNotation(): void {
    this.notationInput.focus();
    this.notationInput.select();
  }

  private buildLayout(): void {
    const opHead = document.createElement('header');
    opHead.className = 'op-head';
    opHead.append(this.matrix.tablist, this.statusBar.el, this.notationForm);

    const center = document.createElement('main');
    center.className = 'col col--stage';
    center.setAttribute('aria-label', '魔方操作区');
    this.replayPanel.el.hidden = true;
    center.append(opHead, this.firstRunEl, this.stage.el, this.matrix.el, this.replayPanel.el);

    const left = document.createElement('aside');
    left.className = 'col col--left';
    left.setAttribute('aria-label', '挑战信息与会话控制');
    left.append(this.challengePanel.el, this.configPanel.el, this.sessionPanel.el);

    this.root.replaceChildren(left, center, this.buildRightColumn());
  }

  private buildRightColumn(): HTMLElement {
    const right = document.createElement('aside');
    right.className = 'col col--right';
    right.setAttribute('aria-label', '观察数据与遥测');
    right.append(this.obsPanel.el, this.logPanel.el, this.agentPanel.el, this.historyPanel.el);
    const existing = this.root.querySelector('.col--right');
    if (existing) existing.replaceWith(right);
    return right;
  }

  private buildAppbar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'appbar';
    bar.hidden = true;
    const text = document.createElement('span');
    text.dataset.role = 'text';
    const viewRecords = document.createElement('button');
    viewRecords.type = 'button';
    viewRecords.className = 'btn btn--ghost btn--sm';
    viewRecords.dataset.role = 'view-records';
    viewRecords.textContent = '查看记录';
    viewRecords.hidden = true;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn--ghost btn--sm';
    close.textContent = '知道了';
    close.addEventListener('click', () => {
      bar.hidden = true;
    });
    bar.append(icon('triangle-alert', 16), text, viewRecords, close);
    return bar;
  }

  /** 一次性引导条（UIUX §5.2 三级文案照抄；不接收指针事件，下方按钮照常可点） */
  private buildFirstRunHint(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'first-run-hint';
    wrap.dataset.role = 'first-run-hint';
    wrap.hidden = true;
    const line1 = document.createElement('p');
    line1.textContent = '按 W A S D X Q 转面 · ⇧ 反向 · 连按两下转 180°';
    const line2 = document.createElement('p');
    line2.className = 'first-run-hint__sub';
    line2.textContent = '完整键位图在右下角，按 ? 打开';
    wrap.append(line1, line2);
    return wrap;
  }

  private buildModal(): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.hidden = true;
    const box = document.createElement('div');
    box.className = 'modal__box';
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', '放弃挑战确认');
    const title = document.createElement('h2');
    title.className = 'modal__title';
    title.textContent = '放弃本次挑战？';
    const body = document.createElement('p');
    body.className = 'modal__body';
    body.textContent = '已记录的步数与耗时都会保留，之后仍可回放。此操作不可撤销。';
    const actions = document.createElement('div');
    actions.className = 'modal__actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn--secondary btn--sm';
    cancel.textContent = '继续挑战';
    cancel.addEventListener('click', () => {
      modal.hidden = true;
    });
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'btn btn--danger btn--sm';
    confirm.dataset.role = 'confirm';
    confirm.textContent = '放弃挑战';
    confirm.addEventListener('click', () => {
      modal.hidden = true;
      this.ports.abandonChallenge();
    });
    actions.append(cancel, confirm);
    box.append(title, body, actions);
    modal.append(box);
    return modal;
  }

  get isResultShowing(): boolean {
    return this.resultShowing;
  }
}
