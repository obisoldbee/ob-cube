// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ObservationPanel } from '../../src/ui/panels/observation-panel';
import type { StickerColor } from '../../src/contracts';
import type { ObservationView } from '../../src/ui/view-model';

function lockedView(lockReason: 'not-started' | 'paused'): ObservationView {
  return { faceColors: {}, locked: true, lockReason, observationId: null, visibleFaces: [], canObserve: false, budgetLeft: null };
}

function runningView(): ObservationView {
  const grid: StickerColor[][] = [
    ['white', 'white', 'white'],
    ['white', 'white', 'white'],
    ['white', 'white', 'white'],
  ];
  return {
    faceColors: { U: grid },
    locked: false,
    lockReason: null,
    observationId: 'run-1:o1',
    visibleFaces: ['U'],
    canObserve: false,
    budgetLeft: null,
  };
}

describe('ObservationPanel 锁定态（P7\'：暂停屏蔽观察）', () => {
  it('未开始锁定：显示开始后可读取文案，不渲染颜色网格', () => {
    const panel = new ObservationPanel({ onCopyObservationId: () => {}, onObserve: () => {} });
    panel.update(lockedView('not-started'));
    expect(panel.el.textContent).toContain('观察已锁定');
    expect(panel.el.textContent).toContain('开始后可读取');
    expect(panel.el.querySelectorAll('.facelet').length).toBe(0);
  });

  it('暂停锁定：显示暂停文案，不渲染颜色网格', () => {
    const panel = new ObservationPanel({ onCopyObservationId: () => {}, onObserve: () => {} });
    panel.update(lockedView('paused'));
    expect(panel.el.textContent).toContain('观察已锁定');
    expect(panel.el.textContent).toContain('挑战已暂停，计时已冻结');
    expect(panel.el.textContent).not.toContain('开始后可读取');
    expect(panel.el.querySelectorAll('.facelet').length).toBe(0);
  });

  it('运行中：正常渲染授权面网格与授权说明', () => {
    const panel = new ObservationPanel({ onCopyObservationId: () => {}, onObserve: () => {} });
    panel.update(runningView());
    expect(panel.el.querySelectorAll('.facelet').length).toBe(1);
    expect(panel.el.textContent).toContain('已授权 1 / 6 面');
  });

  it('暂停后恢复：从锁定态回到渲染态可来回切换', () => {
    const panel = new ObservationPanel({ onCopyObservationId: () => {}, onObserve: () => {} });
    panel.update(runningView());
    panel.update(lockedView('paused'));
    expect(panel.el.querySelectorAll('.facelet').length).toBe(0);
    panel.update(runningView());
    expect(panel.el.querySelectorAll('.facelet').length).toBe(1);
  });
});
