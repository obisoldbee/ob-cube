/**
 * stage.ts —— 中栏 3D 舞台 + 画布 HUD（UIUX §4.3）
 *
 * HUD 全部分布在四角，魔方始终居中，四角都是空的，所以不侵入。
 * 蒙尘态下全部 HUD 保持可见且可点：满屏可点的控件是「已就绪」的强暗示，
 * 而 loading 态的控件通常是灰的 —— 这是 AC-16（蒙尘遮蔽）之后最重要的反误读信号。
 *
 * 画布内唯一允许的 accent 元素是「当前转动层的外轮廓描边」（渲染层实现）。
 * 本文件是 DOM 覆盖层，所有颜色走 Token。
 */

import type { FaceId } from '../contracts';
import type { ViewStep } from './keyboard';
import { FACE_VIEW_ZH } from './keymap';
import { icon } from './icons';
import { MiniKeymap } from './mini-keymap';

export type StagePhase = 'loading' | 'ready' | 'running' | 'ended' | 'webgl-unavailable';

export interface StageHost {
  onScramble(): void;
  onReset(): void;
  onViewStep(step: ViewStep): void;
  onViewReset(): void;
  onFaceView(face: FaceId): void;
  onStart(): void;
  isKeymapCollapsed(): boolean;
  setKeymapCollapsed(value: boolean): void;
  onOpenHelp(): void;
}

/** PRD C5 / AC-17：ready 态常驻的诚实文案，不得用警示色（蒙尘=开时） */
export const DUST_DISCLOSURE = '开始前不显示题面。本模式用于防止误看，不能阻止通过开发者工具读取内存。';

/** v1.9 预观察模式（蒙尘=关）：对齐国际比赛"先观察、看准了再起表"的直觉 */
export const INSPECT_DISCLOSURE = '预观察模式：开始前可自由查看题面并旋转视角，计时从按下「开始挑战」起算。';

const FACE_VIEWS: readonly FaceId[] = ['U', 'R', 'F', 'D', 'L', 'B'];

export class Stage {
  readonly el: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  private readonly fallback: HTMLElement;
  private readonly center: HTMLElement;
  private readonly pill: HTMLElement;
  private readonly keymap: MiniKeymap;
  private phase: StagePhase = 'loading';
  private dustMode = false;

  constructor(private readonly host: StageHost) {
    this.el = document.createElement('div');
    this.el.className = 'stage';
    this.el.setAttribute('aria-label', '魔方 3D 舞台');

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stage__canvas';
    this.canvas.setAttribute('aria-label', '魔方三维视图');
    this.canvas.setAttribute('role', 'img');

    this.fallback = document.createElement('div');
    this.fallback.className = 'stage__fallback';
    this.fallback.hidden = true;

    this.center = document.createElement('div');
    this.center.className = 'stage__center';

    this.pill = document.createElement('div');
    this.pill.className = 'solved-pill';
    this.pill.hidden = true;

    this.keymap = new MiniKeymap({
      isCollapsed: () => this.host.isKeymapCollapsed(),
      setCollapsed: (value) => this.host.setKeymapCollapsed(value),
      onOpenOverlay: () => this.host.onOpenHelp(),
    });

    const keymapHost = document.createElement('div');
    keymapHost.className = 'stage__hud stage__hud--br';
    keymapHost.append(this.keymap.el);

    this.el.append(
      this.canvas,
      this.fallback,
      this.sessionHud(),
      this.viewHud(),
      this.pill,
      this.center,
      keymapHost,
    );
    this.setPhase('loading');
  }

  setPhase(phase: StagePhase): void {
    this.phase = phase;
    this.fallback.hidden = phase !== 'webgl-unavailable';
    this.canvas.dataset.webgl = phase === 'webgl-unavailable' ? 'unavailable' : 'ok';
    this.el.dataset.phase = phase;
    this.renderCenter();
    this.el.classList.toggle('stage--desaturated', phase === 'ended');
  }

  getPhase(): StagePhase {
    return this.phase;
  }

  setSolvedPending(pending: boolean): void {
    this.pill.hidden = !pending;
    this.el.dataset.solved = String(pending);
  }

  /** v1.9：蒙尘/预观察切换。ready 态下文案与提示随之变化。 */
  setDustMode(dust: boolean): void {
    if (this.dustMode === dust) return;
    this.dustMode = dust;
    if (this.phase === 'ready') this.renderCenter();
  }

  refreshKeymap(): void {
    this.keymap.refresh();
  }

