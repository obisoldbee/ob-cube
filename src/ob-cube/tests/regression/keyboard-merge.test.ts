// @vitest-environment jsdom
/**
 * R04：`2 D D` 在归并窗口内必须保留宽转层集合，得到一条 `Rw2`。
 *
 * 旧实现第一次面键后立即清前缀，第二次 D 按外层解释，结果是 Rw + R 两步。
 */
import { describe, expect, it } from 'vitest';
import { KeyboardController, MERGE_WINDOW_MS } from '../../src/ui/keyboard';
import type { KeySignal, KeyboardHost, TurnEvent } from '../../src/ui/keyboard';
import { ChallengeSession, createFakeClock } from '../../src/challenge';
import { layersOf } from '../../src/ui/keymap';

function harness(): { controller: KeyboardController; turns: TurnEvent[]; signals: KeySignal[] } {
  const turns: TurnEvent[] = [];
  const signals: KeySignal[] = [];
  const host: KeyboardHost = {
    size: () => 3,
    canStart: () => false,
    acceptTurns: () => true,
    mergeEnabled: () => true,
    onTurn: (event) => turns.push(event),
    onSignal: (signal) => signals.push(signal),
    onStart: () => {},
    onViewStep: () => {},
    onViewReset: () => {},
    onHelpToggle: () => {},
    onAbandon: () => {},
    onNotationFocus: () => {},
  };
  const controller = new KeyboardController(host);
  controller.attach(window);
  return { controller, turns, signals };
}

function press(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
}

describe('R04 双击保留宽转层集合', () => {
  it('2 → D → D 产生两次同层意图，第二次标记为归并', () => {
    const { controller, turns } = harness();
    press('Digit2');
    press('KeyD');
    press('KeyD');

    expect(turns).toHaveLength(2);
    const [first, second] = turns;
    expect(first?.intent.face).toBe('R');
    expect(first?.intent.layers).toEqual({ kind: 'wide', depth: 2 });
    expect(first?.merged).toBe(false);
    // 第二次按键时前缀已被清空，但必须沿用同一套层
    expect(second?.merged).toBe(true);
    expect(second?.intent.layers).toEqual({ kind: 'wide', depth: 2 });
    controller.detach(window);
  });

  it('两次意图送进会话后折成一条 Rw2，计 1 步', () => {
    const { controller, turns } = harness();
    press('Digit2');
    press('KeyD');
    press('KeyD');
    controller.detach(window);

    const session = new ChallengeSession({ size: 3, seed: 'r04-session', clock: createFakeClock(0).now });
    session.start();
    for (const turn of turns) {
      session.applyIntent(
        turn.intent.face,
        layersOf(turn.intent.layers, 3),
        turn.intent.amount,
        turn.merged,
        'keyboard',
      );
    }
    expect(session.moveCount).toBe(1);
    const moves = session.eventLog.filter((event) => event.type === 'move');
    expect(moves).toHaveLength(1);
    expect(moves[0]?.move).toBe('Rw2');
    expect(moves[0]?.turn_amount).toBe(180);
    expect(moves[0]?.layer_set).toEqual([1, 2]);
  });

  it('方向键插入后不再归并（R2-03 / T06 的键盘侧）', () => {
    const { controller, turns } = harness();
    press('KeyD');
    press('ArrowLeft');
    press('KeyD');
    controller.detach(window);
    expect(turns).toHaveLength(2);
    expect(turns[0]?.merged).toBe(false);
    // 第二次按键是一次全新的意图，不能被上一次的按键语境并掉
    expect(turns[1]?.merged).toBe(false);
  });

  it('超出归并窗口后退化为普通外层转（前缀不粘手）', () => {
    const { controller, turns } = harness();
    press('Digit2');
    press('KeyD');
    const realNow = Date.now;
    Date.now = () => realNow() + MERGE_WINDOW_MS + 50;
    try {
      press('KeyD');
    } finally {
      Date.now = realNow;
    }
    controller.detach(window);
    expect(turns).toHaveLength(2);
    expect(turns[1]?.merged).toBe(false);
    expect(turns[1]?.intent.layers).toEqual({ kind: 'outer' });
  });
});
