// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { TurnMatrix } from '../../src/ui/turn-matrix';
import { TABS_BY_SIZE, buildMatrixSpec, canSelectLayer } from '../../src/ui/turn-matrix-data';
import type { CubeSize } from '../../src/contracts';

function mount(size: CubeSize): TurnMatrix {
  return new TurnMatrix(size, {
    onTurn: () => undefined,
    onLayerHover: () => undefined,
    onPrefixSync: () => undefined,
  });
}

function turnButtons(matrix: TurnMatrix): HTMLButtonElement[] {
  return Array.from(matrix.el.querySelectorAll<HTMLButtonElement>('.turn-btn'));
}

// textContent 会把角标一起读出来；标签语义读独立的 label span
function turnLabels(matrix: TurnMatrix): Array<string | null> {
  return turnButtons(matrix).map((btn) => btn.querySelector('.turn-btn__label')?.textContent ?? null);
}

describe('转动按钮矩阵（PRD §5.6 / UIUX §4）', () => {
  it('tab 组数按阶数 2 / 3 / 5，且不折叠任何一组', () => {
    expect(TABS_BY_SIZE[2]).toHaveLength(2);
    expect(TABS_BY_SIZE[3]).toHaveLength(3);
    expect(TABS_BY_SIZE[4]).toHaveLength(5);
    for (const size of [2, 3, 4] as CubeSize[]) {
      expect(mount(size).tablist.children).toHaveLength(TABS_BY_SIZE[size].length);
    }
  });

  it('同屏控件峰值 ≤ 19（2 阶 / 3 阶 / 4 阶）', () => {
    for (const size of [2, 3, 4] as CubeSize[]) {
      const peak = Math.max(...TABS_BY_SIZE[size].map((tab) => tab.controlCount));
      expect(peak).toBeLessThanOrEqual(19);
    }
  });

  it('单层 tab 恰好 18 个转动按钮，6 组 × 3 变体', () => {
    const matrix = mount(3);
    expect(turnButtons(matrix)).toHaveLength(18);
    expect(matrix.el.querySelectorAll('.face-card')).toHaveLength(6);
  });

  it('按钮标签一律 Singmaster，且与角标字符故意不同', () => {
    const matrix = mount(3);
    const labels = turnLabels(matrix);
    expect(labels.slice(0, 3)).toEqual(['U', 'U2', "U'"]);
    const rCard = Array.from(matrix.el.querySelectorAll('.face-card')).find((card) =>
      card.querySelector('.face-card__label')?.textContent?.startsWith('R'),
    );
    const rButtons = Array.from(rCard?.querySelectorAll<HTMLButtonElement>('.turn-btn') ?? []);
    expect(rButtons.map((btn) => btn.dataset.move)).toEqual(['R', 'R2', "R'"]);
    // R 按钮的角标是 D，不是 R
    expect(rButtons[0]?.querySelector('.kbd-set')?.textContent).toBe('D');
    expect(rButtons[2]?.querySelector('.kbd-set')?.textContent).toBe('⇧D');
  });

  it('3 阶中层 tab 的 M/E/S 按钮角标是 Z + 面键（双 chip）', () => {
    const matrix = mount(3);
    matrix.setTab('middle');
    const buttons = turnButtons(matrix);
    expect(turnLabels(matrix)).toEqual(['M', 'M2', "M'", 'E', 'E2', "E'", 'S', 'S2', "S'"]);
    const first = buttons[0]?.querySelector('.kbd-set');
    expect(first?.querySelectorAll('.kbd')).toHaveLength(2);
    expect(first?.textContent).toBe('ZA');
  });

  it('4 阶内层 tab 标签用「更近的外层」命名：2R / 2L 而不是 3R', () => {
    const near = buildMatrixSpec('inner', 4, 2).groups.map((group) => group.buttons[0]?.label);
    const far = buildMatrixSpec('inner', 4, 3).groups.map((group) => group.buttons[0]?.label);
    expect(near).toEqual(['2R', '2U', '2F']);
    expect(far).toEqual(['2L', '2D', '2B']);
  });

  it('4 阶宽转 3 层 tab 的标签是 3Rw 形态，长度为 5 字符上限内', () => {
    const spec = buildMatrixSpec('wide3', 4);
    const labels = spec.groups[0]?.buttons.map((button) => button.label);
    expect(labels).toEqual(['3Uw', '3Uw2', "3Uw'"]);
    for (const label of labels ?? []) expect(label.length).toBeLessThanOrEqual(5);
  });

  it('自由层禁止勾满全部层（全层转动必须被前置拦截）', () => {
    expect(canSelectLayer(4, [], 1)).toBe(true);
    expect(canSelectLayer(4, [1, 2, 3], 4)).toBe(false);
    expect(canSelectLayer(4, [1, 2, 3], 2)).toBe(true); // 取消勾选永远允许
    expect(canSelectLayer(3, [1, 2], 3)).toBe(false);
  });

  it('阶数切换后不存在的 tab 自动回落到第一组（不留空白）', () => {
    const matrix = mount(4);
    matrix.setTab('inner');
    expect(matrix.getTab()).toBe('inner');
    matrix.setSize(3);
    expect(matrix.getTab()).toBe('single');
  });
});
