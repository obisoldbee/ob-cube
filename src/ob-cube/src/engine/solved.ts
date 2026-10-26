/**
 * 还原判定（ARCHITECTURE §3.4 / PRD §7.4）。三步，全部在 facelet 状态上完成，
 * 不需要追踪任何朝向：
 *
 *   1. 单色检查：6 个面各自 N² 个 slot 颜色全相同；
 *   2. 双射检查：6 个面的颜色恰好是 6 种颜色的一次排列；
 *   3. 手性检查：构造唯一矩阵 M 使 M·n(f) = n(该面颜色所属面)，
 *      det(M) = +1 → 真旋转 → 已还原；det(M) = -1 → 镜像配色 → 非法状态。
 *
 * 第 3 步对「由转动到达的状态」必然给出 +1，所以正常挑战流程里它不改变结论；
 * 它只在导入状态快照时生效（AC-26）。
 */
import { FACE_ORDER } from '../contracts';
import type { ColorId, FaceId } from '../contracts';
import { cross, dot, equalVec, FACE_GEOMETRY, faceIndexOf, negate } from './geometry';
import type { Vec3 } from './geometry';
import type { CubeState } from './state';

export type SolvedReason = 'uniform' | 'mixed' | 'invalid-scheme';

export interface SolvedVerdict {
  readonly solved: boolean;
  readonly reason: SolvedReason;
  /** 非单色的面（reason='mixed' 时有意义） */
  readonly wrongFaces: FaceId[];
  /** 与该面主色不一致的贴纸数 */
  readonly wrongStickers: number;
}

/** 每面主色；非单色面返回 null。 */
function faceMajorities(state: CubeState): { colors: (ColorId | null)[]; wrongFaces: FaceId[]; wrongStickers: number } {
  const per = state.size * state.size;
  const colors: (ColorId | null)[] = [];
  const wrongFaces: FaceId[] = [];
  let wrongStickers = 0;
  for (let faceIndex = 0; faceIndex < 6; faceIndex += 1) {
    const base = faceIndex * per;
    const first = state.slots[base] as ColorId;
    let uniform = true;
    for (let i = 1; i < per; i += 1) {
      if (state.slots[base + i] !== first) {
        uniform = false;
        break;
      }
    }
    if (uniform) {
      colors.push(first);
      continue;
    }
    // 非单色：以出现次数最多的颜色为「主色」，其余算错位贴纸
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < per; i += 1) counts[state.slots[base + i]] += 1;
    let major = 0;
    for (let c = 1; c < 6; c += 1) if (counts[c] > counts[major]) major = c;
    colors.push(null);
    wrongFaces.push(FACE_ORDER[faceIndex]);
    wrongStickers += per - counts[major];
  }
  return { colors, wrongFaces, wrongStickers };
}

function normalOf(color: ColorId): Vec3 {
  return FACE_GEOMETRY[FACE_ORDER[color]].normal;
}

/**
 * 手性检查：M 的三列由 R/U/F 三面的颜色所属面法向量给出，其余三面必须一致，
 * 且 det(M) = +1。
 */
function rotationIsLegal(colors: readonly ColorId[]): boolean {
  const colX = normalOf(colors[faceIndexOf('R')]);
  const colY = normalOf(colors[faceIndexOf('U')]);
  const colZ = normalOf(colors[faceIndexOf('F')]);

  // 负数侧三面的法向量是 -col？：M·(-n) 必须等于 n(color(该面))
  if (!equalVec(negate(colY), normalOf(colors[faceIndexOf('D')]))) return false;
  if (!equalVec(negate(colX), normalOf(colors[faceIndexOf('L')]))) return false;
  if (!equalVec(negate(colZ), normalOf(colors[faceIndexOf('B')]))) return false;

  const det = dot(colX, cross(colY, colZ));
  return det === 1;
}

export function evaluateSolved(state: CubeState): SolvedVerdict {
  const { colors, wrongFaces, wrongStickers } = faceMajorities(state);
  if (wrongFaces.length > 0) {
    return { solved: false, reason: 'mixed', wrongFaces, wrongStickers };
  }

  const sorted = [...(colors as ColorId[])].sort((a, b) => a - b);
  const isPermutation = sorted.every((value, index) => value === index);
  if (!isPermutation) {
    return { solved: false, reason: 'invalid-scheme', wrongFaces: [], wrongStickers: 0 };
  }

  if (!rotationIsLegal(colors as ColorId[])) {
    return { solved: false, reason: 'invalid-scheme', wrongFaces: [], wrongStickers: 0 };
  }

  return { solved: true, reason: 'uniform', wrongFaces: [], wrongStickers: 0 };
}

export function isSolved(state: CubeState): boolean {
  return evaluateSolved(state).solved;
}
