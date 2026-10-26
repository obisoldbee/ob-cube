// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { describeMove } from '../../src/ui/move-preview';
import type { TurnIntent } from '../../src/ui/keymap';

const outer = (face: TurnIntent['face'], amount: 1 | 2 | 3): TurnIntent => ({
  face,
  layers: { kind: 'outer' },
  amount,
  source: 'button',
});

describe('「将提交」预览与引擎同源（PRD §5.7 唯一命名规则，ss-2）', () => {
  it('外层三变体：R / R2 / R\'', () => {
    expect(describeMove(outer('R', 1), 3).move).toBe('R');
    expect(describeMove(outer('R', 2), 3).move).toBe('R2');
    expect(describeMove(outer('R', 3), 3).move).toBe("R'");
  });

  it('宽转：Rw / 3Rw，3 层在 3 阶是非法的（覆盖全层）', () => {
    const wide2: TurnIntent = { face: 'R', layers: { kind: 'wide', depth: 2 }, amount: 1, source: 'button' };
    expect(describeMove(wide2, 3).move).toBe('Rw');
    const wide3: TurnIntent = { ...wide2, layers: { kind: 'wide', depth: 3 } };
    expect(describeMove(wide3, 4).move).toBe('3Rw');
    expect(describeMove(wide3, 3).legal).toBe(false);
  });

  it('内层按「更近的外层」命名且方向随命名面换算：4 阶 R 轴第 3 层顺时针是 2L\'', () => {
    const near: TurnIntent = { face: 'R', layers: { kind: 'inner', near: true }, amount: 1, source: 'keyboard' };
    const far: TurnIntent = { face: 'R', layers: { kind: 'inner', near: false }, amount: 1, source: 'keyboard' };
    expect(describeMove(near, 4).move).toBe('2R');
    // 从 R 看顺时针 = 从 L 看逆时针：3R ≡ 2L'（ARCHITECTURE §5.2）
    expect(describeMove(far, 4).move).toBe("2L'");
    // 换到命名面一侧表达同一层：L 面第 2 层顺时针 = 2L
    const namedFar: TurnIntent = { face: 'L', layers: { kind: 'inner', near: true }, amount: 1, source: 'keyboard' };
    expect(describeMove(namedFar, 4).move).toBe('2L');
  });

  it('3 阶内层规范形式是 M 族，2X 族退为括号别名（AC-34 / §5.3.3）', () => {
    const m: TurnIntent = { face: 'L', layers: { kind: 'inner', near: true }, amount: 1, source: 'button' };
    expect(describeMove(m, 3)).toMatchObject({ move: 'M', alias: '2L' });
    const mPrime: TurnIntent = { ...m, amount: 3 };
    expect(describeMove(mPrime, 3)).toMatchObject({ move: "M'", alias: '2R' });
  });

  it('非连续层区间不可序列化，前置判非法而不是拼出一个错字符串', () => {
    const set: TurnIntent = { face: 'R', layers: { kind: 'set', layers: [1, 3] }, amount: 1, source: 'free-layer' };
    const desc = describeMove(set, 4);
    expect(desc.legal).toBe(false);
    expect(desc.move).toBe('—');
    expect(desc.reason).toBe('记法只能表达连续层区间');
  });

  it('连续区间 2-3 层给出区间记法（无 w，PRD §5.7）', () => {
    const set: TurnIntent = { face: 'R', layers: { kind: 'set', layers: [2, 3] }, amount: 1, source: 'free-layer' };
    expect(describeMove(set, 4).move).toBe('2-3R');
  });

  it('覆盖全层被拒绝并说明原因', () => {
    const all: TurnIntent = { face: 'R', layers: { kind: 'set', layers: [1, 2, 3, 4] }, amount: 1, source: 'free-layer' };
    const desc = describeMove(all, 4);
    expect(desc.legal).toBe(false);
    expect(desc.reason).toBe('转动覆盖全部层，请改用视角旋转');
  });
});