  private sessionHud(): HTMLElement {
    const box = document.createElement('div');
    box.className = 'stage__hud stage__hud--tl';
    const group = document.createElement('div');
    group.className = 'hud-group';
    group.append(
      this.ghostBtn('打乱', 'shuffle', () => this.host.onScramble()),
      this.ghostBtn('重置', 'rotate-cw', () => this.host.onReset()),
    );
    box.append(group);
    return box;
  }

  private ghostBtn(label: string, iconName: 'shuffle' | 'rotate-cw', onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--ghost btn--sm';
    btn.append(icon(iconName, 16), document.createTextNode(label));
    btn.addEventListener('click', onClick);
    return btn;
  }

  private viewHud(): HTMLElement {
    const box = document.createElement('div');
    box.className = 'stage__hud stage__hud--tr';

    const orbit = document.createElement('div');
    orbit.className = 'orbit';
    orbit.setAttribute('role', 'group');
    orbit.setAttribute('aria-label', '视角旋转');
    orbit.append(
      this.orbitBtn('chevron-up', '视角上移 90°', 'orbit__up', () => this.host.onViewStep('up')),
      this.orbitBtn('chevron-left', '视角左移 90°', 'orbit__left', () => this.host.onViewStep('left')),
      this.orbitBtn('home', '复位默认视角（Home）', 'orbit__home', () => this.host.onViewReset()),
      this.orbitBtn('chevron-right', '视角右移 90°', 'orbit__right', () => this.host.onViewStep('right')),
      this.orbitBtn('chevron-down', '视角下移 90°', 'orbit__down', () => this.host.onViewStep('down')),
    );

    const divider = document.createElement('div');
    divider.className = 'hud-divider';

    const faces = document.createElement('div');
    faces.className = 'faceviews';
    faces.setAttribute('role', 'group');
    faces.setAttribute('aria-label', '面视角');
    for (const face of FACE_VIEWS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-btn icon-btn--faceview';
      btn.dataset.face = face;
      btn.setAttribute('aria-label', `${FACE_VIEW_ZH[face]}`);
      btn.title = `切到${FACE_VIEW_ZH[face]}`;
      const letter = document.createElement('b');
      letter.textContent = face;
      const zh = document.createElement('span');
      zh.dataset.zh = 'true';
      zh.textContent = FACE_VIEW_ZH[face].replace('视', '');
      btn.append(letter, zh);
      btn.addEventListener('click', () => this.host.onFaceView(face));
      faces.append(btn);
    }

    box.append(orbit, divider, faces);
    return box;
  }

  private orbitBtn(
    iconName: 'chevron-up' | 'chevron-down' | 'chevron-left' | 'chevron-right' | 'home',
    label: string,
    areaClass: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `icon-btn ${areaClass}`;
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.append(icon(iconName, 16));
    btn.addEventListener('click', onClick);
    return btn;
  }

  private renderCenter(): void {
    this.center.replaceChildren();
    if (this.phase === 'webgl-unavailable') return;

    if (this.phase === 'loading') {
      const text = document.createElement('p');
      text.className = 'stage__hint';
      text.textContent = '正在初始化渲染器';
      const bar = document.createElement('div');
      bar.className = 'stage__progress';
      bar.dataset.active = 'true';
      this.center.append(text, bar);
      return;
    }

    if (this.phase === 'ready') {
      const cta = document.createElement('button');
      cta.type = 'button';
      cta.className = 'btn btn--action';
      cta.textContent = '开始挑战';
      cta.addEventListener('click', () => this.host.onStart());
      const hint = document.createElement('p');
      hint.className = 'stage__hint';
      hint.textContent = this.dustMode ? '按 Space 开始（开始前不显示题面）' : '看准了再开始 · 按 Space 起表';
      const disclosure = document.createElement('p');
      disclosure.className = 'stage__disclosure';
      disclosure.id = 'dust-disclosure';
      disclosure.textContent = this.dustMode ? DUST_DISCLOSURE : INSPECT_DISCLOSURE;
      this.center.append(cta, hint, disclosure);
    }
  }

  /** WebGL 不可用时的整块替换（UIUX §7.5）：不是空白，必须说明原因与出路 */
  showWebglUnavailable(): void {
    this.setPhase('webgl-unavailable');
    const title = document.createElement('p');
    title.className = 'empty__title';
    title.textContent = '当前浏览器不支持 WebGL2';
    const desc = document.createElement('p');
    desc.textContent = '本页面需要 GPU 加速才能渲染魔方。请开启浏览器硬件加速后刷新。';
    const link = document.createElement('a');
    link.className = 'btn btn--secondary btn--sm';
    link.href = 'https://get.webgl.org/webgl2/';
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = '查看兼容性说明';
    this.fallback.replaceChildren(title, desc, link);
  }
}
