// @vitest-environment node
/**
 * R2 复审报告的回归集（docs/reviews/ob-cube-code-prd-review-r2.md 第 6 节）。
 *
 * 覆盖可在单测层判定的项：T03 / T05 / T06（Session 侧）/ T07 / T08 / T09 / T11。
 * T01 / T02 / T12 需要真实 3D 渲染与相机，放在浏览器验收；T15 需要真实刷新，
 * 单测只能覆盖状态机与落盘（见 R08）。
 */
import { describe, expect, it } from 'vitest';
import { ChallengeSession, createFakeClock, viewAtStep } from '../../src/challenge';
import type { SessionOptions } from '../../src/challenge';
import { createCubeAgent } from '../../src/agent';
import { parseMove } from '../../src/engine';

function makeSession(patch: Partial<SessionOptions> = {}) {
  const time = createFakeClock(1000);
  const session = new ChallengeSession({ size: 3, seed: 'r2-suite', clock: time.now, ...patch });
  return { session, time };
}

describe('T05 / R2-07 预算耗尽后不再宣称可以观察', () => {
  it('第 24 次交付后 observation_allowed 立刻为 false', () => {
    const { session } = makeSession({ observationMode: 'restricted' });
    session.start();
    expect(session.getProgress().observation_allowed).toBe(true);

    for (let i = 0; i < 23; i += 1) session.observe();
    expect(session.observeBudgetLeft()).toBe(1);
    expect(session.getProgress().observation_allowed).toBe(true);

    session.observe();
    expect(session.observeBudgetLeft()).toBe(0);
    // 探针 P06：旧实现这里仍为 true，紧接着 observe() 抛预算耗尽
    expect(session.getProgress().observation_allowed).toBe(false);
    expect(() => session.observe()).toThrowError(/用尽/);
  });
});

