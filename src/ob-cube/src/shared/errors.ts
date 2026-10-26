/**
 * errors.ts —— 错误构造集中点。
 *
 * 历史：这里曾为 `E_PAUSED` / `E_RATE_LIMITED` 两个码做「契约外窄化断言」桥接
 * （contracts.ts 的 ERROR_CODES 当时尚未收录）。两个码现已全部进入冻结契约：
 *   - `E_CHALLENGE_PAUSED`（v1.9 真暂停：计时冻结，session 层直接构造）；
 *   - `E_RATE_LIMITED`（AC-44 限流，session.guardRate 构造）。
 * 本模块保留通用工厂 `cubeError` 与限流文案常量，供调用方保持同一句话术。
 */
import { CubeError } from '../contracts';
import type { ErrorCode } from '../contracts';

export const RATE_LIMITED_MESSAGE = '调用过于频繁，请降低频率。';

export function rateLimitedError(limit: number): CubeError {
  return new CubeError('E_RATE_LIMITED', RATE_LIMITED_MESSAGE, `单帧内 applyMove 不得超过 ${limit} 次`);
}

export function cubeError(code: ErrorCode, message: string, hint: string): CubeError {
  return new CubeError(code, message, hint);
}
