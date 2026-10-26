// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createSolvedState } from '../../src/engine';
import { CubeNet } from '../../src/ui/cube-net';

describe('AC-53 2D 展开图降级视图', () => {
  it('六面各 N² 格，共 6N² 个贴纸节点', () => {
    const net = new CubeNet();
    net.update({ size: 2, slots: createSolvedState(2).slots, visible: ['U', 'R', 'F', 'D', 'L', 'B'], masked: false });
    expect(net.el.querySelectorAll('.cube-net__stickers')).toHaveLength(6);
    expect(net.el.querySelectorAll('.cube-net__sticker')).toHaveLength(24);
  });

  it('蒙尘/暂停时全部格子使用遮蔽色，不泄露任何贴纸色', () => {
    const net = new CubeNet();
    net.update({ size: 3, slots: createSolvedState(3).slots, visible: ['U', 'R', 'F', 'D', 'L', 'B'], masked: true });
    const cells = [...net.el.querySelectorAll<HTMLElement>('.cube-net__sticker')];
    expect(cells).toHaveLength(54);
    for (const cell of cells) expect(cell.style.background).toContain('--cube-masked');
  });

  it('观察模式裁剪在 2D 路径同样生效：未授权面显示「未授权」', () => {
    const net = new CubeNet();
    net.update({ size: 2, slots: createSolvedState(2).slots, visible: ['F'], masked: false });
    expect(net.el.querySelectorAll('.cube-net__sticker')).toHaveLength(4);
    expect(net.el.querySelectorAll('.cube-net__locked')).toHaveLength(5);
  });

  it('尺寸切换后网格重建成新阶数', () => {
    const net = new CubeNet();
    net.update({ size: 2, slots: createSolvedState(2).slots, visible: ['U', 'R', 'F', 'D', 'L', 'B'], masked: false });
    net.update({ size: 4, slots: createSolvedState(4).slots, visible: ['U', 'R', 'F', 'D', 'L', 'B'], masked: false });
    expect(net.el.querySelectorAll('.cube-net__sticker')).toHaveLength(96);
  });
});
