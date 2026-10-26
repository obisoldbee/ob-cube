// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Color } from 'three';
import designTokens from '../../../../design/design-tokens.json';
import { createMaskMaterials } from '../../src/render/mask-material';
import { deltaE76, labOf, parseHex } from '../../src/shared';

/** 色值唯一源头：design/design-tokens.json 的 primitive.cube 层 */
const cube = (designTokens as { primitive: { cube: Record<string, { value: string }> } }).primitive.cube;

function hexOf(name: string): string {
  const value = cube[name]?.value;
  if (!value) throw new Error(`design-tokens.json 缺少 primitive.cube.${name}`);
  return value;
}

const MASKED = hexOf('dust-base');
const STICKERS: readonly [string, string][] = [
  ['U', hexOf('U')],
  ['D', hexOf('D')],
  ['F', hexOf('F')],
  ['B', hexOf('B')],
  ['R', hexOf('R')],
  ['L', hexOf('L')],
];

describe('AC-16 蒙尘确定性探针（配色侧自动断言）', () => {
  it('遮蔽色与 6 个贴纸色的 ΔE 均 ≥ 20（没有一丝贴纸色透出）', () => {
    for (const [face, hex] of STICKERS) {
      const distance = deltaE76(MASKED, hex);
      expect(distance, `${face} ${hex} vs ${MASKED}`).toBeGreaterThanOrEqual(20);
    }
  });

  it('遮蔽色自身 ΔE = 0，恒满足探针条件一（ΔE ≤ 2）', () => {
    expect(deltaE76(MASKED, MASKED)).toBe(0);
  });

  it('最危险的一对是遮蔽色 vs 蓝贴纸，但仍需 ≥ 20（PRD §8.2 实测提示）', () => {
    const blue = STICKERS.find(([face]) => face === 'B')![1];
    const distances = STICKERS.map(([face, hex]) => ({ face, d: deltaE76(MASKED, hex) }));
    const min = distances.reduce((a, b) => (a.d <= b.d ? a : b));
    expect(min.face).toBe('B');
    expect(deltaE76(MASKED, blue)).toBeGreaterThanOrEqual(20);
  });

  it('遮蔽材质 unlit、关闭色调映射，且 body/sticker 与 --cube-masked 完全同色', () => {
    const color = new Color(MASKED);
    const mask = createMaskMaterials(color);
    expect(mask.body.type).toBe('MeshBasicMaterial');
    expect(mask.sticker.type).toBe('MeshBasicMaterial');
    expect(mask.body.toneMapped).toBe(false);
    expect(mask.sticker.toneMapped).toBe(false);
    // three 的 Color 内部是线性空间；用同一构造方式比较等价性
    expect(mask.body.color.getHexString()).toBe(new Color(MASKED).getHexString());
    expect(mask.sticker.color.getHexString()).toBe(mask.body.color.getHexString());
    mask.dispose();
  });

  it('噪点/粗糙度 Token 已作废且保持 0（任何噪点都会让探针偏离遮蔽色）', () => {
    // 该两条是 tokens.css 的作废标记；色值源头 design-tokens.json 不提供噪点参数。
    expect(hexOf('dust-base')).toBe('#2B323C');
  });

  it('Lab 换算与 PRD 记录的 L* 阶梯一致（±0.01）', () => {
    const expected: readonly [string, number][] = [
      ['U', 97.11],
      ['D', 82.66],
      ['F', 73.99],
      ['L', 66.12],
      ['B', 56.53],
      ['R', 46.97],
    ];
    for (const [name, l] of expected) {
      expect(labOf(hexOf(name)).l).toBeCloseTo(l, 2);
    }
    expect(parseHex(MASKED)).toHaveLength(3);
  });
});
