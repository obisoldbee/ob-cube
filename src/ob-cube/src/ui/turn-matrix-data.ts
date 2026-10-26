/**
 * turn-matrix-data.ts —— 转动矩阵的纯数据构建（零 DOM，可单测）
 *
 * tab 家族共 5 个（单层 / 中层 / 宽转 / 内层 / 自由层），按阶数实例化为 2 / 3 / 5 组：
 *   2 阶：单层(18) + 自由层(6)
 *   3 阶：单层(18) + 中层(9)  + 宽转(18)
 *   4 阶：单层(18) + 宽转2层(18) + 宽转3层(18) + 内层(10) + 自由层(8)
 * 峰值同屏控件数 19（18 + 1 选择器），与 PRD §5.6 的峰值核算一致。
 *
 * 决策（文档未写死）：4 阶把「宽转」拆成 2 层 / 3 层两个 tab 实例，而不是放一个
 * 层数选择器——这样每个 tab 的按钮标签是确定的，用户不必「先选层数再看标签」，
 * 同时保住「5 组」而不增加同屏控件。
 */

import type { CubeSize, FaceId } from '../contracts';
import type { KbdSpec, LayerSpec, TurnIntent } from './keymap';
import { FACE_KEY_OF, FACE_ZH, HIDDEN_FACES, oppositeFace, VISIBLE_FACES } from './keymap';

export type TabId = 'single' | 'middle' | 'wide2' | 'wide3' | 'inner' | 'free';

export interface TabDef {
  readonly id: TabId;
  readonly label: string;
  /** 该 tab 的同屏控件数（含选择器），保证 ≤19 */
  readonly controlCount: number;
}

export const TABS_BY_SIZE: Readonly<Record<CubeSize, readonly TabDef[]>> = {
  2: [
    { id: 'single', label: '单层', controlCount: 18 },
    { id: 'free', label: '自由层', controlCount: 6 },
  ],
  3: [
    { id: 'single', label: '单层', controlCount: 18 },
    { id: 'middle', label: '中层', controlCount: 9 },
    { id: 'wide2', label: '宽转', controlCount: 18 },
  ],
  4: [
    { id: 'single', label: '单层', controlCount: 18 },
    { id: 'wide2', label: '宽转 2', controlCount: 18 },
    { id: 'wide3', label: '宽转 3', controlCount: 18 },
    { id: 'inner', label: '内层', controlCount: 10 },
    { id: 'free', label: '自由层', controlCount: 8 },
  ],
};

export function tabsFor(size: CubeSize): readonly TabDef[] {
  return TABS_BY_SIZE[size];
}

/** v1.9：tab 说明弹层的文案（纯数据，可单测）。用户反馈"不知道单层/宽转区别在哪"。 */
export const TAB_HELP: Readonly<Record<TabId, readonly string[]>> = {
  single: [
    '单层：只转该面最外面的 1 层。记法 R = 右面外层顺时针 90°。',
    '同一面的三个按钮 R / R\' / R2 分别是顺 90°、逆 90°、180°。',
  ],
  middle: [
    '中层（仅 3 阶）：转正中间那一层，不含任何外层。',
    'M = 左右之间的竖中层（方向同 L），E = 上下之间的赤道层（方向同 D），S = 前后之间的站立层（方向同 F）。',
  ],
  wide2: [
    '宽转：从该面起连续转 2 层（外层 + 紧邻的内层）。记法 Rw，也常写作 2Rw。',
    '与"单层"的区别：单层只动 1 层，宽转外层带着里层一起动。',
  ],
  wide3: [
    '宽转 3（仅 4 阶）：从该面起连续转 3 层。记法 3Rw。',
    '4 阶共 4 层，转 3 层 = 留下对面那 1 层不动。',
  ],
  inner: [
    '内层（仅 4 阶）：只转里面的某一层，外层不动。记法 2R = 靠近 R 面的内层。',
    '层位 2 = 从当前面数第 2 层；层位 3 = 靠近对面的那层（用对面命名，如 2L）。',
  ],
  free: [
    '自由层：先选轴，再勾选任意层组合，最后选转向。',
    '能表达前几组覆盖不了的组合；但注意 4 层全选等于整体旋转，会被拦截。',
  ],
};

