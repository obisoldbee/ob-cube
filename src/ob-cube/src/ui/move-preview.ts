/**
 * move-preview.ts —— 「将提交」预览的适配层
 *
 * 为什么 UI 需要它：UIUX §5.4 要求状态栏在按下前就显示完整预览（`2`+`Shift`+`D` = `Rw'`），
 * 用户不必自己推。但**记法归一化规则属于引擎**（ARCHITECTURE §5.2–§5.3 / PRD §5.7：
 * UI 与日志不得自行拼接记法字符串）。
 *
 * 因此本文件只做两件事：把 TurnIntent 换算成层号集合后**直接调用引擎的
 * describeMove**（唯一真源），并为 3 阶中层补一个「另一族」括号别名
 * （§5.7 UI 规则 3：别名只允许出现在状态栏括号里，不进日志、不进 API）。
 * 不存在第二份命名规则——ss-2 起旧的 fallback 拼接实现已删除。
 */

import type { CubeSize } from '../contracts';
import type { LayerSpec, TurnIntent } from './keymap';
import { isLayerSpecLegal, layersOf } from './keymap';
import { describeMove as engineDescribeMove } from '../engine';

export interface MoveDescription {
  /** Singmaster 归一化字符串（引擎 describeMove 的返回值），如 `Rw2` / `M'` / `2-3R` */
  readonly move: string;
  readonly legal: boolean;
  /** 非法时给出人可读原因；合法时为 null */
  readonly reason: string | null;
  /** 等价记法提示（3 阶中层的 2X 族），用于状态栏括号 */
  readonly alias: string | null;
}

export type MoveDescriber = (intent: TurnIntent, size: CubeSize) => MoveDescription;

const ILLEGAL = '—';

/** 3 阶中层规范形式（M/E/S 族）→ 另一族（2X 族）的别名表（PRD §5.3.3） */
const MIDDLE_ALIAS_OF_CANONICAL: Readonly<Record<string, string>> = {
  M: '2L',
  "M'": '2R',
  M2: '2L2',
  E: '2D',
  "E'": '2U',
  E2: '2D2',
  S: '2F',
  "S'": '2B',
  S2: '2F2',
};

function aliasOf(move: string): string | null {
  return MIDDLE_ALIAS_OF_CANONICAL[move] ?? null;
}

/** 3 阶中层的人类可读提示（M/E/S 各自对应哪两个面之间） */
export const MIDDLE_HINT: Readonly<Record<string, string>> = {
  M: 'R 与 L 之间',
  E: 'U 与 D 之间',
  S: 'F 与 B 之间',
};

const ILLEGAL_REASON: Readonly<Record<string, string>> = {
  allLayers: '转动覆盖全部层，请改用视角旋转',
  nonContiguous: '记法只能表达连续层区间',
  outOfRange: '该阶数没有这一层',
};

export function describeLayerReason(spec: LayerSpec, size: CubeSize): string | null {
  const layers = layersOf(spec, size);
  if (layers.length >= size) return ILLEGAL_REASON.allLayers;
  if (layers.some((l) => l < 1 || l > size)) return ILLEGAL_REASON.outOfRange;
  for (let i = 1; i < layers.length; i += 1) {
    if (layers[i] !== layers[i - 1] + 1) return ILLEGAL_REASON.nonContiguous;
  }
  return null;
}

export function describeMove(intent: TurnIntent, size: CubeSize): MoveDescription {
  if (!isLayerSpecLegal(intent.layers, size)) {
    const reason = describeLayerReason(intent.layers, size) ?? '当前阶数不支持该层组合';
    return { move: ILLEGAL, legal: false, reason, alias: null };
  }
  const layers = layersOf(intent.layers, size);
  // 唯一真源：直接走引擎 describeMove，预览与日志/API 的 move 字段逐字相同
  const move = engineDescribeMove({ size, face: intent.face, layers, amount: intent.amount });
  return { move, legal: true, reason: null, alias: aliasOf(move) };
}
