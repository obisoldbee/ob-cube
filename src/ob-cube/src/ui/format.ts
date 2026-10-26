/**
 * format.ts —— 数值格式化（所有数值型 UI 都必须走这里，保证 tabular-nums 前提成立）
 */

export const EM_DASH = '—';

export interface ClockParts {
  /** `1:42` 或 `00:07` —— 整数位，大字号 */
  readonly int: string;
  /** `37` —— 小数位，小一号 + 降一级灰 */
  readonly frac: string;
}

export function clockParts(ms: number | null): ClockParts {
  if (ms === null) return { int: '--:--', frac: '' };
  const safe = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centis = Math.floor((safe % 1000) / 10);
  const int = minutes >= 10 ? `${minutes}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
  return { int, frac: pad(centis) };
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function formatElapsed(ms: number | null): string {
  if (ms === null) return EM_DASH;
  const { int, frac } = clockParts(ms);
  return `${int}.${frac}`;
}

export function formatTps(moves: number, elapsedMs: number | null): string {
  if (elapsedMs === null || elapsedMs <= 0) return EM_DASH;
  return (moves / (elapsedMs / 1000)).toFixed(2);
}

export function formatMs(ms: number | null): string {
  if (ms === null) return EM_DASH;
  return `${Math.round(ms)}ms`;
}

export function formatClockTime(iso: string | null): string {
  if (!iso) return EM_DASH;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatMoveCount(moves: number, limit: number | null): string {
  return limit === null ? String(moves) : `${moves} / ${limit}`;
}

/** 大数字（≥1000）折叠为 `1.2k`，只用于历史计数这类非关键读数 */
export function compactNumber(value: number): string {
  if (value < 1000) return String(value);
  return `${(value / 1000).toFixed(1)}k`;
}

export function formatSize(size: number): string {
  return `${size}×${size}`;
}

/** 计时器视觉档位（UIUX §7.1） */
export type TimerTone = 'idle' | 'running' | 'warning' | 'critical' | 'paused' | 'timeout';

export function timerTone(input: {
  status: string;
  remainingMs: number | null;
  hasLimit: boolean;
}): TimerTone {
  if (input.status === 'ended_timeout') return 'timeout';
  if (input.status === 'paused') return 'paused';
  if (input.status === 'idle' || input.status === 'ready') return 'idle';
  if (!input.hasLimit || input.remainingMs === null) return 'running';
  if (input.remainingMs <= 10_000) return 'critical';
  if (input.remainingMs <= 60_000) return 'warning';
  return 'running';
}
