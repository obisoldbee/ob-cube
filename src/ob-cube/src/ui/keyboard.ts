/**
 * keyboard.ts —— 键盘输入管道（PRD §5.3–§5.4、UIUX §5.5）
 *
 * 三段式：① 前缀态 → ② 面键判定 → ③ 300ms 归并窗口。**不是 FIFO 队列。**
 * 铁律：
 *  - 不注册任何 Ctrl / Cmd / Alt 组合（直接放行给浏览器，不 preventDefault）
 *  - `event.repeat === true` 一律忽略，且不进入归并窗口
 *  - 180° 双击归并**不回退、不再提交 `R2` 取代**：第二次照常再转一次，
 *    由上层合并计步与日志（SPEC §11 坑 1）。本模块只负责把「这是一次归并」标出来。
 *
 * 本模块零 DOM 依赖 DOM 事件对象，但可在 jsdom 中单测。
 */

import type { CubeSize, FaceId, MoveAmount } from '../contracts';
import type { FaceKeyChar, PrefixChar, TurnIntent } from './keymap';
import {
  FACE_OF_KEY,
  isLayerSpecLegal,
  layerSpecOfPrefix,
  layersOf,
  OUTER,
  PREFIX_CHARS,
} from './keymap';

export const MERGE_WINDOW_MS = 300;
export const PREFIX_TIMEOUT_MS = 3000;

export type ViewStep = 'left' | 'right' | 'up' | 'down';

export interface TurnEvent {
  readonly intent: TurnIntent;
  /** true = 这一条触发了 180° 归并（上层需合并计步与日志） */
  readonly merged: boolean;
}

export type KeySignal =
  | { readonly kind: 'prefix'; readonly prefix: PrefixChar | null; readonly shift: boolean }
  | { readonly kind: 'merged'; readonly intent: TurnIntent }
  | { readonly kind: 'rejected'; readonly reason: string }
  | { readonly kind: 'cancelled' };

export interface KeyboardHost {
  /** 当前阶数 */
  size(): CubeSize;
  /** 仅 `ready` 态返回 true（Space 开始的门控） */
  canStart(): boolean;
  /** 是否接受转动输入（`running` 才为 true） */
  acceptTurns(): boolean;
  /** 双击归并开关（PRD §2.2 配置项，默认开） */
  mergeEnabled(): boolean;
  onTurn(event: TurnEvent): void;
  onSignal(signal: KeySignal): void;
  onStart(): void;
  onViewStep(step: ViewStep): void;
  onViewReset(): void;
  onHelpToggle(): void;
  onAbandon(): void;
  /** F16（P1）：F2 聚焦记法输入框 */
  onNotationFocus(): void;
}

export interface KeyboardState {
  prefix: PrefixChar | null;
  shift: boolean;
}

const LETTER_CODES: Readonly<Record<string, FaceKeyChar>> = {
  KeyW: 'W',
  KeyA: 'A',
  KeyS: 'S',
  KeyD: 'D',
  KeyX: 'X',
  KeyQ: 'Q',
};

const PREFIX_CODES: Readonly<Record<string, PrefixChar>> = {
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  KeyZ: 'Z',
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.closest('input, textarea, select, [contenteditable="true"]') !== null;
}

export class KeyboardController {
  private prefix: PrefixChar | null = null;
  private shift = false;
  private prefixTimer: ReturnType<typeof setTimeout> | null = null;
  private last: { face: FaceId; layers: string; amount: MoveAmount; at: number } | null = null;
  private attached = false;

  constructor(private readonly host: KeyboardHost) {}

  attach(target: EventTarget = window): void {
    if (this.attached) return;
    target.addEventListener('keydown', this.onKeyDown as EventListener);
    target.addEventListener('keyup', this.onKeyUp as EventListener);
    this.attached = true;
  }

  detach(target: EventTarget = window): void {
    if (!this.attached) return;
    target.removeEventListener('keydown', this.onKeyDown as EventListener);
    target.removeEventListener('keyup', this.onKeyUp as EventListener);
    this.attached = false;
    this.clearPrefixTimer();
  }

  /** 供外部（按钮点击）共用同一份待生效状态 */
  getState(): KeyboardState {
    return { prefix: this.prefix, shift: this.shift };
  }

  /** 自由层 tab 勾选变化时反向同步前缀显示（UIUX §4.5E） */
  syncPrefix(prefix: PrefixChar | null): void {
    this.prefix = prefix;
    this.emitPrefix();
  }

  cancelPrefix(silent = false): void {
    if (this.prefix === null) return;
    this.prefix = null;
    this.clearPrefixTimer();
    this.emitPrefix();
    if (!silent) this.host.onSignal({ kind: 'cancelled' });
  }

  private emitPrefix(): void {
    this.host.onSignal({ kind: 'prefix', prefix: this.prefix, shift: this.shift });
  }

  private clearPrefixTimer(): void {
    if (this.prefixTimer !== null) {
      clearTimeout(this.prefixTimer);
      this.prefixTimer = null;
    }
  }

  private armPrefixTimeout(): void {
    this.clearPrefixTimer();
    this.prefixTimer = setTimeout(() => {
      this.prefixTimer = null;
      if (this.prefix === null) return;
      this.prefix = null;
      this.emitPrefix();
      this.host.onSignal({ kind: 'cancelled' });
    }, PREFIX_TIMEOUT_MS);
  }

