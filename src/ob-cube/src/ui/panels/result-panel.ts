/**
 * result-panel.ts —— 右栏结果面板（PRD §9.1 五区块 + §9.2 五条诚实标注）
 *
 * 反模式检查第 16 / 17 条会逐条在 DOM 中断言：五个区块缺一即不合格，
 * 五条诚实标注逐条必须存在。因此本文件把区块与标注都做成常量表，
 * 不靠「写在某个分支里」。
 *
 * 指标取舍按 PRD：总耗时 / 总步数 / TPS / 首次操作耗时。
 * `首次操作耗时` 度量「读题成本」，是区分「会推理」与「在瞎转」的关键读数，
 * 所以它进第一屏，不折叠。
 */

import type { ResultView } from '../view-model';
import { EM_DASH, formatElapsed, formatTps } from '../format';
import { STATUS_META } from './status-meta';

export interface ResultPanelHost {
  onReplay(): void;
  onRerun(): void;
  onExport(): void;
  onRetry(): void;
  onCopyFingerprint(fingerprint: string | null): void;
  onShowLog(): void;
}

interface Verdict {
  readonly title: string;
  readonly sub: string;
  readonly tone: 'success' | 'danger' | 'neutral';
  readonly primary: 'replay' | 'rerun' | 'log';
}

const FIXED_DISCLOSURES: readonly string[] = [
  '本机测量，未经服务端校验，不构成对外能力背书',
  '难度为启发式估计，非最短解距离',
];

export class ResultPanel {
  readonly el: HTMLElement;

  constructor(private readonly host: ResultPanelHost) {
    this.el = document.createElement('div');
    this.el.className = 'result';
    this.el.setAttribute('aria-label', '本次运行结果');
  }

  render(view: ResultView): void {
    const verdict = this.verdictOf(view);
    this.el.replaceChildren(
      this.conclusion(verdict),
      this.metrics(view),
      this.puzzleInfo(view),
      this.runInfo(view, verdict),
      this.actions(verdict, view),
      this.disclosures(view),
    );
  }

  private verdictOf(view: ResultView): Verdict {
    if (view.interrupted) {
      return {
        title: '未完成',
        sub: '页面在运行中被关闭或刷新，记录可能不完整',
        tone: 'neutral',
        primary: 'log',
      };
    }
    switch (view.status) {
      case 'ended_solved':
        return { title: '已还原', sub: `第 ${view.moveCount} 步达成`, tone: 'success', primary: 'replay' };
      case 'ended_timeout':
        return {
          title: '超时',
          sub: `限时到时，剩余 ${view.mismatchStickers ?? EM_DASH} 张贴纸未归位`,
          tone: 'danger',
          primary: 'rerun',
        };
      case 'ended_move_limit':
        return {
          title: '步数耗尽',
          sub: `第 ${view.moveCount} 步仍未还原，上限 ${view.rules.moveLimit ?? EM_DASH} 步`,
          tone: 'danger',
          primary: 'rerun',
        };
      case 'ended_abandoned':
        return {
          title: '已放弃',
          sub: `已记录 ${view.moveCount} 步，数据仍可回放`,
          tone: 'neutral',
          primary: 'replay',
        };
      case 'ended_invalid':
        return {
          title: '提交无效',
          sub: '连续 3 次提交时未还原，本次运行按规则终止',
          tone: 'danger',
          primary: 'rerun',
        };
      case 'ended_interrupted':
        return {
          title: '未完成',
          sub: '页面在运行中被关闭或刷新，记录可能缺尾部事件',
          tone: 'neutral',
          primary: 'log',
        };
      default:
        return { title: STATUS_META[view.status].verdict, sub: `已记录 ${view.moveCount} 步`, tone: 'neutral', primary: 'log' };
    }
  }

