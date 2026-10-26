// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { HistoryPanel } from '../../src/ui/panels/history-panel';
import type { HistoryView } from '../../src/ui/view-model';

function view(patch: Partial<HistoryView> = {}): HistoryView {
  return {
    rows: [
      {
        runId: 'run-1',
        resultLabel: '已还原',
        solved: true,
        sizeText: '3×3',
        moveText: '20 步',
        elapsedText: '0:05.12',
        savedAtText: '14:30',
      },
      {
        runId: 'run-2',
        resultLabel: '超时',
        solved: false,
        sizeText: '2×2',
        moveText: '7 步',
        elapsedText: '0:02.00',
        savedAtText: '14:25',
      },
    ],
    corrupt: [],
    canPersist: true,
    ...patch,
  };
}

function makePanel() {
  const calls = { delete: [] as string[], export: [] as string[] };
  const panel = new HistoryPanel({
    onDeleteRecord: (id) => calls.delete.push(id),
    onExportRecord: (key) => calls.export.push(key),
  });
  return { panel, calls };
}

describe('历史运行面板（F11 / PRD §2.2 步骤 1 + §9.3）', () => {
  it('按行渲染结果徽标、事实与时间', () => {
    const { panel } = makePanel();
    panel.update(view());
    const items = [...panel.el.querySelectorAll('.history-list__item')];
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('.history-badge')?.textContent).toBe('已还原');
    expect(items[0].textContent).toContain('3×3 · 20 步 · 0:05.12');
    expect((items[0] as HTMLElement).dataset.runId).toBe('run-1');
  });

  it('空状态显示 §9.3 的具体文案，不出现「暂无数据」', () => {
    const { panel } = makePanel();
    panel.update(view({ rows: [] }));
    const empty = panel.el.querySelector('.history-list__empty');
    expect(empty?.textContent).toContain('还没有运行记录');
    expect(panel.el.textContent).not.toContain('暂无数据');
  });

  it('最多显示 5 条（PRD：最近 5 条）', () => {
    const { panel } = makePanel();
    const rows = Array.from({ length: 8 }, (_, i) => ({
      runId: `run-${i}`,
      resultLabel: '已放弃',
      solved: false,
      sizeText: '3×3',
      moveText: '1 步',
      elapsedText: '0:00.01',
      savedAtText: '14:00',
    }));
    panel.update(view({ rows }));
    expect(panel.el.querySelectorAll('.history-list__item')).toHaveLength(5);
  });

  it('损坏记录显示提示与「删除该记录 / 导出原始数据」，删除回传去掉前缀的 id', () => {
    const { panel, calls } = makePanel();
    panel.update(view({ corrupt: [{ id: 'run:run-broken' }] }));
    const corrupt = panel.el.querySelector('.history-list__item--corrupt');
    expect(corrupt?.textContent).toContain('这次运行的记录无法读取');
    const buttons = [...(corrupt?.querySelectorAll('button') ?? [])];
    expect(buttons.map((b) => b.textContent)).toEqual(['删除该记录', '导出原始数据']);
    (buttons[0] as HTMLButtonElement).click();
    (buttons[1] as HTMLButtonElement).click();
    expect(calls.delete).toEqual(['run-broken']);
    expect(calls.export).toEqual(['run:run-broken']);
  });

  it('索引键损坏（run-index）只提示，不给删除按钮', () => {
    const { panel } = makePanel();
    panel.update(view({ corrupt: [{ id: 'run-index' }] }));
    const corrupt = panel.el.querySelector('.history-list__item--corrupt');
    expect(corrupt?.textContent).toContain('这次运行的记录无法读取');
    expect(corrupt?.querySelectorAll('button')).toHaveLength(0);
  });

  it('存储不可用时元信息标注', () => {
    const { panel } = makePanel();
    panel.update(view({ canPersist: false }));
    expect(panel.el.querySelector('.panel__head-note')?.textContent).toBe('存储不可用');
  });
});
