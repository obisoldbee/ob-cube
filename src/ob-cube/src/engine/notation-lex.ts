/**
 * 记法词法层（ARCHITECTURE §5.1）。只做「这串字符长什么样」，语义约束在 parse 里。
 *
 * 正则顺序刻意是「数字前缀 → 面字母 → w → 转向后缀」：
 * 把 `w` 写在面字母之前会让 `Rw` 解析失败（SPEC §11 已知坑 2）。
 *
 * 字母位放宽到 [A-Za-z]，是为了让三类输入各自拿到**不同**错误码：
 *   x/y/z（合法记法，但不在 apply_move 通道）→ E_NOTATION_ORIENTATION_NOT_MOVABLE
 *   r/l/u/…（小写面字母，非法）→ E_NOTATION_LOWERCASE
 *   X/Q（未知字母）→ E_NOTATION_MALFORMED
 * 如果正则只认大写，`r` 会被报成语法错误，Agent 就学不到「你该写大写」。
 */

export type MoveSuffix = '' | "'" | '2' | "2'";

export interface LexedMove {
  readonly kind: 'move';
  readonly prefixA: number | null;
  readonly prefixB: number | null;
  readonly letter: string;
  readonly wide: boolean;
  readonly suffix: MoveSuffix;
}

export type LexResult = LexedMove | { readonly kind: 'multiple' } | { readonly kind: 'malformed' };

const MOVE_LEX = /^(?:(\d{1,2})(?:-(\d{1,2}))?)?([A-Za-z])(w)?(2'?|')?$/;

export function lexNotation(input: unknown): LexResult {
  if (typeof input !== 'string') return { kind: 'malformed' };
  const trimmed = input.trim();
  if (trimmed.length === 0) return { kind: 'malformed' };

  // 一次只收单步：任何内部空白都意味着调用方传了序列
  if (/\s/.test(trimmed)) return { kind: 'multiple' };

  const match = MOVE_LEX.exec(trimmed);
  if (!match) return { kind: 'malformed' };

  const [, rawA, rawB, letter, wideFlag, rawSuffix] = match;
  return {
    kind: 'move',
    prefixA: rawA === undefined ? null : Number(rawA),
    prefixB: rawB === undefined ? null : Number(rawB),
    letter,
    wide: wideFlag === 'w',
    suffix: (rawSuffix ?? '') as MoveSuffix,
  };
}

/** suffix → 语义转向量（1=顺时针 2=180° 3=逆时针，从被命名面外部看）。 */
export function amountOfSuffix(suffix: MoveSuffix): 1 | 2 | 3 {
  if (suffix === '2' || suffix === "2'") return 2;
  if (suffix === "'") return 3;
  return 1;
}

/** 归一化后的后缀文本（`R2'` 与 `R2` 等价，统一写 `2`）。 */
export function suffixText(amount: 1 | 2 | 3): string {
  if (amount === 2) return '2';
  if (amount === 3) return "'";
  return '';
}
