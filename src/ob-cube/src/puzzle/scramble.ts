/**
 * 打乱生成：从已还原状态执行 L 次随机**合法转动**（ARCHITECTURE §6.5）。
 *
 * 这不是「随机状态生成」：分布不均匀，状态与已还原状态的距离上界是 L。
 * `generation.uniform_random_state` 因此恒为 false，UI 文案必须写「随机操作打乱（L 步）」。
 *
 * 冗余过滤 `no-same-axis`：禁止相邻两步同面、禁止相邻两步共轴。
 * 不加过滤会产生大量 `R R'`、`U D U` 这类可消去片段，实际有效长度远小于名义 L。
 * 该策略影响序列与分布，因此它进题目指纹（§6.3）。
 */
import type { CubeSize } from '../contracts';
import { CubeError } from '../contracts';
import { canonicalEntries } from '../engine';
import type { MoveSpec } from '../engine';
import { mulberry32, pick, streamSeed } from './prng';

export const FILTER_POLICY = 'no-same-axis';

/** 默认打乱长度：3 阶 God's number 为 20；4 阶解长度量级更大，用 30。 */
export const DEFAULT_SCRAMBLE_LENGTH: Readonly<Record<CubeSize, number>> = { 2: 11, 3: 20, 4: 30 };

interface Candidate {
  readonly notation: string;
  readonly axis: MoveSpec['axis'];
  readonly pivot: string | null;
}

const candidateCache = new Map<CubeSize, readonly Candidate[]>();

function candidatesOf(size: CubeSize): readonly Candidate[] {
  const cached = candidateCache.get(size);
  if (cached) return cached;
  // 只抽规范写法（notation === normalized）：打乱序列是复现与日志的「唯一写法」来源，
  // 混入别名（2Rw/3R/2-3Rw）会让同一物理动作出现两种历史字符串。
  const list = canonicalEntries(size).map((entry) => ({
    notation: entry.notation,
    axis: entry.spec.axis,
    pivot: entry.spec.pivot,
  }));
  candidateCache.set(size, list);
  return list;
}

/**
 * 生成打乱序列。同一 (size, seed32, length) 必得同一序列。
 * 返回的是**归一化**后的单步记法数组，它是复现的唯一依据（不存状态快照）。
 */
export function generateScramble(size: CubeSize, seed32: number, length: number): string[] {
  if (!Number.isInteger(length) || length < 1) {
    throw new CubeError('E_SEED_INVALID', `打乱长度必须是正整数，收到 ${length}`, '用 1..200 的正整数');
  }
  const all = candidatesOf(size);
  const rng = mulberry32(streamSeed(seed32, size));
  const out: string[] = [];
  let previousAxis: string | null = null;
  let previousPivot: string | null = null;

  for (let i = 0; i < length; i += 1) {
    // 过滤掉「与上一步共轴」的候选：同面必然共轴，因此一条规则同时满足两条禁令
    const pool = all.filter((item) => item.axis !== previousAxis && item.pivot !== previousPivot);
    const chosen = pick(rng, pool);
    if (!chosen) {
      throw new CubeError('E_INTERNAL', '打乱候选集为空', '报告为缺陷：no-same-axis 过滤不应清空候选池');
    }
    out.push(chosen.notation);
    previousAxis = chosen.axis;
    previousPivot = chosen.pivot;
  }
  return out;
}

/** 供 UI 展示「随机操作打乱（L 步）」用，不参与判定。 */
export function scrambleLengthOf(size: CubeSize, requested?: number | null): number {
  if (requested === undefined || requested === null) return DEFAULT_SCRAMBLE_LENGTH[size];
  return requested;
}
