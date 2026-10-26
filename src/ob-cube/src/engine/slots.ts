/**
 * slot 表：把「面 / 行 / 列」与「三维位置 + 外法向量」建成双向索引。
 *
 * slot 编号规则（契约 src/contracts.ts 注释 + ARCHITECTURE §3.3，钉死）：
 *   slot = faceIndex·N² + row·N + col，faceIndex 按 [U,R,F,D,L,B]
 *
 * 键是 (位置, 法向量) 而不是只有位置：一个位置在外表面上有且只有一个朝外的面，
 * 带上法向量后键与贴纸一一对应，翻转后（法向量也旋转）必定命中另一张贴纸。
 * 构造时断言 (N=2/3/4) 的 6N² 个键互不相同 —— 这是 T-02。
 */
import type { CubeSize, FaceId } from '../contracts';
import { FACE_ORDER } from '../contracts';
import { invariant } from '../shared';
import { faceIndexOf, faceletPosition, FACE_GEOMETRY } from './geometry';
import type { Vec3 } from './geometry';

export interface SlotTable {
  readonly size: CubeSize;
  readonly count: number;
  /** 按 slot 索引排列 */
  readonly faces: readonly FaceId[];
  readonly rows: readonly number[];
  readonly cols: readonly number[];
  readonly positions: readonly Vec3[];
  readonly normals: readonly Vec3[];
  /** (pos, normal) → slot */
  readonly lookup: ReadonlyMap<string, number>;
}

export function slotKey(position: Vec3, normal: Vec3): string {
  return `${position[0]},${position[1]},${position[2]}|${normal[0]},${normal[1]},${normal[2]}`;
}

const cache = new Map<CubeSize, SlotTable>();

export function getSlotTable(size: CubeSize): SlotTable {
  const cached = cache.get(size);
  if (cached) return cached;
  const table = buildSlotTable(size);
  cache.set(size, table);
  return table;
}

function buildSlotTable(size: CubeSize): SlotTable {
  const faces: FaceId[] = [];
  const rows: number[] = [];
  const cols: number[] = [];
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const lookup = new Map<string, number>();

  for (const face of FACE_ORDER) {
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const index = faces.length;
        const key = slotKey(faceletPosition(size, face, row, col), FACE_GEOMETRY[face].normal);
        invariant(!lookup.has(key), `duplicate slot key ${key} (N=${size})`);
        lookup.set(key, index);
        faces.push(face);
        rows.push(row);
        cols.push(col);
        positions.push(faceletPosition(size, face, row, col));
        normals.push(FACE_GEOMETRY[face].normal);
      }
    }
  }

  const count = 6 * size * size;
  invariant(faces.length === count, `slot count ${faces.length} != ${count}`);
  invariant(lookup.size === count, 'slot lookup is not a bijection');

  return { size, count, faces, rows, cols, positions, normals, lookup };
}

export function slotIndexOf(size: CubeSize, face: FaceId, row: number, col: number): number {
  return faceIndexOf(face) * size * size + row * size + col;
}
