// @vitest-environment node
/**
 * AC-28 回归：只读 API（getProgress / observe）内部的 tick 把超时结算掉时，
 * 必须触发宿主 onMutate 回调——否则状态翻转发生在渲染循环的 before/after
 * 快照之外，UI 会一直停留在 running 态直到用户下一次操作（浏览器实测坐实过）。
 */
import { describe, expect, it, vi } from 'vitest';
import { ChallengeSession, createFakeClock } from '../../src/challenge';
import { createCubeAgent } from '../../src/agent';

function makeAgent(timeLimitMs = 5000) {
  const time = createFakeClock();
  const session = new ChallengeSession({
    size: 2,
    seed: 'agent-flip',
    timeLimitMs,
    clock: time.now,
  });
  const onMutate = vi.fn();
  const agent = createCubeAgent(session, onMutate);
  return { agent, session, time, onMutate };
}

describe('Agent API 契约补齐（AC-41 / AC-42 / §13.4）', () => {
  it('方法白名单恰为 9 个；applyMove 成功返回含 ok:true 与 api 通道', () => {
    const { agent, session } = makeAgent();
    session.start();
    expect(Object.keys(agent)).toHaveLength(9);
    const result = agent.applyMove('R', { op_id: 'op-1' });
    expect(result.ok).toBe(true);
    expect(result.layer_set).toEqual([1]);
    expect(session.eventLog.at(-1)?.input_channel).toBe('api');
  });

  it('getLastActionResult(opId) 按 id 取回，未知 id 抛 E_OP_ID_NOT_FOUND', () => {
    const { agent, session } = makeAgent();
    session.start();
    agent.applyMove('R', { op_id: 'op-1' });
    expect(agent.getLastActionResult('op-1')).toMatchObject({ move: 'R', op_id: 'op-1' });
    let code: string | undefined;
    try {
      agent.getLastActionResult('op-missing');
    } catch (error) {
      code = (error as { code?: string }).code;
    }
    expect(code).toBe('E_OP_ID_NOT_FOUND');
  });
});

describe('只读 API 内的状态翻转必须同步 UI（AC-28）', () => {
  it('getProgress 轮询触发超时结算时调用 onMutate，且只调一次', () => {
    const { agent, session, time, onMutate } = makeAgent();
    session.start();
    time.advance(6000);
    expect(onMutate).not.toHaveBeenCalled();

    const progress = agent.getProgress();
    expect(progress.status).toBe('ended_timeout');
    expect(onMutate).toHaveBeenCalledTimes(1);

    agent.getProgress();
    expect(onMutate).toHaveBeenCalledTimes(1); // 状态未再变，不重复触发
  });

  it('observe 轮询触发超时结算时调用 onMutate（结算后 observe 抛 ENDED 属正常）', () => {
    const { agent, session, time, onMutate } = makeAgent();
    session.start();
    time.advance(6000);
    expect(() => agent.observe()).toThrowError(/已超过时间限制/);
    expect(session.status).toBe('ended_timeout');
    expect(onMutate).toHaveBeenCalledTimes(1);
  });

  it('运行中正常轮询不触发 onMutate（读操作零副作用）', () => {
    const { agent, session, time, onMutate } = makeAgent();
    session.start();
    time.advance(1000);
    agent.getProgress();
    agent.observe();
    expect(onMutate).not.toHaveBeenCalled();
    expect(session.status).toBe('running');
  });
});
