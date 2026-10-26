/**
 * seed 的接受格式与规范化（ARCHITECTURE §6.2）。
 *
 * 题目记录里永远同时保存 seed32（8 位十六进制）与原始 seed 文本：
 * 只存文本的话，未来哈希算法一改就全部失效；只存 seed32 的话，用户看不到自己当初填了什么。
 */
import { CubeError } from '../contracts';
import { fnv1a32, hex8 } from '../shared';

export const SEED_MIN_LENGTH = 1;
export const SEED_MAX_LENGTH = 128;
export const SEED_U32_MAX = 4294967295;

export interface NormalizedSeed {
  readonly seed32: number;
  /** 用户原始输入（数字输入为 null） */
  readonly text: string | null;
  readonly hex: string;
}

export function normalizeSeed(input: number | string): NormalizedSeed {
  if (typeof input === 'number') {
    if (!Number.isSafeInteger(input) || input < 0 || input > SEED_U32_MAX) {
      throw new CubeError(
        'E_SEED_OUT_OF_RANGE',
        `数值 seed 必须是 0..${SEED_U32_MAX} 之间的安全整数`,
        '用 0..4294967295 的整数，或改传字符串 seed',
      );
    }
    const seed32 = input >>> 0;
    return { seed32, text: null, hex: hex8(seed32) };
  }

  if (typeof input !== 'string') {
    throw new CubeError('E_SEED_INVALID', 'seed 必须是数字或字符串', '传 1..128 字符的字符串，或 32 位无符号整数');
  }

  const text = input.trim();
  if (text.length < SEED_MIN_LENGTH || text.length > SEED_MAX_LENGTH) {
    throw new CubeError(
      'E_SEED_INVALID',
      `seed 文本长度必须在 ${SEED_MIN_LENGTH}..${SEED_MAX_LENGTH} 之间（去掉首尾空白后为 ${text.length}）`,
      '用 1..128 个字符的文本 seed',
    );
  }
  const seed32 = fnv1a32(text);
  return { seed32, text, hex: hex8(seed32) };
}