/** 键盘层深前缀的对照说明（弹层末尾统一展示） */
export const PREFIX_HELP: readonly { prefix: string; meaning: string; example: string }[] = [
  { prefix: '1', meaning: '只转外层（与无前缀等价）', example: '1 + D = R' },
  { prefix: '2', meaning: '宽转 2 层', example: '2 + D = Rw' },
  { prefix: '3', meaning: '宽转 3 层（仅 4 阶）', example: '3 + D = 3Rw' },
  { prefix: 'Z', meaning: '内层：Z + 本侧面键近本侧；Z + 对面面键近对面（仅 3/4 阶）', example: 'Z + D = 2R；Z + A = 2L' },
];

export function defaultTabFor(_size: CubeSize): TabId {
  return 'single';
}

/** 阶数切换后，原 tab 可能不存在（如 4 阶的「内层」切到 3 阶），回落到第一组 */
export function normalizeTab(tab: TabId, size: CubeSize): TabId {
  const allowed = tabsFor(size);
  return allowed.some((t) => t.id === tab) ? tab : allowed[0].id;
}

export interface TurnButtonDef {
  readonly id: string;
  /** Singmaster 标签（按钮唯一可见文本，零箭头零 emoji） */
  readonly label: string;
  readonly aria: string;
  readonly intent: TurnIntent;
  /** 角标：180° 不挂角标（PRD §5.6 建议），故可为 null */
  readonly kbd: KbdSpec | null;
}

export interface FaceGroupDef {
  readonly id: string;
  readonly label: string;
  readonly zh: string;
  readonly buttons: readonly TurnButtonDef[];
}

export interface MatrixSpec {
  readonly tab: TabId;
  readonly layout: 'L3' | 'L2' | 'L1';
  readonly groups: readonly FaceGroupDef[];
}

const AMOUNT_TEXT: Readonly<Record<1 | 2 | 3, string>> = {
  1: '顺时针 90°',
  2: '180°',
  3: '逆时针 90°',
};

function kbdFor(face: FaceId, amount: 1 | 2 | 3, prefix: KbdSpec['prefix']): KbdSpec | null {
  if (amount === 2) return null;
  return { prefix, shift: amount === 3, key: FACE_KEY_OF[face], repeat: false };
}

interface GroupInput {
  id: string;
  base: string;
  zh: string;
  face: FaceId;
  layers: LayerSpec;
  prefix: KbdSpec['prefix'];
}

function buildGroup(input: GroupInput): FaceGroupDef {
  const buttons: TurnButtonDef[] = ([1, 2, 3] as const).map((amount) => ({
    id: `${input.id}-${amount}`,
    label: `${input.base}${amount === 1 ? '' : amount === 2 ? '2' : "'"}`,
    aria: `${input.zh}${AMOUNT_TEXT[amount]}${input.prefix ? `，层深前缀 ${input.prefix}` : ''}`,
    intent: { face: input.face, layers: input.layers, amount, source: 'button' as const },
    kbd: kbdFor(input.face, amount, input.prefix),
  }));
  return { id: input.id, label: `${input.base}`, zh: input.zh, buttons };
}

/** 6 面 × 3 变体：前 3 组 = 默认视角可见（U/R/F），后 3 组 = 不可见（D/L/B） */
function sixFaces(
  layers: LayerSpec,
  suffix: string,
  prefix: KbdSpec['prefix'],
  prefixLayerNo = '',
): FaceGroupDef[] {
  return [...VISIBLE_FACES, ...HIDDEN_FACES].map((face) =>
    buildGroup({
      id: `${prefix ?? 'outer'}-${face}`,
      base: `${prefixLayerNo}${face}${suffix}`,
      zh: FACE_ZH[face],
      face,
      layers,
      prefix,
    }),
  );
}

