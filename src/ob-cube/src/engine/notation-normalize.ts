/**
 * 归一化与描述（ARCHITECTURE §5.2 + PRD §5.7）。
 *
 * 规范命名由 notation.ts 的 `canonicalNotation` 唯一承担（就近命名、3 阶 M/E/S 族、
 * `Rw` 短形式、区间 `2-3R` 无 w）。本函数只做参数校验，然后委托——保证
 * `describeMove` 输出与 `parseMove().normalized` 逐字相同（AC-71 往返恒等）。
 */
import { CubeError } from '../contracts';
import type { CubeSize, FaceId, MoveAmount } from '../contracts';
import { canonicalNotation } from './notation';
import { isFaceId } from './geometry';

/** 逆操作：`2` 自逆，`'` 去掉，其余加 `'`。 */
export function invertNotation(notation: string): string {
  if (notation.endsWith('2')) return notation;
  if (notation.endsWith("'")) return notation.slice(0, -1);
  return `${notation}'`;
}

export interface DescribeRequest {
  readonly size: CubeSize;
  readonly face: FaceId;
  /** 记法层号（1-based，从被命名面算起），必须连续且不含全层 */
  readonly layers: readonly number[];
  readonly amount: MoveAmount;
}

/**
 * (面, 连续层区间, 转向) → 归一化记法。
 * 供 AC-40 的三元组枚举与 UI 按钮矩阵使用：任何非全层的连续区间都能描述出来。
 */
export function describeMove(request: DescribeRequest): string {
  const { size, face, layers, amount } = request;
  if (!isFaceId(face)) {
    throw new CubeError('E_NOTATION_MALFORMED', `未知面字母「${String(face)}」`, '面字母只有 U R F D L B');
  }
  if (layers.length === 0) {
    throw new CubeError('E_MOVE_LAYER_OUT_OF_RANGE', '层区间为空', '至少指定一层');
  }
  const sorted = [...layers].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i] < 1 || sorted[i] > size) {
      throw new CubeError(
        'E_MOVE_LAYER_OUT_OF_RANGE',
        `层号 ${sorted[i]} 超出 1..${size}`,
        `layer_indices 只能是 1..${size}`,
      );
    }
    if (i > 0 && sorted[i] !== sorted[i - 1] + 1) {
      throw new CubeError(
        'E_MOVE_LAYER_OUT_OF_RANGE',
        '层区间必须连续：记法只能序列化连续区间',
        '把不连续的层拆成多次 apply_move（例如 2R 再 4R）',
      );
    }
  }
  if (sorted.length >= size) {
    throw new CubeError(
      'E_MOVE_COVERS_ALL_LAYERS',
      `该转动覆盖全部 ${size} 层，属于整体旋转`,
      '用 rotate_view 改观察方向；层转动至少留一层不动',
    );
  }

  return canonicalNotation(size, face, sorted, amount);
}
