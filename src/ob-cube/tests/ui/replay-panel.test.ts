// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ReplayPanel } from '../../src/ui/replay-panel';
import type { ReplayView } from '../../src/ui/view-model';
import type { FaceGrid } from '../../src/contracts';

function view(patch: Partial<ReplayView> = {}): ReplayView {
  return {
    totalSteps: 12,
    currentStep: 3,
    elapsedMs: 4200,
    playing: false,
    speed: 1,
    mode: 'god',
    versionMismatch: false,
    versionConfirmed: false,
    grids: [],
    changedFaces: [],
    ...patch,
  };
}

function mount() {
  const calls: string[] = [];
  const panel = new ReplayPanel({
    onPlay: () => calls.push('play'),
    onPause: () => calls.push('pause'),
    onStep: (delta) => calls.push(`step:${delta}`),
    onSeek: (step) => calls.push(`seek:${step}`),
    onSpeed: (rate) => calls.push(`speed:${rate}`),
    onMode: (mode) => calls.push(`mode:${mode}`),
    onConfirmVersion: () => calls.push('confirm'),
    onClose: () => calls.push('close'),
  });
  document.body.append(panel.el);
  return { panel, calls };
}

function click(root: HTMLElement, label: string): void {
  const btn = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent === label,
  );
  if (!btn) throw new Error(`找不到按钮 ${label}`);
  btn.click();
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('F09b 回放控制条', () => {
  it('步数/时间/进度条同步，播放与暂停按钮互斥', () => {
    const { panel } = mount();
    panel.update(view());
    expect(panel.el.textContent).toContain('第 3 / 12 步');
    expect(panel.el.textContent).toContain('0:04.20');
    const range = panel.el.querySelector<HTMLInputElement>('.replay__range')!;
    expect(range.max).toBe('12');
    expect(range.value).toBe('3');
    const play = [...panel.el.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === '播放',
    )!;
    const pause = [...panel.el.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === '暂停',
    )!;
    expect(play.hidden).toBe(false);
    expect(pause.hidden).toBe(true);
    panel.update(view({ playing: true }));
    expect(play.hidden).toBe(true);
    expect(pause.hidden).toBe(false);
  });

  it('点击各控件发出对应意图', () => {
    const { panel, calls } = mount();
    panel.update(view());
    click(panel.el, '播放');
    click(panel.el, '上一步');
    click(panel.el, '下一步');
    click(panel.el, '2x');
    click(panel.el, '观察者视角');
    click(panel.el, '退出回放');
    expect(calls).toEqual(['play', 'step:-1', 'step:1', 'speed:2', 'mode:observer', 'close']);
  });

  it('AC-50：旧版引擎记录显示提示，播放/暂停被禁用，确认后才可用', () => {
    const { panel, calls } = mount();
    panel.update(view({ versionMismatch: true, versionConfirmed: false }));
    const warning = panel.el.querySelector<HTMLElement>('.replay__warning')!;
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toContain('旧版引擎');
    const play = [...panel.el.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === '播放',
    )!;
    expect(play.disabled).toBe(true);
    click(panel.el, '仍要回放');
    expect(calls).toContain('confirm');
    panel.update(view({ versionMismatch: true, versionConfirmed: true }));
    expect(warning.hidden).toBe(true);
    expect(play.disabled).toBe(false);
  });

  it('校验视角渲染 6 面矩阵并高亮变化面', () => {
    const { panel } = mount();
    const grid: FaceGrid = [
      ['white', 'white'],
      ['white', 'red'],
    ];
    panel.update(
      view({
        mode: 'verify',
        grids: (['U', 'R', 'F', 'D', 'L', 'B'] as const).map((face) => ({ face, grid })),
        changedFaces: ['F'],
      }),
    );
    expect(panel.el.querySelectorAll('.replay__face')).toHaveLength(6);
    expect(panel.el.querySelectorAll('.replay__cell')).toHaveLength(24);
    const changed = panel.el.querySelector<HTMLElement>('.replay__face[data-changed="true"]');
    expect(changed?.textContent).toContain('F');
  });
});
