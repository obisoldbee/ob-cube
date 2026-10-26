/**
 * 内部使用的 Result。用于「预期内失败」的返回值，避免在纯逻辑层抛异常。
 *
 * 注意：Agent 契约层不直接暴露 Result，它有自己的 ApiResult（见 src/agent/api-result.ts），
 * 两者形状不同是刻意的——内部用 camelCase，对外一律 snake_case。
 */

export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is { readonly ok: true; readonly value: T } {
  return result.ok;
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/** 把可能抛错的计算收进 Result。仅用于纯逻辑层的 dry-run 入口。 */
export function attempt<T>(fn: () => T): Result<T, unknown> {
  try {
    return ok(fn());
  } catch (error) {
    return err(error);
  }
}
