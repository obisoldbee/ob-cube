/**
 * status-meta.ts —— 挑战状态的中文文案与徽章色调（唯一映射点）
 * 文案必须具体：禁止「暂无数据」「— 类空洞占位」出现在状态位。
 */

import type { ChallengeStatus } from '../../contracts';

export type BadgeTone = 'pending' | 'running' | 'paused' | 'failed' | 'solved';

export interface StatusMeta {
  readonly label: string;
  readonly tone: BadgeTone;
  /** 结束后用于结果面板结论区的短判定 */
  readonly verdict: string;
}

export const STATUS_META: Readonly<Record<ChallengeStatus, StatusMeta>> = {
  idle: { label: '未创建', tone: 'pending', verdict: '未开始' },
  ready: { label: '待开始', tone: 'pending', verdict: '未开始' },
  running: { label: '进行中', tone: 'running', verdict: '进行中' },
  paused: { label: '已暂停', tone: 'paused', verdict: '已暂停' },
  solved_pending: { label: '可提交', tone: 'solved', verdict: '可提交' },
  ended_solved: { label: '已还原', tone: 'solved', verdict: '已还原' },
  ended_timeout: { label: '超时', tone: 'failed', verdict: '超时' },
  ended_move_limit: { label: '步数耗尽', tone: 'failed', verdict: '步数耗尽' },
  ended_abandoned: { label: '已放弃', tone: 'failed', verdict: '已放弃' },
  ended_invalid: { label: '提交无效', tone: 'failed', verdict: '提交无效' },
  ended_interrupted: { label: '未完成', tone: 'pending', verdict: '未完成' },
};
