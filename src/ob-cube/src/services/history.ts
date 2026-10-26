/**
 * history.ts —— 运行记录仓储（SPEC §7 / PRD §9.3）
 *
 * 存储布局：`run-index` 存 id 列表，每条记录独立存 `run:<id>`。
 * 这样单条记录损坏只影响它自己，UI 可以「删除该记录 / 导出原始数据」，
 * 而不是整份历史一起报废。
 *
 * 写入纪律（SPEC §7）：单次写入失败不得影响已存的记录；配额满时抛
 * `E_STORAGE_FULL`，由 UI 提示清理历史，**不得静默丢弃**。
 */

import type { ChallengeResult } from '../contracts';
import type { LocalStore } from './storage';

export const MAX_RECORDS = 50;

export interface RunRecord {
  readonly id: string;
  readonly savedAt: string;
  readonly result: ChallengeResult;
}

export interface CorruptRecord {
  readonly id: string;
  readonly raw: string;
  readonly reason: 'corrupt' | 'unavailable';
}

export interface HistorySnapshot {
  readonly records: readonly RunRecord[];
  readonly corrupt: readonly CorruptRecord[];
  readonly canPersist: boolean;
}

const INDEX_KEY = 'run-index';

function recordKey(id: string): string {
  return `run:${id}`;
}

function isRunRecord(value: unknown): value is RunRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.savedAt !== 'string') return false;
  const result = v.result as Record<string, unknown> | undefined;
  return typeof result === 'object' && result !== null && typeof result.status === 'string';
}

export class HistoryService {
  constructor(private readonly store: LocalStore) {}

  get canPersist(): boolean {
    return this.store.available;
  }

  private readIndex(): { ids: string[]; corrupt: CorruptRecord[] } {
    const read = this.store.readJson<unknown>(INDEX_KEY);
    if (!read.ok) {
      if (read.reason === 'corrupt') {
        return { ids: [], corrupt: [{ id: INDEX_KEY, raw: read.raw ?? '', reason: 'corrupt' }] };
      }
      if (read.reason === 'unavailable') {
        return { ids: [], corrupt: [{ id: INDEX_KEY, raw: '', reason: 'unavailable' }] };
      }
      return { ids: [], corrupt: [] };
    }
    const value = read.value as { ids?: unknown } | null;
    const ids = Array.isArray(value?.ids) ? value.ids.filter((v): v is string => typeof v === 'string') : [];
    return { ids, corrupt: [] };
  }

  private writeIndex(ids: readonly string[]): void {
    this.store.writeJson(INDEX_KEY, { ids: [...ids] });
  }

  list(): HistorySnapshot {
    const { ids, corrupt } = this.readIndex();
    const records: RunRecord[] = [];
    const broken: CorruptRecord[] = [...corrupt];
    for (const id of ids) {
      const read = this.store.readJson<unknown>(recordKey(id));
      if (!read.ok) {
        if (read.reason !== 'missing') {
          broken.push({ id, raw: read.raw ?? '', reason: read.reason });
        }
        continue;
      }
      if (!isRunRecord(read.value)) {
        broken.push({ id, raw: JSON.stringify(read.value), reason: 'corrupt' });
        continue;
      }
      records.push(read.value);
    }
    records.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
    return { records, corrupt: broken, canPersist: this.canPersist };
  }

  /** 保存一条记录。先落记录体，再更新索引——索引失败不会留下悬空 id。 */
  save(result: ChallengeResult, now = new Date()): RunRecord {
    const record: RunRecord = {
      id: result.rules.run_id,
      savedAt: now.toISOString(),
      result,
    };
    this.store.writeJson(recordKey(record.id), record);

    const { ids } = this.readIndex();
    const next = [record.id, ...ids.filter((id) => id !== record.id)].slice(0, MAX_RECORDS);
    this.writeIndex(next);

    for (const dropped of ids.filter((id) => !next.includes(id))) {
      this.store.remove(recordKey(dropped));
    }
    return record;
  }

  remove(id: string): void {
    const { ids } = this.readIndex();
    this.writeIndex(ids.filter((existing) => existing !== id));
    this.store.remove(recordKey(id));
  }

  /** 损坏记录的原始串，供「导出原始数据」使用 */
  raw(id: string): string | null {
    const read = this.store.read(id.startsWith('run:') ? id : recordKey(id));
    return read.ok ? read.value : null;
  }
}

/** 「同题同规则」的判定口径：只比这几项，缺一项就不是可比的成绩 */
export interface ComparableRules {
  readonly challenge_id: string;
  readonly cube_size: number;
  readonly observation_mode: string;
  readonly dust_mode: boolean;
  readonly time_limit_ms: number | null;
  readonly move_limit: number | null;
}

/**
 * 同题同规则的成功耗时中位数（F13 / R12）。
 *
 * 三条过滤缺一不可：
 *  1. 只算**成功**运行——放弃、超时、步数耗尽的耗时不是"这道题要多久"；
 *  2. 只算**同规则**运行——观察档 / 蒙尘 / 时限 / 步限任一不同就不可比；
 *  3. 用 `solved_at_ms`（还原时刻）而不是 `elapsed_ms`（含等待提交的时间）——
 *     后者把"点了提交按钮前发呆"算进解题速度。
 * 旧实现只筛同题 ID 与正数耗时，三类污染记录都会进中位数。
 */
export function medianSolvedElapsed(
  records: readonly RunRecord[],
  rules: ComparableRules,
  excludeRunId?: string,
): number | null {
  const values = records
    .filter((record) => record.id !== excludeRunId)
    .filter((record) => record.result.solved && record.result.status === 'ended_solved')
    .filter((record) => {
      const other = record.result.rules;
      return (
        other.challenge_id === rules.challenge_id &&
        other.cube_size === rules.cube_size &&
        other.observation_mode === rules.observation_mode &&
        other.dust_mode === rules.dust_mode &&
        other.time_limit_ms === rules.time_limit_ms &&
        other.move_limit === rules.move_limit
      );
    })
    .map((record) => record.result.solved_at_ms ?? record.result.elapsed_ms)
    .filter((ms) => Number.isFinite(ms) && ms > 0)
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 1 ? values[mid]! : Math.round((values[mid - 1]! + values[mid]!) / 2);
}
