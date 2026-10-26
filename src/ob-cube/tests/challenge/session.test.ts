// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ChallengeSession, createFakeClock } from '../../src/challenge';
import type { SessionOptions } from '../../src/challenge';
import { fingerprintState, parseMove } from '../../src/engine';

function makeSession(patch: Partial<SessionOptions> = {}) {
  const time = createFakeClock();
  const session = new ChallengeSession({
    size: 3,
    seed: 'test-seed-1',
    clock: time.now,
    ...patch,
  });
  return { session, time };
}

describe('真暂停（PRD §7.2.1 v1.9 / AC-55~57）', () => {
  it('暂停期间 elapsed_ms 冻结，恢复后从冻结点继续', () => {
    const { session, time } = makeSession();
    session.start();
    time.advance(1000);
    expect(session.elapsedMs()).toBe(1000);
    session.pause();
    time.advance(5000);
    expect(session.elapsedMs()).toBe(1000); // AC-55：增量 ≈ 0
    session.resume();
    time.advance(1000);
    expect(session.elapsedMs()).toBe(2000);
  });

  it('暂停中不可能超时（elapsed 冻结），恢复后才会判 timeout', () => {
    const { session, time } = makeSession({ timeLimitMs: 5000 });
    session.start();
    time.advance(4000);
    session.pause();
    time.advance(60_000);
    session.tick();
    expect(session.status).toBe('paused'); // AC-56：不判负
    session.resume();
    time.advance(1001);
    session.tick();
    expect(session.status).toBe('ended_timeout');
  });

  it('暂停中 observe / rotateView / applyMove 全部返回 E_CHALLENGE_PAUSED 且状态不变', () => {
    const { session } = makeSession();
    session.start();
    session.pause();
    const before = session.moveCount;
    for (const attempt of [
      () => session.observe(),
      () => session.rotateView({ up: 'U', front: 'R' }),
      () => session.applyMoveNotation('R'),
      () => session.applyIntent('R', [1], 1, false),
    ]) {
      expect(attempt).toThrowError(/暂停/);
    }
    expect(session.moveCount).toBe(before);
  });

  it('结果记录 pause_count 与 paused_total_ms（AC-59）', () => {
    const { session, time } = makeSession();
    session.start();
    session.pause();
    time.advance(1500);
    session.resume();
    session.abandon('done');
    const result = session.getChallengeResult();
    expect(result.pause_count).toBe(1);
    expect(result.paused_total_ms).toBe(1500);
  });

  it('暂停中放弃：暂停段不计入 elapsed', () => {
    const { session, time } = makeSession();
    session.start();
    time.advance(2000);
    session.pause();
    time.advance(999_999);
    session.abandon();
    expect(session.status).toBe('ended_abandoned');
    expect(session.elapsedMs()).toBe(2000);
  });
});

describe('180° 双击归并（PRD §5.3.1/§5.4，v1.9 修复回归）', () => {
  it('两次同向 90° 合并为一条 X2：1 步、事件含 merged_from', () => {
    const { session } = makeSession();
    session.start();
    const fp0 = session.eventLog.at(-1);
    expect(fp0).toBeDefined();
    session.applyIntent('R', [1], 1, false);
    session.applyIntent('R', [1], 1, true);
    expect(session.moveCount).toBe(1);
    const moves = session.eventLog.filter((e) => e.type === 'move');
    expect(moves).toHaveLength(1);
    expect(moves[0]?.move).toBe('R2');
    expect(moves[0]?.merged_from).toEqual(['R', 'R']);
  });

  it('Shift 双击（X\' X\'）同样合并为 X2', () => {
    const { session } = makeSession();
    session.start();
    session.applyIntent('R', [1], 3, false);
    session.applyIntent('R', [1], 3, true);
    expect(session.moveCount).toBe(1);
    const moves = session.eventLog.filter((e) => e.type === 'move');
    expect(moves[0]?.move).toBe('R2');
  });

  it('R R R 快按三下 = R2 + R（2 步），不是一条 R\'', () => {
    const { session } = makeSession();
    session.start();
    session.applyIntent('R', [1], 1, false);
    session.applyIntent('R', [1], 1, true);
    session.applyIntent('R', [1], 1, false);
    expect(session.moveCount).toBe(2);
    const moves = session.eventLog.filter((e) => e.type === 'move');
    expect(moves.map((m) => m.move)).toEqual(['R2', 'R']);
  });

  it('几何正确性：连做四次（两次归并）后指纹回到打乱初态', () => {
    const { session } = makeSession();
    session.start();
    const initial = fingerprintState(session.cubeState);
    for (let i = 0; i < 2; i += 1) {
      session.applyIntent('U', [1], 1, false);
      session.applyIntent('U', [1], 1, true);
    }
    // 4×90°(U) = 360° = 恒等变换
    expect(fingerprintState(session.cubeState)).toBe(initial);
    expect(session.moveCount).toBe(2);
  });
});

