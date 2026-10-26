// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ChallengeSession } from '../../src/challenge';
import type { SessionOptions } from '../../src/challenge';

function makeSession(patch: Partial<SessionOptions> = {}) {
  const session = new ChallengeSession({
    size: 3,
    seed: 'rate-limit-seed',
    ...patch,
  });
  return { session };
}

describe('AC-44 限流：单帧内 applyMove 超过 60 次必须拒绝', () => {
  it('同一帧内第 61 次调用抛 E_RATE_LIMITED，前 60 次照常执行', () => {
    const { session } = makeSession();
    session.start();
    let code: string | null = null;
    let applied = 0;
    for (let i = 0; i < 100; i += 1) {
      try {
        session.applyMoveNotation('R');
        applied += 1;
      } catch (error) {
        code = (error as { code?: string }).code ?? String(error);
        break;
      }
    }
    expect(code).toBe('E_RATE_LIMITED');
    expect(applied).toBe(60);
  });

  it('beginFrame 清零后恢复可用', () => {
    const { session } = makeSession();
    session.start();
    for (let i = 0; i < 60; i += 1) session.applyMoveNotation('U');
    expect(() => session.applyMoveNotation('U')).toThrowError(/频繁/);
    session.beginFrame(); // 宿主每帧调用：进入下一帧
    expect(() => session.applyMoveNotation('U')).not.toThrow();
  });

  it('正常节奏（每帧一两次调用）永不触发', () => {
    const { session } = makeSession();
    session.start();
    for (let frame = 0; frame < 300; frame += 1) {
      session.beginFrame();
      session.applyMoveNotation('R');
      session.applyMoveNotation('U');
    }
    expect(session.moveCount).toBe(600);
  });

  it('resetRun 清空限流计数', () => {
    const { session } = makeSession();
    session.start();
    for (let i = 0; i < 60; i += 1) session.applyMoveNotation('F');
    expect(() => session.applyMoveNotation('F')).toThrowError(/频繁/);
    session.abandon();
    session.resetRun();
    session.start();
    expect(() => session.applyMoveNotation('F')).not.toThrow();
  });

  it('tick 不清零限流计数（只有 beginFrame 才是帧边界）', () => {
    const { session } = makeSession();
    session.start();
    for (let i = 0; i < 60; i += 1) session.applyMoveNotation('F');
    session.tick();
    expect(() => session.applyMoveNotation('F')).toThrowError(/频繁/);
  });
});
