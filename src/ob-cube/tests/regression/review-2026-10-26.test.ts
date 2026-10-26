// @vitest-environment node
/**
 * docs/reviews/ob-cube-code-prd-review-full.md 的最低回归集 R01-R13。
 *
 * 每条用例对应报告第三部分的一行，断言的是**用户可见结论**（步数、胜负、
 * 是否泄露题面、回放是否还原），不是内部实现细节。
 */
import { describe, expect, it, vi } from 'vitest';
import { ChallengeSession, createFakeClock, MAX_RECORDED_EVENTS, viewAtStep } from '../../src/challenge';
import type { SessionOptions } from '../../src/challenge';
import { createCubeAgent } from '../../src/agent';
import { fingerprintState, parseMove } from '../../src/engine';
import { replayScramble } from '../../src/puzzle';
import type { ChallengeResult, CubeSize } from '../../src/contracts';
import { HistoryService, medianSolvedElapsed } from '../../src/services/history';
import type { RunRecord } from '../../src/services/history';
import { LocalStore } from '../../src/services/storage';

function makeSession(patch: Partial<SessionOptions> = {}) {
  const time = createFakeClock(1000);
  const session = new ChallengeSession({
    size: 2,
    seed: 'r03-0',
    clock: time.now,
    ...patch,
  });
  return { session, time };
}