  private setPrefix(prefix: PrefixChar): void {
    // 只保留一个前缀：不接受 `2` 之后按 `3`（UIUX §5.5 ①）
    this.prefix = prefix;
    this.armPrefixTimeout();
    this.emitPrefix();
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === 'Shift') {
      this.shift = false;
      this.emitPrefix();
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // 浏览器/系统组合键一律放行
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.repeat) {
      // 长按连发不仅忽略，还要阻止默认滚动
      if (this.isBoundKey(event)) event.preventDefault();
      return;
    }
    // 输入控件内的按键一律放行给控件本身（含 Escape）：在 seed 输入框按 Esc
    // 不能触发「放弃挑战」这种破坏性动作。
    if (isEditableTarget(event.target)) return;

    if (event.key === 'Shift') {
      this.shift = true;
      this.emitPrefix();
      return;
    }

    // 物理键一律看 code：key 随输入法/布局漂移（测试环境也常只给 code）
    if (event.code === 'Escape') {
      event.preventDefault();
      this.cancelPrefix(true);
      this.host.onAbandon();
      return;
    }

    if (event.key === '?' || (event.code === 'Slash' && event.shiftKey)) {
      event.preventDefault();
      this.host.onHelpToggle();
      return;
    }

    if (event.code === 'Space' || event.key === ' ') {
      // `running` 态 Space 不绑定任何操作，但仍阻止页面滚动（PRD §5.3.4）
      event.preventDefault();
      if (this.host.canStart()) this.host.onStart();
      return;
    }

    const arrow = this.arrowOf(event);
    if (arrow) {
      event.preventDefault();
      this.host.onViewStep(arrow);
      return;
    }

    if (event.code === 'Home') {
      event.preventDefault();
      this.host.onViewReset();
      return;
    }

    // F16：F2 聚焦记法输入框（PRD §5.3.4；不使用 `/` 以避开 Firefox 快速查找）
    if (event.code === 'F2') {
      event.preventDefault();
      this.host.onNotationFocus();
      return;
    }

    const prefixChar = PREFIX_CODES[event.code];
    if (prefixChar && PREFIX_CHARS.includes(prefixChar)) {
      event.preventDefault();
      this.setPrefix(prefixChar);
      return;
    }

    const faceKey = LETTER_CODES[event.code];
    if (faceKey) {
      event.preventDefault();
      this.handleFace(FACE_OF_KEY[faceKey], event);
    }
  };

  private isBoundKey(event: KeyboardEvent): boolean {
    return (
      event.code === 'Space' ||
      event.code.startsWith('Arrow') ||
      event.code in LETTER_CODES ||
      event.code in PREFIX_CODES
    );
  }

  private arrowOf(event: KeyboardEvent): ViewStep | null {
    switch (event.code) {
      case 'ArrowLeft':
        return 'left';
      case 'ArrowRight':
        return 'right';
      case 'ArrowUp':
        return 'up';
      case 'ArrowDown':
        return 'down';
      default:
        return null;
    }
  }

  private handleFace(face: FaceId, event: KeyboardEvent): void {
    const size = this.host.size();
    const layers = this.prefix ? layerSpecOfPrefix(this.prefix) : OUTER;
    // this.shift 是先按 Shift 再按键的两段式，event.shiftKey 是同时按的一段式，两种都要支持
    const baseAmount: MoveAmount = this.shift || event.shiftKey ? 3 : 1;

    if (!isLayerSpecLegal(layers, size)) {
      this.host.onSignal({ kind: 'rejected', reason: this.rejectReason(layers.kind, size) });
      this.cancelPrefix(true);
      this.last = null;
      return;
    }
    if (!this.host.acceptTurns()) {
      this.host.onSignal({ kind: 'rejected', reason: '挑战未开始' });
      return;
    }

    const now = Date.now();
    const signature = `${face}|${layersOf(layers, size).join(',')}`;
    // 归并窗口三要素都相同才算「双击同键」：面、层、转向量。
    // 转向量也必须一致——先按 X 再按 Shift+X 是两次不同意图，不归并。
    const merged =
      this.host.mergeEnabled() &&
      this.last !== null &&
      this.last.face === face &&
      this.last.layers === signature &&
      this.last.amount === baseAmount &&
      now - this.last.at <= MERGE_WINDOW_MS;

    this.cancelPrefix(true);

    // 归并的第二次按键照常执行同向 90°（PRD §5.3.1 / §5.4：状态再转一次、
    // 计步与日志由会话层合并为一条 X2）。这里绝不能提交 amount=2——
    // 否则快按两下 = 90°+180° = 270°，视觉上等于反向 90°。
    const intent: TurnIntent = { face, layers, amount: baseAmount, source: 'keyboard' };
    this.host.onTurn({ intent, merged });
    if (merged) this.host.onSignal({ kind: 'merged', intent });

    this.last = merged ? null : { face, layers: signature, amount: baseAmount, at: now };
  }

  private rejectReason(kind: string, size: CubeSize): string {
    if (kind === 'wide') return size < 3 ? `${size} 阶无宽转` : `${size} 阶无 3 层宽转`;
    if (kind === 'inner') return `${size} 阶无内层`;
    return `${size} 阶不支持该层组合`;
  }
}