describe('T06 / R2-03 归并窗口内插入视角事件', () => {
  it('换视角会切断归并：两条事件、序号唯一、时间不倒序', () => {
    const { session, time } = makeSession();
    session.start();
    session.applyIntent('R', [1], 1, false, 'keyboard');
    time.advance(80);
    session.stepView('left');
    time.advance(10);
    session.applyIntent('R', [1], 1, true, 'keyboard');

    expect(session.moveCount).toBe(2); // 没有被折成一条 R2
    const events = session.eventLog;
    const seqs = events.map((event) => event.seq);
    expect(new Set(seqs).size).toBe(seqs.length); // 序号唯一（探针 P03 曾给出 [1,3,3]）
    const times = events.map((event) => event.at_ms);
    expect(times).toEqual([...times].sort((a, b) => a - b)); // 时间不倒序
    expect(events.filter((event) => event.type === 'move').map((event) => event.move)).toEqual(['R', 'R']);
  });

  it('观察同样会切断归并', () => {
    const { session } = makeSession();
    session.start();
    session.applyIntent('R', [1], 1, false, 'keyboard');
    session.observe();
    session.applyIntent('R', [1], 1, true, 'keyboard');
    expect(session.moveCount).toBe(2);
  });

  it('暂停/继续同样会切断归并', () => {
    const { session } = makeSession();
    session.start();
    session.applyIntent('R', [1], 1, false, 'keyboard');
    session.pause();
    session.resume();
    session.applyIntent('R', [1], 1, true, 'keyboard');
    expect(session.moveCount).toBe(2);
  });

  it('连续两次按键（无插入事件）仍然正常归并', () => {
    const { session } = makeSession();
    session.start();
    session.applyIntent('R', [1], 1, false, 'keyboard');
    session.applyIntent('R', [1], 1, true, 'keyboard');
    expect(session.moveCount).toBe(1);
    expect(session.eventLog.filter((event) => event.type === 'move')[0]?.move).toBe('R2');
    const seqs = session.eventLog.map((event) => event.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
  });
});

describe('T07 / R2-03 after_move 的观察权限按状态版本判定', () => {
  it('观察后换视角不解锁；再转动才解锁', () => {
    const { session } = makeSession({ observationMode: 'after_move' });
    session.start();
    session.applyIntent('R', [1], 1, false, 'keyboard');
    session.observe();
    expect(() => session.observe()).toThrowError(/先完成一次转动/);

    // 换视角不改变魔方状态，不该重新开放观察机会
    session.rotateView({ up: 'U', front: 'R' });
    expect(() => session.observe()).toThrowError(/先完成一次转动/);

    session.applyIntent('U', [1], 1, false, 'keyboard');
    expect(session.observe().move_count).toBe(2);
  });

  it('报告原文的「观察后再归并」场景已被 R2-03 关闭：归并窗口在观察时定稿', () => {
    // 两条裁定交叉后的必然结果：observe 会先定稿当前开放动作（R2-03 的修改建议），
    // 所以「D → observe → D」不再是一条 R2，而是两次独立转动。
    // 观察门控因此不需要处理"归并后 moveCount 不变"的情况；状态版本仍是更稳的基准，
    // 若将来放宽窗口规则（OD-05），它保证新物理状态不会沿用旧观察。
    const { session } = makeSession({ observationMode: 'after_move' });
    session.start();
    session.applyIntent('R', [1], 1, false, 'keyboard');
    session.observe();
    session.applyIntent('R', [1], 1, true, 'keyboard');
    expect(session.moveCount).toBe(2);
    expect(session.observe().move_count).toBe(2);
  });
});

describe('T08 / R2-04 合法别名用同一 op_id 重试', () => {
  it('2Rw 归一化为 Rw 后重试命中缓存，不重复计步', () => {
    const { session } = makeSession({ size: 4, seed: 'r2-alias' });
    const agent = createCubeAgent(session);
    session.start();
    // 前提：2Rw 与 Rw 是同一个物理动作（归一化口径由引擎保证）
    expect(parseMove('2Rw', 4).normalized).toBe('Rw');

    const first = agent.applyMove('2Rw', { op_id: 'retry-alias' });
    expect(first.deduplicated).toBe(false);
    expect(first.move).toBe('Rw');
    const count = session.moveCount;

    const retry = agent.applyMove('2Rw', { op_id: 'retry-alias' });
    expect(retry.deduplicated).toBe(true); // 旧实现在这里抛 E_OP_ID_CONFLICT
    expect(retry.move).toBe('Rw');
    expect(session.moveCount).toBe(count); // 没有重复计步

    // 归一化后写法不同、物理动作相同：仍然算同一个请求
    expect(agent.applyMove('Rw', { op_id: 'retry-alias' }).deduplicated).toBe(true);
    // 真正不同的动作必须报冲突
    expect(() => agent.applyMove('U', { op_id: 'retry-alias' })).toThrowError(/已绑定/);
  });
});

describe('T09 / R2-08 公开返回值不得反向改写内部状态', () => {
  it('改写 applyMove 的返回值不影响缓存、事件与重试结果', () => {
    const { session } = makeSession();
    const agent = createCubeAgent(session);
    session.start();
    const result = agent.applyMove('R', { op_id: 'immutable' });

    expect(Object.isFrozen(result)).toBe(true);
    expect(() => {
      (result as unknown as { move: string }).move = 'U';
    }).toThrow(TypeError);
    expect(result.move).toBe('R');

    const retry = agent.applyMove('R', { op_id: 'immutable' });
    expect(retry.deduplicated).toBe(true);
    expect(retry.move).toBe('R');
    expect(session.moveCount).toBe(1);
  });

  it('改写观察的嵌套网格不影响已交付快照', () => {
    const { session } = makeSession();
    session.start();
    const obs = session.observe();
    const grid = obs.face_colors.U;
    expect(grid).toBeDefined();
    expect(Object.isFrozen(grid)).toBe(true);
    expect(() => {
      (grid as unknown as string[][])[0]![0] = 'red';
    }).toThrow(TypeError);
    expect(session.peekObservation().face_colors.U).toEqual(grid);
  });

  it('改写结果里的事件不影响内部日志', () => {
    const { session } = makeSession();
    session.start();
    session.applyMoveNotation('R');
    session.abandon();
    const result = session.getChallengeResult();
    const moveEvent = result.events.find((event) => event.type === 'move');
    expect(moveEvent && Object.isFrozen(moveEvent)).toBe(true);
    expect(() => {
      (moveEvent as unknown as { move: string }).move = 'U';
    }).toThrow(TypeError);
    expect(session.eventLog.find((event) => event.type === 'move')?.move).toBe('R');
  });
});

describe('T03 / R2-02 after_move 面板只能看到已交付的快照', () => {
  it('转动后未显式观察时，只读投影仍是上一份快照而不是新状态', () => {
    const { session } = makeSession({ observationMode: 'after_move' });
    session.start();
    session.applyMoveNotation('R', undefined, null, false);
    const delivered = session.observe();
    const deliveredGrid = delivered.face_colors.U;

    // 再转动一次，但不观察
    session.applyMoveNotation('U', undefined, null, false);
    const peek = session.peekObservation();
    expect(peek.observation_id).toBe(delivered.observation_id); // 编号不能"借新还旧"
    expect(peek.face_colors.U).toEqual(deliveredGrid); // 内容必须就是那份快照
    expect(peek.move_count).toBe(delivered.move_count);
  });
});

describe('T11 / R2-06 回放第 0 步恢复开始前的视角', () => {
  it('ready 态换视角后再开始，viewAtStep(0) 取到的是该选择', () => {
    const { session } = makeSession();
    session.rotateView({ up: 'U', front: 'R' });
    session.start();
    expect(viewAtStep(session.eventLog, 0)).toEqual({ up: 'U', front: 'R' });
  });
});

describe('R2-02 人类通道的观察交付同规则', () => {
  it('按钮/键盘/记法框三种入口都不消耗预算', () => {
    const { session } = makeSession({ observationMode: 'restricted' });
    session.start();
    session.applyIntent('R', [1], 1, false, 'button');
    session.applyIntent('U', [1], 1, false, 'keyboard');
    session.applyMoveNotation('F', undefined, null, false);
    expect(session.observeBudgetLeft()).toBe(24); // 一次都没消耗
    expect(session.getLastActionResult()?.next_observation).toBeNull();
  });
});
