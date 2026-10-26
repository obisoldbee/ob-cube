/**
 * clock.ts —— 全项目唯一允许读取计时的地方（SPEC §4 铁律）。
 *
 * 可注入时钟：测试用假时钟，运行时用 performance.now。
 * 暂停会冻结计时（v1.9 真暂停，PRD §7.2.1）：elapsed 的扣除逻辑在 session 层，
 * 时钟本身只负责单调读数。
 */

export type Clock = () => number;

export const systemClock: Clock = () =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

/** 手动推进的假时钟，供单元测试与动画采样使用。 */
export function createFakeClock(start = 0): { now: Clock; advance(ms: number): void; set(ms: number): void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
    set: (ms) => {
      current = ms;
    },
  };
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const seconds = Math.floor(total / 1000);
  const millis = total % 1000;
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}.${String(Math.floor(millis / 10)).padStart(2, '0')}`;
}