describe('步数上限（PRD §7.3 / AC-27）', () => {
  it('第 move_limit 步执行完仍未还原 → ended_move_limit', () => {
    const { session } = makeSession({ moveLimit: 2 });
    session.start();
    session.applyIntent('R', [1], 1, false);
    session.applyIntent('R', [1], 1, false);
    expect(session.status).toBe('ended_move_limit');
  });

  it('还原优先于步数耗尽：最后一步正好还原 → solved_pending（AC-27）', () => {
    const { session } = makeSession();
    session.start();
    // 解 = 打乱序列的逆序取逆；步数上限恰好设成解长度。
    // 必须基于 normalized 反转后缀——scramble 含 2R / 3R / 2Rw / 2-3Rw / M 等带前缀
    // 记法，只取首字符会把 "3R" 拼成 "3'" 这类非法串。
    const inverse = (move: string): string => {
      const spec = parseMove(move, 3);
      const base = spec.normalized.replace(/(['2])$/, '');
      return spec.amount === 1 ? `${base}'` : spec.amount === 3 ? base : `${base}2`;
    };
    const solution = [...session.record.scramble].reverse().map(inverse);
    const solved = new ChallengeSession({
      size: 3,
      seed: 'test-seed-1',
      clock: createFakeClock().now,
      moveLimit: solution.length,
    });
    solved.start();
    for (const move of solution) solved.applyMoveNotation(move);
    expect(solved.status).toBe('solved_pending');
  });
});

describe('预观察（v1.9：蒙尘=关）', () => {
  it('ready 态 observe 仍拒绝（API 门控不因预观察放开）', () => {
    const { session } = makeSession({ dustMode: false });
    expect(() => session.observe()).toThrowError(/尚未开始/);
  });

  it('ready 态允许 rotateView / stepView（预观察要转视角）', () => {
    const { session } = makeSession({ dustMode: false });
    expect(() => session.rotateView({ up: 'U', front: 'R' })).not.toThrow();
    expect(() => session.stepView('left')).not.toThrow();
  });
});

describe('ss-2 契约补齐（AC-42 / AC-28 / §7.3 错误码）', () => {
  it('applyMoveNotation 返回 layer_count / turn_amount / state_fingerprint_after（full 模式给真指纹）', () => {
    const { session } = makeSession();
    session.start();
    const result = session.applyMoveNotation('R');
    expect(result.layer_count).toBe(1);
    expect(result.turn_amount).toBe(90);
    expect(result.state_fingerprint_after).toBe(fingerprintState(session.cubeState));
    const half = session.applyMoveNotation('R2');
    expect(half.turn_amount).toBe(180);
    expect(half.layer_count).toBe(1);
  });

  it('受限观察下 state_fingerprint_after 为 null（键存在，PRD §8.6 有意屏蔽）', () => {
    const { session } = makeSession({ observationMode: 'three_faces' });
    session.start();
    const result = session.applyMoveNotation('R');
    expect(result.state_fingerprint_after).toBeNull();
  });

  it('超时结束后写操作返回 E_DEADLINE_EXCEEDED（AC-28：TIMEOUT 口径）', () => {
    const { session, time } = makeSession({ timeLimitMs: 1000 });
    session.start();
    time.advance(1500);
    session.tick();
    expect(session.status).toBe('ended_timeout');
    let caughtTimeout: unknown;
    try {
      session.applyMoveNotation('R');
    } catch (error) {
      caughtTimeout = error;
    }
    expect((caughtTimeout as { code?: string }).code).toBe('E_DEADLINE_EXCEEDED');
  });

  it('步数耗尽结束后写操作返回 E_MOVE_LIMIT_REACHED（PRD §7.3 第 N+1 步口径）', () => {
    const { session } = makeSession({ moveLimit: 1 });
    session.start();
    session.applyMoveNotation('R'); // 第 1 步：执行后未还原 → ended_move_limit
    expect(session.status).toBe('ended_move_limit');
    let caughtLimit: unknown;
    try {
      session.applyMoveNotation('U');
    } catch (error) {
      caughtLimit = error;
    }
    expect((caughtLimit as { code?: string }).code).toBe('E_MOVE_LIMIT_REACHED');
  });

  it('3 阶中层规范形式是 M 族（AC-34：Z+R 必须提交 M\'）', () => {
    const { session } = makeSession();
    session.start();
    expect(session.applyIntent('R', [2], 1, false).move).toBe("M'");
    expect(session.applyIntent('L', [2], 1, false).move).toBe('M');
    expect(session.applyIntent('R', [1, 2], 1, false).move).toBe('Rw');
  });

  it('4 阶远侧内层按就近命名（2L 而非 3R，§5.7 唯一命名规则）', () => {
    const { session } = makeSession({ size: 4 });
    session.start();
    expect(session.applyIntent('L', [2], 1, false).move).toBe('2L');
    expect(session.applyIntent('R', [3], 1, false).move).toBe("2L'");
    expect(session.applyIntent('R', [2, 3], 1, false).move).toBe('2-3R');
  });
});

describe('interrupted（PRD §7.3 页面关闭/刷新，本轮修复回归）', () => {
  it('running 中 interrupt → ended_interrupted，已有事件全部保留', () => {
    const { session, time } = makeSession();
    session.start();
    time.advance(1200);
    session.applyMoveNotation('R');
    session.applyMoveNotation('U');
    session.interrupt();
    expect(session.status).toBe('ended_interrupted');
    const result = session.getChallengeResult();
    expect(result.events.filter((e) => e.type === 'move')).toHaveLength(2);
    expect(result.move_count).toBe(2);
    expect(result.elapsed_ms).toBeGreaterThanOrEqual(1200);
    expect(result.solved).toBe(false);
  });

  it('paused 中 interrupt：暂停段计入 paused_total_ms、elapsed 冻结在暂停点', () => {
    const { session, time } = makeSession();
    session.start();
    time.advance(1000);
    session.pause();
    time.advance(3000);
    session.interrupt();
    const result = session.getChallengeResult();
    expect(result.status).toBe('ended_interrupted');
    expect(result.elapsed_ms).toBe(1000); // 不含暂停段
    expect(result.paused_total_ms).toBe(3000);
    expect(result.pause_count).toBe(1);
  });

  it('ready / ended 态 interrupt 无副作用', () => {
    const { session } = makeSession();
    session.interrupt();
    expect(session.status).toBe('ready');
    session.start();
    session.abandon();
    session.interrupt();
    expect(session.status).toBe('ended_abandoned'); // 已结束不再改判
  });
});

describe('AC-22 四字段（本轮修复回归：事件与返回值同源）', () => {
  it('move 事件携带 axis/layer_set/layer_count/turn_amount，与返回值一致', () => {
    const { session } = makeSession();
    session.start();
    const ret = session.applyMoveNotation('Rw');
    const event = session.eventLog.find((e) => e.type === 'move' && e.move === 'Rw');
    expect(event).toBeDefined();
    expect(event!.axis).toBe(ret.axis);
    expect(event!.layer_set).toEqual(ret.layer_set);
    expect(event!.layer_count).toBe(ret.layer_count);
    expect(event!.turn_amount).toBe(ret.turn_amount);
    expect(event!.turn_amount).toBe(90);
    expect(ret.layer_count).toBe(2);
  });

  it('归并事件四字段与直接提交 X2 一致（AC-63）', () => {
    const a = makeSession();
    a.session.start();
    a.session.applyIntent('R', [1], 1, false);
    a.session.applyIntent('R', [1], 1, true);
    const merged = a.session.eventLog.find((e) => e.type === 'move')!;
    const b = makeSession();
    b.session.start();
    b.session.applyMoveNotation('R2');
    const direct = b.session.eventLog.find((e) => e.type === 'move')!;
    expect(merged.turn_amount).toBe(180);
    expect(merged.axis).toBe(direct.axis);
    expect(merged.layer_set).toEqual(direct.layer_set);
    expect(merged.layer_count).toBe(direct.layer_count);
    expect(merged.to_fingerprint).toBe(direct.to_fingerprint);
  });

  it('非 move 事件四字段为 null', () => {
    const { session } = makeSession();
    session.start();
    session.pause();
    session.resume();
    const pauseEvent = session.eventLog.find((e) => e.type === 'pause')!;
    expect(pauseEvent.axis).toBeNull();
    expect(pauseEvent.layer_set).toBeNull();
    expect(pauseEvent.layer_count).toBeNull();
    expect(pauseEvent.turn_amount).toBeNull();
  });
});

describe('AC-05 layer_set 语义（记法层号，1 基，从被命名面算起）', () => {
  it('3 阶 R / M / B2 / 2R(alias) 按记法层号返回', () => {
    const { session } = makeSession();
    session.start();
    expect(session.applyMoveNotation('R').layer_set).toEqual([1]);
    expect(session.applyMoveNotation('M').layer_set).toEqual([2]);
    expect(session.applyMoveNotation('B2').layer_set).toEqual([1]);
    // 2R 在 3 阶规范化为 M'，层号仍是中层 2
    expect(session.applyMoveNotation('2R').layer_set).toEqual([2]);
  });

  it('4 阶 R / Rw / L / 2-3R / 3R(→2L\') 按记法层号返回', () => {
    const { session } = makeSession({ size: 4 });
    session.start();
    expect(session.applyMoveNotation('R').layer_set).toEqual([1]);
    expect(session.applyMoveNotation('Rw').layer_set).toEqual([1, 2]);
    // 记法层号从「被命名面」算起：L 的裸外层是 [1]，2L 才是 [2]
    expect(session.applyMoveNotation('L').layer_set).toEqual([1]);
    expect(session.applyMoveNotation('2L').layer_set).toEqual([2]);
    expect(session.applyMoveNotation('2-3R').layer_set).toEqual([2, 3]);
    expect(session.applyMoveNotation('3R').layer_set).toEqual([2]);
    const canonical = session.eventLog.find((e) => e.type === 'move' && e.move === "2L'");
    expect(canonical?.layer_set).toEqual([2]);
  });

  it('归并事件与返回值同源', () => {
    const { session } = makeSession({ size: 4 });
    session.start();
    const ret = session.applyIntent('R', [1, 2], 1, false, 'keyboard');
    session.applyIntent('R', [1, 2], 1, true, 'keyboard');
    const merged = session.eventLog.find((e) => e.type === 'move')!;
    expect(merged.layer_set).toEqual([1, 2]);
    expect(merged.layer_set).toEqual(ret.layer_set);
    expect(merged.input_channel).toBe('keyboard');
    expect(merged.raw_input).toBeNull();
  });
});

describe('PRD §13 持久化字段（input_channel / raw_input / gen_version / engine_version / 两口径）', () => {
  it('applyMove 记 api、按钮记 button、键盘记 keyboard，raw_input 保留原文', () => {
    const { session } = makeSession();
    session.start();
    session.applyMoveNotation('  R  ');
    const apiMove = session.eventLog.at(-1)!;
    expect(apiMove.input_channel).toBe('api');
    expect(apiMove.raw_input).toBe('R');
    session.applyIntent('U', [1], 1, false);
    expect(session.eventLog.at(-1)!.input_channel).toBe('button');
    session.applyIntent('F', [1], 1, false, 'keyboard');
    expect(session.eventLog.at(-1)!.input_channel).toBe('keyboard');
  });

  it('结果记录含 engine_version / gen_version / htm_layer_count / qtm_count', () => {
    const { session } = makeSession();
    session.start();
    session.applyMoveNotation('R');
    session.applyMoveNotation('R2');
    session.abandon();
    const result = session.getChallengeResult();
    expect(result.engine_version).toBe('ob-cube 0.1.0');
    expect(result.rules.gen_version).toBe('g1');
    expect(result.htm_layer_count).toBe(2);
    expect(result.qtm_count).toBe(3); // R 90° = 1 + R2 180° = 2
  });

  it('超时结局也带未归位贴纸数（结果页不再显示 —）', () => {
    const { session, time } = makeSession({ timeLimitMs: 1000 });
    session.start();
    session.applyMoveNotation('R');
    time.advance(1000);
    session.tick();
    expect(session.status).toBe('ended_timeout');
    expect(session.lastSubmitResult?.mismatch?.sticker_count_wrong).toBeGreaterThan(0);
  });
});

describe('AC-67 ViewEvent 字段', () => {
  it('stepView 记录 axis / direction / steps；rotateView 三键存在且方向为空', () => {
    const { session } = makeSession();
    session.start();
    session.stepView('left');
    const step = session.eventLog.at(-1)!;
    expect(step.type).toBe('view');
    expect(step.axis).toBe('y'); // 默认 U/F 视角左移绕 U 轴
    expect(step.direction).toBe('left');
    expect(step.steps).toBe(1);

    session.rotateView({ up: 'U', front: 'R' });
    const absolute = session.eventLog.at(-1)!;
    expect(absolute.type).toBe('view');
    expect(absolute.direction).toBeNull();
    expect(absolute.steps).toBeNull();
  });
});

describe('op_id 结果缓存', () => {
  it('getActionResult 按 id 取回，未知 id 返回 null', () => {
    const { session } = makeSession();
    session.start();
    session.applyMoveNotation('R', 'op-1');
    expect(session.getActionResult('op-1')).toMatchObject({ move: 'R', op_id: 'op-1' });
    expect(session.getActionResult('op-unknown')).toBeNull();
  });
});
