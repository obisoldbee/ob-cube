// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createPuzzle, estimateDifficulty, estimatePuzzleDifficulty } from '../../src/puzzle';
import type { DifficultyInput } from '../../src/puzzle';

function input(patch: Partial<DifficultyInput> = {}): DifficultyInput {
  const record = createPuzzle({ size: 3, seed: 'difficulty-seed', createdAt: '2026-10-26T00:00:00Z' });
  return {
    scramble: record.scramble,
    size: 3,
    observationMode: 'full',
    dustMode: false,
    timeLimitMs: null,
    ...patch,
  };
}

describe('F17 难度启发式估计（PRD §6.2）', () => {
  it('输出四项维度合成的分数与主等级，且明确标注为估计', () => {
    const estimate = estimateDifficulty(input());
    expect(estimate.score).toBeGreaterThan(2.5); // 至少 S
    expect(['入门', '常规', '高难度']).toContain(estimate.level);
    expect(estimate.distanceIsEstimated).toBe(true);
    expect(estimate.estimatedDistance).toBeGreaterThanOrEqual(0);
  });

  it('文档示例与公式实算一致（OD-01 算例勘误的可执行版本）', () => {
    // PRD §6.3 的三个典型算例：O=0、C=0、pW=0，分数只由 S + 0.8·dF + 0.5·(nE/10) 决定。
    // 2 阶 4 步 2 面 → 1.0 + 1.6 + 0.2 = 2.8（入门）
    const intro = estimateDifficulty(input({ size: 2, scramble: ['R', 'U', "R'", "U'"] }));
    expect(intro.score).toBeCloseTo(2.8, 2);
    expect(intro.level).toBe('入门');

    // 3 阶 6 步 3 面 → 2.5 + 2.4 + 0.3 = 5.2（常规）
    const standard = estimateDifficulty(input({ scramble: ['R', 'U', 'F', "R'", "U'", "F'"] }));
    expect(standard.score).toBeCloseTo(5.2, 2);
    expect(standard.level).toBe('常规');

    // 3 阶 20 步 6 面 → 2.5 + 4.8 + 1.0 = 8.3（高难度）——原文曾把它当"常规"
    const hard = estimateDifficulty(
      input({ scramble: [...['R', 'U', 'F', 'L', 'D', 'B'], ...['R', 'U', 'F', 'L', 'D', 'B'], ...['R', 'U', 'F', 'L', 'D', 'B'], 'R', 'U'] }),
    );
    expect(hard.score).toBeCloseTo(8.3, 2);
    expect(hard.level).toBe('高难度');
  });

  it('观察模式按五档互斥查表计入 O（完整 0 / 三面 1 / 操作后 1.5 / 单面 2 / 受限 2.5）', () => {
    const base = estimateDifficulty(input({ observationMode: 'full' })).score;
    expect(estimateDifficulty(input({ observationMode: 'three_faces' })).score - base).toBeCloseTo(1.0, 2);
    expect(estimateDifficulty(input({ observationMode: 'after_move' })).score - base).toBeCloseTo(1.5, 2);
    expect(estimateDifficulty(input({ observationMode: 'single_face' })).score - base).toBeCloseTo(2.0, 2);
    expect(estimateDifficulty(input({ observationMode: 'restricted' })).score - base).toBeCloseTo(2.5, 2);
  });

  it('蒙尘 +1.5，限时产生正的时间压力且不超过 2.0', () => {
    const base = estimateDifficulty(input());
    const dust = estimateDifficulty(input({ dustMode: true }));
    expect(dust.score - base.score).toBeCloseTo(1.5, 2);
    expect(dust.tags).toContain('蒙尘');

    const tight = estimateDifficulty(input({ timeLimitMs: 10_000 }));
    const loose = estimateDifficulty(input({ timeLimitMs: 600_000 }));
    expect(tight.score).toBeGreaterThan(loose.score);
    expect(tight.score - base.score).toBeLessThanOrEqual(2.0);
  });

  it('专项观察标签在 O ≥ 1.0 时出现，完整观察不出现', () => {
    expect(estimateDifficulty(input({ observationMode: 'full' })).tags).not.toContain('专项观察');
    expect(estimateDifficulty(input({ observationMode: 'single_face' })).tags).toContain('专项观察');
  });

  it('estimatePuzzleDifficulty 与直接调用结果一致（同一题面同一配置）', () => {
    const record = createPuzzle({ size: 4, seed: 'difficulty-seed-4', createdAt: '2026-10-26T00:00:00Z' });
    const direct = estimateDifficulty({
      scramble: record.scramble,
      size: 4,
      observationMode: 'three_faces',
      dustMode: true,
      timeLimitMs: 300_000,
    });
    const viaRecord = estimatePuzzleDifficulty(record, {
      observationMode: 'three_faces',
      dustMode: true,
      timeLimitMs: 300_000,
    });
    expect(viaRecord).toEqual(direct);
  });
});
