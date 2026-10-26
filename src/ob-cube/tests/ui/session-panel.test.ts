// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { SessionPanel } from '../../src/ui/panels/session-panel';
import type { ChallengeView } from '../../src/ui/view-model';
import type { ChallengeStatus } from '../../src/contracts';

function view(status: ChallengeStatus, solvedPending = false, participant: 'human' | 'agent' = 'human'): ChallengeView {
  return {
    size: 3,
    challengeId: 'c3-test',
    status,
    elapsedMs: 1000,
    remainingMs: null,
    timeLimitMs: null,
    moveCount: 0,
    moveLimit: null,
    tps: 0,
    solvedPending,
    attemptsLeft: 3,
    firstMoveMs: null,
    observationMode: 'full',
    dustMode: true,
    participant,
    scrambleMethod: 'random_moves',
    seed: null,
    difficultyScore: null,
    difficultyLabel: null,
  };
}

function makePanel() {
  const calls = { end: 0, abandon: 0, start: 0, submit: 0, retryNew: 0 };
  const panel = new SessionPanel({
    onStart: () => {
      calls.start += 1;
    },
    onPause: () => undefined,
    onResume: () => undefined,
    onSubmit: () => {
      calls.submit += 1;
    },
    onAbandon: () => {
      calls.abandon += 1;
    },
    onEnd: () => {
      calls.end += 1;
    },
    onReplay: () => undefined,
    onRetryNew: () => {
      calls.retryNew += 1;
    },
  });
  return { panel, calls };
}

describe('会话面板（PRD §7.4）', () => {
  it('结构未变时不重建按钮节点', () => {
    const { panel } = makePanel();
    panel.update(view('running'));
    const first = panel.el.querySelector('.btn--danger');
    expect(first).not.toBeNull();
    // 模拟渲染循环每帧刷新计时器
    for (let i = 0; i < 60; i += 1) panel.update(view('running'));
    expect(panel.el.querySelector('.btn--danger')).toBe(first);
  });

  it('反复刷新后「结束」按钮仍可点击（回归：重建会吞掉 mousedown→mouseup）', () => {
    const { panel, calls } = makePanel();
    panel.update(view('running'));
    for (let i = 0; i < 60; i += 1) panel.update(view('running'));
    const btn = panel.el.querySelector<HTMLButtonElement>('.btn--danger');
    expect(btn).not.toBeNull();
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(calls.end).toBe(1);
  });

  it('状态变化时才重建按钮', () => {
    const { panel } = makePanel();
    panel.update(view('ready'));
    const startBtn = panel.el.querySelector('.btn--action');
    panel.update(view('running'));
    expect(panel.el.querySelector('.btn--action')).not.toBe(startBtn);
    expect(panel.el.querySelector('.btn--danger')).not.toBeNull();
  });

  it('「可提交」态主按钮换成提交解答，结束降级为放弃', () => {
    const { panel, calls } = makePanel();
    panel.update(view('solved_pending', true));
    const labels = Array.from(panel.el.querySelectorAll('.btn')).map((b) => b.textContent);
    expect(labels.join(' ')).toContain('提交解答');
    expect(labels.join(' ')).toContain('放弃');
    panel.el.querySelector<HTMLButtonElement>('.btn--action')?.click();
    expect(calls.submit).toBe(1);
  });

  it('结束后「再挑战一次」走 retryNew（v1.9：不再绑 start 的静默守卫）', () => {
    const { panel, calls } = makePanel();
    panel.update(view('ended_timeout'));
    const labels = Array.from(panel.el.querySelectorAll('.btn')).map((b) => b.textContent);
    expect(labels.join(' ')).toContain('再挑战一次');
    const retry = Array.from(panel.el.querySelectorAll('button')).find((b) => b.textContent === '再挑战一次');
    retry?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(calls.retryNew).toBe(1);
    expect(calls.start).toBe(0);
  });

  it('暂停态提示"计时已冻结"（v1.9 真暂停语义）', () => {
    const { panel } = makePanel();
    panel.update(view('paused'));
    expect(panel.el.textContent).toContain('计时已冻结');
  });

  it('AC-58：Agent 模式 running 态不渲染暂停按钮，人类模式照常渲染', () => {
    const { panel } = makePanel();
    panel.update(view('running', false, 'agent'));
    const labels = Array.from(panel.el.querySelectorAll('.btn')).map((b) => b.textContent?.trim());
    expect(labels).not.toContain('暂停');
    expect(labels).toContain('结束');

    panel.update(view('running', false, 'human'));
    const humanLabels = Array.from(panel.el.querySelectorAll('.btn')).map((b) => b.textContent?.trim());
    expect(humanLabels).toEqual(['暂停', '结束']);
  });

  it('AC-58：参与者切换本身触发按钮重建（running 态人机互切）', () => {
    const { panel } = makePanel();
    panel.update(view('running', false, 'human'));
    const before = panel.el.querySelector('.btn--danger');
    panel.update(view('running', false, 'agent'));
    expect(panel.el.textContent).not.toContain('暂停');
    panel.update(view('running', false, 'human'));
    expect(panel.el.textContent).toContain('暂停');
    expect(panel.el.querySelector('.btn--danger')).not.toBe(before);
  });
});
