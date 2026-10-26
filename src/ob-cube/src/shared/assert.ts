/**
 * 最小断言工具。只用于「构造期的内部不变量」——用户输入一律走 CubeError，
 * 不用断言代替校验（断言消息是给开发者看的，不是给 Agent 看的）。
 */

export class InvariantError extends Error {
  constructor(message: string) {
    super(`invariant violated: ${message}`);
    this.name = 'InvariantError';
  }
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new InvariantError(message);
}

export function assertNever(value: never, message = 'unexpected value'): never {
  throw new InvariantError(`${message}: ${String(value)}`);
}

/** 闭区间取模，保证结果落在 [0, m)。 */
export function mod(value: number, m: number): number {
  return ((value % m) + m) % m;
}

export function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i += 1) out.push(i);
  return out;
}
