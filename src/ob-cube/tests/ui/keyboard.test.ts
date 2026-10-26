// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardController, MERGE_WINDOW_MS } from '../../src/ui/keyboard';
import type { KeySignal, KeyboardHost, TurnEvent } from '../../src/ui/keyboard';
import type { CubeSize } from '../../src/contracts';

interface Harness {
  controller: KeyboardController;
  turns: TurnEvent[];
  signals: KeySignal[];
  started: number;
  viewSteps: string[];
  helpToggles: number;
  abandons: number;
}

function harness(size: CubeSize, status: 'ready' | 'running' = 'running', merge = true): Harness {
  const turns: TurnEvent[] = [];
  const signals: KeySignal[] = [];
  const state = { started: 0, viewSteps: [] as string[], helpToggles: 0, abandons: 0 };
  const host: KeyboardHost = {
    size: () => size,
    canStart: () => status === 'ready',
    acceptTurns: () => status === 'running',
    mergeEnabled: () => merge,
    onTurn: (event) => turns.push(event),
    onSignal: (signal) => signals.push(signal),
    onStart: () => {
      state.started += 1;
    },
    onViewStep: (step) => state.viewSteps.push(step),
    onViewReset: () => state.viewSteps.push('home'),
    onHelpToggle: () => {
      state.helpToggles += 1;
    },
    onAbandon: () => {
      state.abandons += 1;
    },
  };
  const controller = new KeyboardController(host);
  controller.attach(window);
  return {
    controller,
    turns,
    signals,
    get started() {
      return state.started;
    },
    get viewSteps() {
      return state.viewSteps;
    },
    get helpToggles() {
      return state.helpToggles;
    },
    get abandons() {
      return state.abandons;
    },
  };
}

function press(code: string, init: KeyboardEventInit = {}): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...init }));
}