function inverseOf(notation: string, size: CubeSize): string {
  const spec = parseMove(notation, size);
  const base = spec.normalized.replace(/(['2])$/, '');
  return spec.amount === 1 ? `${base}'` : spec.amount === 3 ? base : `${base}2`;
}

/** 打乱序列的逆序取逆 = 一条可行解（其最后一步 = inverse(scramble[0])） */
function solutionOf(session: ChallengeSession): string[] {
  return [...session.record.scramble].reverse().map((move) => inverseOf(move, session.size));
}

describe('R01 未结束阶段公开元信息不得泄露题面', () => {
  it('ready / running / paused / solved_pending 四态 seed、scramble、指纹均为 null', () => {
    const { session } = makeSession();
    const agent = createCubeAgent(session);
    const assertHidden = (): void => {
      const info = agent.getChallengeInfo();
      expect(info.seed, `status=${session.status}`).toBeNull();
      expect(info.scramble).toBeNull();
      expect(info.facelet_string).toBeNull();
      expect(info.state_fingerprint).toBeNull();
    };

    expect(session.status).toBe('ready');
    assertHidden();

    session.start();
    const solution = solutionOf(session);
    for (const move of solution.slice(0, 3)) session.applyMoveNotation(move);
    expect(session.status).toBe('running');
    assertHidden(); // 旧实现正是在这里把 seed 交了出去

    session.pause();
    expect(session.status).toBe('paused');
    assertHidden();

    session.resume();
    for (const move of solution.slice(3)) session.applyMoveNotation(move);
    expect(session.status).toBe('solved_pending');
    assertHidden();

    // 结束后才允许交出复现资料（PRD §7.10）
    session.interrupt();
    const info = agent.getChallengeInfo();
    expect(info.seed).toBe('r03-0');
    expect(info.scramble).toBe(session.record.scramble.join(' '));
  });
});

describe('R02 API 转动与视角切换必须落到同一份状态', () => {
  it('applyMove 后状态、观察数据、事件三者一致；rotateView 写入 view_after', () => {
    const { session } = makeSession({ size: 3, seed: 'r02-state' });
    const onMutate = vi.fn();
    const agent = createCubeAgent(session, onMutate);
    session.start();
    const before = session.cubeState;

    const move = agent.applyMove('R');
    expect(onMutate).toHaveBeenCalledTimes(1); // 宿主才有机会同帧重绘
    expect(session.cubeState).not.toBe(before);
    expect(move.move_count).toBe(1);
    // 观察数据必须就是内部状态（渲染层 paint 的输入），不是另一份快照
    expect(move.next_observation?.face_colors).toEqual(session.peekObservation().face_colors);
    const moveEvent = session.eventLog.filter((event) => event.type === 'move');
    expect(moveEvent).toHaveLength(1);
    expect(moveEvent[0]?.input_channel).toBe('api');

    const view = agent.rotateView({ up: 'U', front: 'R' });
    expect(view).toEqual({ up: 'U', front: 'R' });
    expect(session.viewOrientation).toEqual({ up: 'U', front: 'R' });
    expect(session.peekObservation().view_orientation).toEqual({ up: 'U', front: 'R' });
    expect(session.eventLog.at(-1)?.view_after).toEqual({ up: 'U', front: 'R' });
  });
});

describe('R03 归并先于定稿：只差 R2 且剩余 1 步', () => {
  /** 该种子下解的最后一步恰是 R2（180°），因此「双按 R」与「提交 R2」指向同一动作 */
  const solutionFor = (): { session: ChallengeSession; time: ReturnType<typeof createFakeClock>; prefix: string[] } => {
    const { session, time } = makeSession({ moveLimit: 11 });
    session.start();
    const solution = solutionOf(session);
    expect(session.record.scramble).toHaveLength(11);
    expect(solution.at(-1)).toBe('R2');
    const prefix = solution.slice(0, -1);
    for (const move of prefix) session.applyMoveNotation(move);
    expect(session.moveCount).toBe(10);
    return { session, time, prefix };
  };

  it('显式 R2 在 1 步内还原', () => {
    const { session } = solutionFor();
    session.applyMoveNotation('R2');
    expect(session.status).toBe('solved_pending');
    expect(session.moveCount).toBe(11);
  });

  it('键盘双击表达同一动作时，结果与计步完全一致', () => {
    const { session } = solutionFor();
    session.applyIntent('R', [1], 1, false, 'keyboard');
    expect(session.status).toBe('running'); // 归并窗口内先不判负
    session.applyIntent('R', [1], 1, true, 'keyboard');

    expect(session.status).toBe('solved_pending');
    expect(session.moveCount).toBe(11);
    const moves = session.eventLog.filter((event) => event.type === 'move');
    expect(moves.at(-1)?.move).toBe('R2');
    expect(moves.at(-1)?.merged_from).toEqual(['R', 'R']);
    expect(moves.filter((event) => event.move === 'R2')).toHaveLength(1);
  });

  it('窗口关闭后仍按步数耗尽结算（推迟不等于取消）', () => {
    const { session, time } = solutionFor();
    session.applyIntent('R', [1], 1, false, 'keyboard');
    time.advance(400);
    session.tick();
    expect(session.status).toBe('ended_move_limit');
    expect(() => session.applyIntent('R', [1], 1, true, 'keyboard')).toThrowError(/步数/);
  });
});

describe('R05 受限观察预算用尽后，任何入口都不再交付新题面', () => {
  it('24 次后 observe 抛 BUDGET，applyMove 仍可执行但 next_observation 为 null', () => {
    const { session } = makeSession({ size: 3, seed: 'r05', observationMode: 'restricted' });
    const agent = createCubeAgent(session);
    session.start();

    for (let i = 0; i < 24; i += 1) agent.observe();
    expect(() => agent.observe()).toThrowError(/用尽/);

    const result = agent.applyMove('R');
    expect(result.move_count).toBe(1); // 操作照常执行
    expect(result.next_observation).toBeNull(); // 但不再夹带颜色

    // 面板也不能成为旁路：只显示最后一次交付的快照（move_count 仍是 0）
    const peek = session.peekObservation();
    expect(peek.move_count).toBe(0);
    expect(peek.observation_id).toBe(`${session.rules.run_id}:o24`);
  });
});

describe('R06 每份新观察可唯一识别，每个操作可追溯依据', () => {
  it('observe 一次后连续使用自动返回的观察，编号递增且事件记录依据', () => {
    const { session } = makeSession({ size: 3, seed: 'r06' });
    const agent = createCubeAgent(session);
    session.start();

    const first = agent.observe();
    const step1 = agent.applyMove('R', { based_on_observation_id: first.observation_id });
    const second = step1.next_observation;
    expect(second).not.toBeNull();
    const step2 = agent.applyMove('U', { based_on_observation_id: second!.observation_id });
    const third = step2.next_observation;
    expect(third).not.toBeNull();

    const ids = [first.observation_id, second!.observation_id, third!.observation_id];
    expect(new Set(ids).size).toBe(3); // 旧实现三份快照共用一个 id

    const moves = session.eventLog.filter((event) => event.type === 'move');
    expect(moves[0]?.based_on_observation_id).toBe(ids[0]);
    expect(moves[1]?.based_on_observation_id).toBe(ids[1]);
    expect(moves[0]?.observation_id).toBe(ids[0]);
    expect(moves[1]?.observation_id).toBe(ids[1]);
  });
});

describe('R07 最后一步成功后重试同一 op_id', () => {
  it('返回原执行结果、不重复计步、不丢成功确认', () => {
    const { session } = makeSession({ moveLimit: 11 });
    const agent = createCubeAgent(session);
    session.start();
    const solution = solutionOf(session);
    for (const move of solution.slice(0, -1)) agent.applyMove(move);
    const last = agent.applyMove('R2', { op_id: 'last-step' });
    expect(last.deduplicated).toBe(false);
    expect(session.status).toBe('solved_pending');

    const retry = agent.applyMove('R2', { op_id: 'last-step' });
    expect(retry.deduplicated).toBe(true);
    expect(retry.move).toBe('R2');
    expect(session.moveCount).toBe(11); // 没有重复计步
    expect(session.status).toBe('solved_pending'); // 成功确认没丢
  });
});

describe('R08 solved_pending 时刷新页面', () => {
  it('结算为 ended_solved，submit_ms 保持 null', () => {
    const { session } = makeSession();
    session.start();
    for (const move of solutionOf(session)) session.applyMoveNotation(move);
    expect(session.status).toBe('solved_pending');

    session.interrupt();
    expect(session.status).toBe('ended_solved');
    const result = session.getChallengeResult();
    expect(result.solved).toBe(true);
    expect(result.submit_ms).toBeNull();
    expect(result.events.some((event) => event.type === 'end')).toBe(true);
  });
});

describe('R09 同题连续运行两次', () => {
  it('run id、统计、事件彼此独立；旧 run 查结果报 RUN_NOT_FOUND', () => {
    const { session } = makeSession({ size: 3, seed: 'r09' });
    const agent = createCubeAgent(session);
    session.start();
    const firstRun = session.rules.run_id;
    const challengeId = session.rules.challenge_id;
    agent.applyMove('R');
    agent.applyMove('U');
    expect(session.agentStats.calls).toBe(2);

    session.abandon();
    expect(agent.getChallengeResult(challengeId, firstRun).status).toBe('ended_abandoned');

    session.resetRun();
    expect(session.rules.run_id).not.toBe(firstRun);
    expect(session.eventLog).toHaveLength(0);
    expect(session.agentStats).toMatchObject({ calls: 0, moves: 0, observes: 0 });

    session.start();
    session.abandon();
    expect(() => agent.getChallengeResult(challengeId, firstRun)).toThrowError(/找不到运行/);
  });
});

describe('R10 多次改变视角后的观察者回放', () => {
  it('每一步恢复当时实际获准看到的三个面', () => {
    const { session } = makeSession({ size: 3, seed: 'r10', observationMode: 'three_faces' });
    session.start();
    const expected: string[][] = [session.visibleFaces().slice().sort()];

    session.applyMoveNotation('R');
    expected.push(session.visibleFaces().slice().sort());
    session.rotateView({ up: 'U', front: 'R' });
    session.applyMoveNotation('U');
    expected.push(session.visibleFaces().slice().sort());
    session.rotateView({ up: 'F', front: 'U' });
    session.applyMoveNotation('F');
    expected.push(session.visibleFaces().slice().sort());

    for (let step = 0; step <= 3; step += 1) {
      const view = viewAtStep(session.eventLog, step);
      const faces = session.visibleFacesFor(view).slice().sort();
      expect(faces, `step=${step}`).toEqual(expected[step]);
    }
    // 最后一步的视野与结束时的视野确实不同——用例本身要能区分新旧实现
    expect(viewAtStep(session.eventLog, 0)).not.toEqual(session.viewOrientation);
  });
});

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

describe('R11 保存记录后重载', () => {
  it('用保存的原始打乱序列重建，并通过初始指纹校验', () => {
    const storage = new MemoryStorage();
    const service = new HistoryService(new LocalStore(storage));
    const { session } = makeSession({ size: 3, seed: 'r11-scramble' });
    session.start();
    for (const move of solutionOf(session)) session.applyMoveNotation(move);
    session.submitSolution('done');

    const result = session.getChallengeResult();
    expect(result.scramble).toEqual([...session.record.scramble]);
    service.save(result);

    const reloaded = new HistoryService(new LocalStore(storage)).list().records[0];
    expect(reloaded).toBeDefined();
    const saved = reloaded!.result;
    expect(saved.scramble).toHaveLength(session.record.scramble.length);
    expect(saved.gen_algorithm_version).toBe(session.record.generation.algorithm_version);
    const rebuilt = replayScramble(saved.rules.cube_size, saved.scramble!);
    // 逐字比对初始指纹：生成算法升级后也能证明这份记录指的是同一道题
    expect(fingerprintState(rebuilt)).toBe(saved.initial_fingerprint);
    expect(fingerprintState(rebuilt)).toBe(session.record.initial_state_fingerprint);
  });
});

describe('R12 同题同时存在成功、放弃、超时记录', () => {
  it('成功耗时只统计同规则的成功运行，且用还原时刻', () => {
    const base = makeSession({ size: 3, seed: 'r12' });
    base.session.start();
    const template = (() => {
      for (const move of solutionOf(base.session)) base.session.applyMoveNotation(move);
      base.session.submitSolution();
      return base.session.getChallengeResult();
    })();

    const record = (id: string, patch: Partial<ChallengeResult>): RunRecord => ({
      id,
      savedAt: '2026-10-26T00:00:00.000Z',
      result: { ...template, ...patch },
    });

    const records: RunRecord[] = [
      record('run-a', { status: 'ended_solved', solved: true, elapsed_ms: 2000, solved_at_ms: 1200 }),
      record('run-b', { status: 'ended_solved', solved: true, elapsed_ms: 3000, solved_at_ms: 1800 }),
      record('run-abandon', { status: 'ended_abandoned', solved: false, elapsed_ms: 100, solved_at_ms: null }),
      record('run-timeout', { status: 'ended_timeout', solved: false, elapsed_ms: 200, solved_at_ms: null }),
      record('run-other-rule', {
        status: 'ended_solved',
        solved: true,
        elapsed_ms: 80,
        solved_at_ms: 80,
        rules: { ...template.rules, observation_mode: 'restricted' },
      }),
    ];

    // 只有 run-a / run-b 可比 → 中位数 = (1200 + 1800) / 2 = 1500
    expect(medianSolvedElapsed(records, template.rules)).toBe(1500);
    expect(medianSolvedElapsed(records, template.rules, 'run-b')).toBe(1200);
    expect(medianSolvedElapsed(records, { ...template.rules, move_limit: 3 })).toBeNull();
  });
});

describe('R13 运行超过事件数量阈值', () => {
  it('view 事件优先丢弃，非 view 事件全保留', () => {
    const { session } = makeSession({ size: 2, seed: 'r13-a' });
    session.start();
    const faces = [
      { up: 'U', front: 'F' },
      { up: 'U', front: 'R' },
      { up: 'F', front: 'U' },
      { up: 'R', front: 'U' },
    ] as const;
    for (let i = 0; i < 1200; i += 1) {
      if (session.status !== 'running') break;
      if (i % 40 === 0) session.beginFrame(); // AC-44 限流按帧计数
      session.applyMoveNotation(['R', 'U', 'F'][i % 3]!);
      session.rotateView(faces[i % 4]!);
      session.rotateView(faces[(i + 1) % 4]!);
    }
    session.abandon();
    const result = session.getChallengeResult();
    const views = session.eventLog.filter((event) => event.type === 'view').length;
    const nonViews = session.eventLog.filter((event) => event.type !== 'view').length;
    expect(views).toBeGreaterThan(0);
    expect(nonViews).toBeLessThanOrEqual(MAX_RECORDED_EVENTS);
    expect(result.events.filter((event) => event.type === 'view')).toHaveLength(0);
    expect(result.events).toHaveLength(nonViews);
    expect(result.events_truncated).toBe(true);
    expect(result.events_dropped).toBe(views);
    expect(result.events.at(-1)?.type).toBe('end');
  });

  it('非 view 事件本身超限时保留尾部，结束事件不丢', () => {
    const { session } = makeSession({ size: 2, seed: 'r13-b' });
    session.start();
    const total = MAX_RECORDED_EVENTS + 120;
    for (let i = 0; i < total; i += 1) {
      if (session.status !== 'running') break;
      if (i % 40 === 0) session.beginFrame(); // AC-44 限流按帧计数
      session.applyMoveNotation(['R', 'U', 'F'][i % 3]!);
    }
    session.abandon();
    const result = session.getChallengeResult();
    expect(result.events.length).toBeLessThanOrEqual(MAX_RECORDED_EVENTS);
    expect(result.events_truncated).toBe(true);
    // 尾部保留：最后的 end 事件必须在，早期的 start 事件可以不在
    expect(result.events.at(-1)?.type).toBe('end');
    expect(result.events.some((event) => event.type === 'start')).toBe(false);
    expect(result.move_count).toBeGreaterThan(MAX_RECORDED_EVENTS);
  });
});