  private conclusion(verdict: Verdict): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'result__section';
    const h = document.createElement('h2');
    h.className = 'result__verdict';
    h.dataset.tone = verdict.tone;
    h.textContent = verdict.title;
    const sub = document.createElement('p');
    sub.className = 'result__sub';
    sub.textContent = verdict.sub;
    wrap.append(h, sub);
    return wrap;
  }

  private metrics(view: ResultView): HTMLElement {
    const section = document.createElement('section');
    section.className = 'result__section';
    const title = document.createElement('h3');
    title.className = 'result__section-title';
    title.textContent = '核心指标';

    const grid = document.createElement('div');
    grid.className = 'metrics';
    const compare = view.compareElapsedMs;
    grid.append(
      this.metric('总耗时', formatElapsed(view.elapsedMs), 's', compare === null ? null : `同题面中位总耗时 ${formatElapsed(compare)}`),
      // 口径名必须标在标签上（PRD §7.1：R2 算 1 步是反直觉点，不能让用户猜）
      this.metric('总步数 · HTM', String(view.moveCount), '步', null),
      this.metric('每秒步数', formatTps(view.moveCount, view.elapsedMs), 'TPS', null),
      this.metric('首次操作', formatFirstMove(view.firstMoveMs), 's', null),
    );
    section.append(title, grid);
    return section;
  }

  private metric(label: string, value: string, unit: string, compare: string | null): HTMLElement {
    const cell = document.createElement('div');
    cell.className = 'metric';
    const l = document.createElement('span');
    l.className = 'metric__label';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'metric__value';
    v.textContent = value;
    const u = document.createElement('span');
    u.className = 'metric__unit';
    u.textContent = unit;
    v.append(u);
    cell.append(l, v);
    if (compare) {
      const c = document.createElement('span');
      c.className = 'metric__compare';
      c.textContent = compare;
      cell.append(c);
    }
    return cell;
  }

  private puzzleInfo(view: ResultView): HTMLElement {
    const section = document.createElement('section');
    section.className = 'result__section';
    const title = document.createElement('h3');
    title.className = 'result__section-title';
    title.textContent = '题面信息';
    const list = document.createElement('ul');
    list.className = 'result__facts';
    const gen = view.rules.scrambleMethod === 'random_moves' ? '随机操作打乱' : '种子打乱';
    list.append(
      fact('题面', `${view.rules.cubeSize}×${view.rules.cubeSize} · ${view.rules.challengeId}`),
      fact('生成', `${gen}${view.rules.seed ? ` · seed ${view.rules.seed}` : ''}`),
      fact('观察', `${observationLabel(view.rules.observationMode)} · 蒙尘 ${view.rules.dustMode ? '开' : '关'}`),
      fact(
        '难度',
        view.difficultyLabel === null
          ? EM_DASH
          : `${view.difficultyLabel}${view.difficultyScore === null ? '' : ` · 估计 ${view.difficultyScore.toFixed(2)}`}`,
      ),
      fact('限制', `限时 ${view.rules.timeLimitMs === null ? '—' : formatElapsed(view.rules.timeLimitMs)} · 限步 ${view.rules.moveLimit ?? '—'}`),
    );
    section.append(title, list);
    return section;
  }

  private runInfo(view: ResultView, verdict: Verdict): HTMLElement {
    const section = document.createElement('section');
    section.className = 'result__section';
    const title = document.createElement('h3');
    title.className = 'result__section-title';
    title.textContent = '运行信息';
    const list = document.createElement('ul');
    list.className = 'result__facts';
    list.append(
      fact('操作者', view.participant === 'agent' ? 'AI Agent（页面驱动）' : '人类'),
      fact('开始于', view.startedAt ?? EM_DASH),
      fact('引擎', view.engineVersion),
    );
    if (view.pauseCount > 0) {
      // AC-59 / P6'（v1.9）：暂停口径显式可见，文案按 PRD 字面（含句号，
      // 验收按整句匹配），跨运行对比时不被隐藏成本污染
      list.append(
        fact(
          '暂停',
          `本次运行包含 ${view.pauseCount} 次暂停（共 ${(view.pausedTotalMs / 1000).toFixed(1)} 秒），计时已扣除。`,
        ),
      );
    }
    if (view.status === 'ended_invalid') {
      const attempts = document.createElement('li');
      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = '提交';
      const v = document.createElement('span');
      v.textContent = `剩余 ${view.attemptsLeft} 次机会 · ${verdict.title}`;
      attempts.append(k, v);
      list.append(attempts);
    }
    section.append(title, list);
    return section;
  }

  private actions(verdict: Verdict, view: ResultView): HTMLElement {
    const section = document.createElement('section');
    section.className = 'result__section';
    const primary = document.createElement('button');
    primary.type = 'button';
    primary.className = 'btn btn--action';
    if (verdict.primary === 'rerun') {
      primary.textContent = '同题面重跑';
      primary.addEventListener('click', () => this.host.onRerun());
    } else if (verdict.primary === 'log') {
      primary.textContent = '查看操作日志';
      primary.addEventListener('click', () => this.host.onShowLog());
    } else {
      primary.textContent = '回放过程';
      primary.addEventListener('click', () => this.host.onReplay());
    }

    const row = document.createElement('div');
    row.className = 'result__actions';
    // 主按钮已经是「同题面重跑」时不再在次按钮里重复一次（评审 §5：同一动作两个
    // 入口并排出现，只是噪音，不是冗余保险）
    const secondary: [string, () => void][] =
      verdict.primary === 'rerun'
        ? [
            ['导出 JSON', () => this.host.onExport()],
            ['再挑战一次', () => this.host.onRetry()],
            ['复制指纹', () => this.host.onCopyFingerprint(view.fingerprint)],
          ]
        : [
            ['同题面重跑', () => this.host.onRerun()],
            ['导出 JSON', () => this.host.onExport()],
            ['再挑战一次', () => this.host.onRetry()],
            // §9.1「复制题面指纹」：指纹由 wiring 从结果对象注入，面板不自算
            ['复制指纹', () => this.host.onCopyFingerprint(view.fingerprint)],
          ];
    for (const [label, handler] of secondary) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--secondary btn--sm';
      btn.textContent = label;
      btn.addEventListener('click', handler);
      row.append(btn);
    }
    section.append(primary, row);
    return section;
  }

  private disclosures(view: ResultView): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'disclosures';
    wrap.dataset.role = 'disclosures';
    const lines: string[] = [...FIXED_DISCLOSURES];
    if (view.rules.dustMode) lines.push('本模式用于防止误看，不能阻止通过开发者工具读取内存');
    if (view.rules.scrambleMethod === 'random_moves') lines.push('本次使用随机操作打乱，不等同于随机状态题面');
    for (const line of lines) {
      const p = document.createElement('p');
      p.textContent = line;
      wrap.append(p);
    }
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = '其他计步口径';
    // AC-49：三个口径标签各自带一个数值节点（可断言），默认主展示用 HTM。
    const table = document.createElement('div');
    table.className = 'disclosures__metrics';
    const rows: [string, number, string][] = [
      ['HTM', view.metrics.htm, '每条转动计 1 步（平台主口径）'],
      ['HTM-layer', view.metrics.htmLayer, '每层各计 1 步'],
      ['QTM', view.metrics.qtm, '180° 计 2 步'],
    ];
    for (const [label, value, note] of rows) {
      const line = document.createElement('div');
      line.className = 'disclosures__metric-row';
      const name = document.createElement('span');
      name.className = 'disclosures__metric-label';
      name.textContent = label;
      const num = document.createElement('span');
      num.className = 'disclosures__metric-value';
      num.textContent = String(value);
      const desc = document.createElement('span');
      desc.className = 'disclosures__metric-note';
      desc.textContent = note;
      line.append(name, num, desc);
      table.append(line);
    }
    details.append(summary, table);
    wrap.append(details);
    return wrap;
  }
}

function fact(key: string, value: string): HTMLElement {
  const li = document.createElement('li');
  const k = document.createElement('span');
  k.className = 'k';
  k.textContent = key;
  const v = document.createElement('span');
  v.textContent = value;
  li.append(k, v);
  return li;
}

function formatFirstMove(ms: number | null): string {
  if (ms === null) return EM_DASH;
  return (ms / 1000).toFixed(1);
}

const OBSERVATION_LABEL: Readonly<Record<string, string>> = {
  full: '完整',
  three_faces: '三面',
  single_face: '单面',
  after_move: '操作后',
  restricted: '受限',
};

function observationLabel(mode: string): string {
  return OBSERVATION_LABEL[mode] ?? mode;
}