function middleGroups(): FaceGroupDef[] {
  // M 方向同 L、E 方向同 D、S 方向同 F（PRD §5.3.3）
  const defs: { base: string; zh: string; face: FaceId }[] = [
    { base: 'M', zh: '中层（R 与 L 之间，方向同 L）', face: 'L' },
    { base: 'E', zh: '赤道层（U 与 D 之间，方向同 D）', face: 'D' },
    { base: 'S', zh: '站立层（F 与 B 之间，方向同 F）', face: 'F' },
  ];
  return defs.map((d) =>
    buildGroup({ id: `mid-${d.base}`, base: d.base, zh: d.zh, face: d.face, layers: { kind: 'inner', near: true }, prefix: 'Z' }),
  );
}

/**
 * 内层：3 条轴（R/U/F）。层位 2 = 靠近命名面（`2R`），层位 3 = 靠近对面（`2L`）。
 * 命名按「用更近的外层命名」这一唯一规则（PRD §5.3.2），因此 4 阶 R 轴第 3 层写作
 * `2L` 而不是 `3R`——按钮标签必须与实际提交的记法一字不差。
 */
function innerGroups(position: 2 | 3): FaceGroupDef[] {
  const axes: FaceId[] = ['R', 'U', 'F'];
  return axes.map((face) => {
    const near = position === 2;
    const named = near ? face : oppositeFace(face);
    return buildGroup({
      id: `inner${position}-${face}`,
      base: `2${named}`,
      zh: `第 ${position} 层（从 ${face} 数起）`,
      // AC-34 / UIUX 附E#2：两个内层都从「命名面」一侧表达——按钮标签 2L 与
      // 提交记法 2L 同源，键盘角标是 Z + 对面面键（Z+A），不存在 C 前缀。
      face: named,
      layers: { kind: 'inner', near: true },
      prefix: 'Z',
    });
  });
}

export function buildMatrixSpec(tab: TabId, size: CubeSize, innerPosition: 2 | 3 = 2): MatrixSpec {
  const resolved = normalizeTab(tab, size);
  switch (resolved) {
    case 'single':
      return { tab: resolved, layout: 'L3', groups: sixFaces({ kind: 'outer' }, '', null) };
    case 'wide2':
      return { tab: resolved, layout: 'L3', groups: sixFaces({ kind: 'wide', depth: 2 }, 'w', '2') };
    case 'wide3':
      return { tab: resolved, layout: 'L3', groups: sixFaces({ kind: 'wide', depth: 3 }, 'w', '3', '3') };
    case 'middle':
      return { tab: resolved, layout: 'L3', groups: middleGroups() };
    case 'inner':
      return { tab: resolved, layout: 'L3', groups: innerGroups(innerPosition) };
    case 'free':
      return { tab: resolved, layout: 'L1', groups: [] };
  }
}

// ---------------------------------------------------------------------------
// 自由层（PRD §5.3.2 保障 3 的鼠标完备性兜底，UIUX §4.5E）
// ---------------------------------------------------------------------------

export const FREE_AXES: readonly FaceId[] = ['R', 'U', 'F'];

/**
 * 自由层非法组合前置拦截（UIUX §4.5E 明确要求，不能只靠引擎报错）：
 * 勾满全层时最后一个槽不可勾，转向键 aria-disabled，预览显示 `—`。
 */
export function canSelectLayer(size: CubeSize, selected: readonly number[], layer: number): boolean {
  if (selected.includes(layer)) return true; // 取消勾选永远允许
  return selected.length < size - 1; // 最多选 size-1 层，避免覆盖全层
}

export function freeLayerSpec(size: CubeSize, selected: readonly number[]): LayerSpec {
  const clamped = selected.filter((l) => l >= 1 && l <= size).sort((a, b) => a - b);
  if (clamped.length === 0) return { kind: 'set', layers: [] };
  return { kind: 'set', layers: clamped };
}

export function freePrefixOf(_size: CubeSize, selected: readonly number[]): KbdSpec['prefix'] {
  const sorted = [...selected].sort((a, b) => a - b);
  if (sorted.length === 1) {
    if (sorted[0] === 1) return null;
    return 'Z';
  }
  if (sorted.length === 2 && sorted[0] === 1) return '2';
  if (sorted.length === 3 && sorted[0] === 1) return '3';
  return null;
}
