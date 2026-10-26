// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ResultPanel } from '../../src/ui/panels/result-panel';
import type { ResultView } from '../../src/ui/view-model';

function view(patch: Partial<ResultView> = {}): ResultView {
  return {
    status: 'ended_solved',
    interrupted: false,
    solved: true,
    moveCount: 68,
    elapsedMs: 102_370,
    tps: 0.66,
    firstMoveMs: 3_200,
    mismatchStickers: null,
    fingerprint: '17c16964dda3f80e',
    events: [],
    attemptsLeft: 3,
    rules: {
      cubeSize: 3,
      challengeId: 'cb3-7f21a9',
      seed: 'a91f',
      scrambleMethod: 'random_moves',
      observationMode: 'full',
      dustMode: true,
      timeLimitMs: 1_200_000,
      moveLimit: null,
    },
    startedAt: '14:02',
    engineVersion: 'ob-cube 0.1.0 / ss-2',
    submit: null,
    compareElapsedMs: null,
    participant: 'human',
    pauseCount: 0,
    pausedTotalMs: 0,
    metrics: { htm: 68, htmLayer: 74, qtm: 81 },
    ...patch,
  };
}

const HOST = {
  onReplay: () => undefined,
  onRerun: () => undefined,
  onExport: () => undefined,
  onRetry: () => undefined,
  onCopyFingerprint: () => undefined,
  onShowLog: () => undefined,
};

function render(patch: Partial<ResultView> = {}): HTMLElement {
  const panel = new ResultPanel(HOST);
  panel.render(view(patch));
  return panel.el;
}

describe('结果面板（PRD §9.1 五区块 / §9.2 五条诚实标注）', () => {
  it('五个区块齐全：结论 / 核心指标 / 题面信息 / 运行信息 / 操作', () => {
    const el = render();
    const titles = Array.from(el.querySelectorAll('.result__section-title')).map((node) => node.textContent);
    expect(titles).toContain('核心指标');
    expect(titles).toContain('题面信息');
    expect(titles).toContain('运行信息');
    expect(el.querySelector('.result__verdict')?.textContent).toBe('已还原');
    // 主 CTA 唯一白实心，其余 4 个为次操作
    expect(el.querySelectorAll('.btn--action')).toHaveLength(1);
    expect(el.querySelectorAll('.result__actions .btn')).toHaveLength(4);
  });

  it('四个指标是 PRD 定义的那四个，不多不少', () => {
    const el = render();
    const labels = Array.from(el.querySelectorAll('.metric__label')).map((node) => node.textContent);
    expect(labels).toEqual(['总耗时', '总步数 · HTM', '每秒步数', '首次操作']);
  });

  it('AC-49：三种计步口径各带标签与数值节点', () => {
    const el = render();
    const rows = Array.from(el.querySelectorAll('.disclosures__metric-row'));
    expect(rows).toHaveLength(3);
    const pairs = rows.map((row) => ({
      label: row.querySelector('.disclosures__metric-label')?.textContent,
      value: row.querySelector('.disclosures__metric-value')?.textContent,
    }));
    expect(pairs).toEqual([
      { label: 'HTM', value: '68' },
      { label: 'HTM-layer', value: '74' },
      { label: 'QTM', value: '81' },
    ]);
  });

  it('五条诚实标注逐条存在（含折叠的计步口径）', () => {
    const el = render();
    const text = el.querySelector('[data-role="disclosures"]')?.textContent ?? '';
    expect(text).toContain('本机测量，未经服务端校验，不构成对外能力背书');
    expect(text).toContain('难度为启发式估计，非最短解距离');
    expect(text).toContain('不能阻止通过开发者工具读取内存');
    expect(text).toContain('本次使用随机操作打乱，不等同于随机状态题面');
    expect(text).toContain('其他计步口径');
  });

  it('不属于本次配置的标注不出现（随机状态 wording 只在 random_moves 时显示）', () => {
    const el = render({ rules: { ...view().rules, scrambleMethod: 'seeded_moves', dustMode: false } });
    const text = el.querySelector('[data-role="disclosures"]')?.textContent ?? '';
    expect(text).not.toContain('本次使用随机操作打乱');
    expect(text).not.toContain('不能阻止通过开发者工具读取内存');
  });

  it('六种结束态的标题与主 CTA 各不相同', () => {
    const cases: [Partial<ResultView>, string, string][] = [
      [{}, '已还原', '回放过程'],
      [{ status: 'ended_timeout', solved: false, mismatchStickers: 12 }, '超时', '同题面重跑'],
      [{ status: 'ended_move_limit', solved: false }, '步数耗尽', '同题面重跑'],
      [{ status: 'ended_abandoned', solved: false }, '已放弃', '回放过程'],
      [{ status: 'ended_invalid', solved: false, attemptsLeft: 0 }, '提交无效', '同题面重跑'],
      [{ interrupted: true, status: 'running' }, '未完成', '查看操作日志'],
    ];
    for (const [patch, title, cta] of cases) {
      const el = render(patch);
      expect(el.querySelector('.result__verdict')?.textContent).toBe(title);
      expect(el.querySelector('.btn--action')?.textContent).toBe(cta);
    }
  });

  it('无历史时不渲染对比参照行（不留空白）', () => {
    const el = render();
    expect(el.querySelectorAll('.metric__compare')).toHaveLength(0);
  });

  it('有同题面历史时只给总耗时挂一行对比', () => {
    const el = render({ compareElapsedMs: 118_020 });
    const compare = Array.from(el.querySelectorAll('.metric__compare')).map((node) => node.textContent);
    expect(compare).toEqual(['同题面中位 1:58.02']);
  });
});

describe('暂停摘要（AC-59 / v1.9 P6\'）', () => {
  it('有暂停时按 PRD 字面显示整句（含句号，可整句断言）', () => {
    const el = render({ pauseCount: 2, pausedTotalMs: 7620, status: 'ended_abandoned' });
    expect(el.textContent).toContain('本次运行包含 2 次暂停（共 7.6 秒），计时已扣除。');
  });

  it('无暂停时不显示暂停行', () => {
    const el = render();
    expect(el.textContent).not.toContain('次暂停');
  });
});

describe('复制题面指纹（§9.1，本轮修复回归）', () => {
  it('点击「复制指纹」把 view.fingerprint 传给宿主回调', () => {
    const calls: (string | null)[] = [];
    const host = { ...HOST, onCopyFingerprint: (fp: string | null) => calls.push(fp) };
    const panel = new ResultPanel(host);
    panel.render(view({ fingerprint: '17c16964dda3f80e' }));
    const btn = [...panel.el.querySelectorAll('button')].find((b) => b.textContent === '复制指纹');
    expect(btn).toBeDefined();
    btn!.click();
    expect(calls).toEqual(['17c16964dda3f80e']);
  });
});

describe('未完成（interrupted）结果（UIUX §7.4.2，本轮修复回归）', () => {
  it('ended_interrupted 渲染「未完成」结论与主按钮「查看操作日志」', () => {
    const el = render({ status: 'ended_interrupted', interrupted: true, solved: false });
    expect(el.querySelector('.result__verdict')?.textContent).toBe('未完成');
    const primary = el.querySelector('.result__actions')?.previousElementSibling;
    expect(primary?.textContent).toContain('查看操作日志');
  });
});
