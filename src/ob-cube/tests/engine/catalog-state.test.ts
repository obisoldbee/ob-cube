// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  actionKey,
  canonicalEntries,
  catalogEntryFor,
  createSolvedState,
  equalState,
  faceGrid,
  faceOfColor,
  faceStickers,
  getMoveCatalog,
  notationForAction,
  slotCountOf,
  toStateView,
} from '../../src/engine';
import type { CubeSize } from '../../src/contracts';

describe('move_catalog 查询函数', () => {
  it('catalogEntryFor 命中已知记法，未命中返回 undefined', () => {
    for (const size of [2, 3, 4] as CubeSize[]) {
      const entry = getMoveCatalog(size).entries[0]!;
      expect(catalogEntryFor(size, entry.notation)?.notation).toBe(entry.notation);
      expect(catalogEntryFor(size, 'not-a-move')).toBeUndefined();
    }
  });

  it('notationForAction 对全部清单条目命中等价动作（别名记法取首个匹配）', () => {
    for (const size of [2, 3, 4] as CubeSize[]) {
      for (const entry of getMoveCatalog(size).entries) {
        const notation = notationForAction(size, entry.spec.axis, entry.spec.layerSet, entry.spec.amount);
        expect(notation).not.toBeNull();
        const returned = catalogEntryFor(size, notation!);
        expect(returned).toBeDefined();
        expect(actionKey(returned!.spec)).toBe(actionKey(entry.spec));
      }
    }
  });

  it('actionKey 对层集合排序，跨写法可比较', () => {
    const entry = getMoveCatalog(4).entries.find((item) => item.spec.layerSet.length > 1)!;
    const reversed = [...entry.spec.layerSet].reverse();
    const key = actionKey(entry.spec);
    expect(key).toBe(`${entry.spec.axis}|${entry.spec.layerSet.join(',')}|${entry.spec.amount}`);
    expect(
      notationForAction(4, entry.spec.axis, reversed, entry.spec.amount),
    ).not.toBeNull();
  });

  it('canonicalEntries 是 entries 的子集且非空', () => {
    for (const size of [2, 3, 4] as CubeSize[]) {
      const all = getMoveCatalog(size).entries;
      const canonical = canonicalEntries(size);
      expect(canonical.length).toBeGreaterThan(0);
      expect(canonical.length).toBeLessThanOrEqual(all.length);
      for (const entry of canonical) expect(entry.notation).toBe(entry.spec.normalized);
    }
  });
});

describe('状态只读辅助', () => {
  it('slotCountOf / faceStickers / faceGrid 与阶数一致', () => {
    expect(slotCountOf(2)).toBe(24);
    expect(slotCountOf(3)).toBe(54);
    expect(slotCountOf(4)).toBe(96);
    const state = createSolvedState(3);
    expect(faceStickers(state, 'U')).toHaveLength(9);
    expect(faceStickers(state, 'U').every((id) => id === 0)).toBe(true);
    expect(faceGrid(state, 'R')).toHaveLength(3);
    expect(faceGrid(state, 'R')[0]).toHaveLength(3);
    expect(faceOfColor(5)).toBe('B');
  });

  it('equalState 区分阶数，toStateView 给出不可变副本', () => {
    const a = createSolvedState(2);
    const b = createSolvedState(3);
    expect(equalState(a, b)).toBe(false);
    expect(equalState(a, createSolvedState(2))).toBe(true);
    const view = toStateView(a);
    view.slots[0] = 5;
    expect(a.slots[0]).toBe(0);
  });
});