describe('键盘映射（PRD §5）', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('面键按展开图投影：W=U S=F D=R A=L X=D Q=B', () => {
    const h = harness(3);
    press('KeyW');
    press('KeyS');
    press('KeyD');
    press('KeyA');
    press('KeyX');
    press('KeyQ');
    expect(h.turns.map((t) => t.intent.face)).toEqual(['U', 'F', 'R', 'L', 'D', 'B']);
    expect(h.turns.every((t) => t.intent.amount === 1)).toBe(true);
    h.controller.detach(window);
  });

  it('Shift 是修饰（同时按），产出逆时针 90°', () => {
    const h = harness(3);
    press('KeyD', { shiftKey: true });
    expect(h.turns[0]?.intent.amount).toBe(3);
    h.controller.detach(window);
  });

  it('前缀是待生效状态（先后按），2+D = Rw', () => {
    const h = harness(3);
    press('Digit2');
    expect(h.controller.getState().prefix).toBe('2');
    press('KeyD');
    expect(h.turns[0]?.intent.layers).toEqual({ kind: 'wide', depth: 2 });
    expect(h.controller.getState().prefix).toBeNull();
    h.controller.detach(window);
  });

  it('300ms 内同面双击归并为 180°，且标记 merged', () => {
    const h = harness(3);
    press('KeyD');
    press('KeyD');
    expect(h.turns).toHaveLength(2);
    expect(h.turns[0]?.merged).toBe(false);
    expect(h.turns[1]?.merged).toBe(true);
    // PRD §5.3.1 / §5.4：第二次按键执行的仍是同向 90°（再转一次），
    // 两条 90° 由会话层合并为一条 X2——绝不是第二击提交 amount=2。
    expect(h.turns[1]?.intent.amount).toBe(1);
    h.controller.detach(window);
  });

  it('连按四下 D：两次归并叠加后几何上回到原状（90°×4 = 360°）', () => {
    const h = harness(3);
    for (let i = 0; i < 4; i += 1) press('KeyD');
    expect(h.turns.map((t) => t.intent.amount)).toEqual([1, 1, 1, 1]);
    expect(h.turns.map((t) => t.merged)).toEqual([false, true, false, true]);
    h.controller.detach(window);
  });

  it('Shift+D 双击同样归并（X\' X\' = X2）；与无 Shift 的连按互不归并', () => {
    const shifted = harness(3);
    press('KeyD', { shiftKey: true });
    press('KeyD', { shiftKey: true });
    expect(shifted.turns[1]?.merged).toBe(true);
    expect(shifted.turns[1]?.intent.amount).toBe(3);
    shifted.controller.detach(window);

    const mixed = harness(3);
    press('KeyD');
    press('KeyD', { shiftKey: true });
    expect(mixed.turns[1]?.merged).toBe(false);
    mixed.controller.detach(window);
  });

  it('归并开关关闭后，双击就是两次独立 90°（不合并、不闪提示）', () => {
    const h = harness(3, 'running', false);
    press('KeyD');
    press('KeyD');
    expect(h.turns[1]?.merged).toBe(false);
    expect(h.turns[1]?.intent.amount).toBe(1);
    expect(h.signals.some((s) => s.kind === 'merged')).toBe(false);
    h.controller.detach(window);
  });

  it('超过归并窗口则不合并', () => {
    const h = harness(3);
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    press('KeyD');
    vi.spyOn(Date, 'now').mockReturnValue(1000 + MERGE_WINDOW_MS + 1);
    press('KeyD');
    expect(h.turns[1]?.merged).toBe(false);
    expect(h.turns[1]?.intent.amount).toBe(1);
    h.controller.detach(window);
  });

  it('event.repeat 一律忽略，且不进入归并窗口', () => {
    const h = harness(3);
    press('KeyD');
    press('KeyD', { repeat: true });
    expect(h.turns).toHaveLength(1);
    h.controller.detach(window);
  });

  it('Ctrl / Cmd / Alt 组合完全放行，不产生转动', () => {
    const h = harness(3);
    press('KeyD', { ctrlKey: true });
    press('KeyD', { metaKey: true });
    press('KeyD', { altKey: true });
    expect(h.turns).toHaveLength(0);
    h.controller.detach(window);
  });

  it('2 阶按 2 前缀被前置拦截，给出具体原因而不是错误码', () => {
    const h = harness(2);
    press('Digit2');
    press('KeyD');
    expect(h.turns).toHaveLength(0);
    const rejected = h.signals.find((s) => s.kind === 'rejected');
    expect(rejected && 'reason' in rejected ? rejected.reason : '').toContain('2 阶无宽转');
    h.controller.detach(window);
  });

  it('Space 仅 ready 态开始，running 态不绑定任何操作', () => {
    const ready = harness(3, 'ready');
    press('Space');
    expect(ready.started).toBe(1);
    ready.controller.detach(window);

    const running = harness(3, 'running');
    press('Space');
    expect(running.started).toBe(0);
    running.controller.detach(window);
  });

  it('方向键与 Home 走视角通道，不产生转动', () => {
    const h = harness(3);
    press('ArrowLeft');
    press('ArrowUp');
    press('Home');
    expect(h.viewSteps).toEqual(['left', 'up', 'home']);
    expect(h.turns).toHaveLength(0);
    h.controller.detach(window);
  });

  it('? 打开快捷键浮层，Esc 触发放弃确认', () => {
    const h = harness(3);
    press('Slash', { shiftKey: true });
    press('Escape');
    expect(h.helpToggles).toBe(1);
    expect(h.abandons).toBe(1);
    h.controller.detach(window);
  });
});

describe('AC-34：无 C 前缀', () => {
  it('按 C 不产生任何前缀状态，随后的面键是普通外层', () => {
    const h = harness(4);
    press('KeyC');
    press('KeyD');
    expect(h.turns).toHaveLength(1);
    expect(h.turns[0].intent.layers).toEqual({ kind: 'outer' });
    h.controller.detach(window);
  });
});
