/**
 * config-panel.ts —— 左栏「挑战配置」（PRD §2.2 配置表的页面内落点，v1.9）。
 *
 * 规则：
 *  - 仅 ready / ended 态可编辑；running / paused / solved_pending 整体禁用（配置即契约，
 *    中途改配置等于换了一场比赛）。
 *  - 时限/步数/蒙尘/题目的改动 = 用新配置重建题面（wiring 负责）；参与者切换只影响
 *    Agent 面板可见性，不重建。
 *  - 校验失败就地显示原因文案，不用弹窗（PRD §2.2 系统行为）。
 */

import type { ConfigView } from '../view-model';
import type { ChallengeConfig } from '../../services';

export interface ConfigPanelHost {
  onConfigChange(patch: Partial<ChallengeConfig>): void;
}

const TIME_PRESETS: readonly { label: string; sec: number | null }[] = [
  { label: '不限时', sec: null },
  { label: '2 分钟', sec: 120 },
  { label: '5 分钟', sec: 300 },
  { label: '20 分钟', sec: 1200 },
];

const MOVE_PRESETS: readonly { label: string; moves: number | null }[] = [
  { label: '不限步', moves: null },
  { label: '20 步', moves: 20 },
  { label: '50 步', moves: 50 },
  { label: '100 步', moves: 100 },
];

export class ConfigPanel {
  readonly el: HTMLElement;
  private readonly body: HTMLElement;
  private readonly validationEl: HTMLElement;
  private lastSignature = '';

  constructor(private readonly host: ConfigPanelHost) {
    this.el = document.createElement('section');
    this.el.className = 'panel panel--config';
    this.el.setAttribute('aria-label', '挑战配置');

    const head = document.createElement('div');
    head.className = 'panel__head';
    const title = document.createElement('h2');
    title.className = 'panel__title-zh';
    title.textContent = '挑战配置';
    const hint = document.createElement('span');
    hint.className = 'panel__head-note';
    hint.textContent = '改动即生成新题面';
    head.append(title, hint);

    this.body = document.createElement('div');
    this.body.className = 'config';
    this.validationEl = document.createElement('p');
    this.validationEl.className = 'config__validation';
    this.validationEl.hidden = true;
    this.el.append(head, this.body, this.validationEl);
  }

  update(view: ConfigView): void {
    const signature = JSON.stringify(view);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.render(view);
  }

  private render(view: ConfigView): void {
    this.el.dataset.editable = String(view.canEdit);
    this.validationEl.hidden = view.validation === null;
    this.validationEl.textContent = view.validation ?? '';
    this.body.replaceChildren(
      this.chipRow(
        '时限',
        TIME_PRESETS.map((p) => ({
          label: p.label,
          value: p.sec === null ? 'none' : String(p.sec),
          checked: view.timeLimitSec === p.sec,
        })),
        (value) => this.host.onConfigChange({ timeLimitSec: value === 'none' ? null : Number(value) }),
      ),
      this.chipRow(
        '步数上限',
        MOVE_PRESETS.map((p) => ({
          label: p.label,
          value: p.moves === null ? 'none' : String(p.moves),
          checked: view.moveLimit === p.moves,
        })),
        (value) => this.host.onConfigChange({ moveLimit: value === 'none' ? null : Number(value) }),
      ),
      this.chipRow(
        '蒙层',
        [
          { label: '预观察（先看再开始）', value: 'off', checked: !view.dustMode },
          { label: '遮蔽（开始前隐藏）', value: 'on', checked: view.dustMode },
        ],
        (value) => this.host.onConfigChange({ dustMode: value === 'on' }),
      ),
      this.chipRow(
        '观察模式',
        [
          { label: '完整', value: 'full', checked: view.observationMode === 'full' },
          { label: '三面', value: 'three_faces', checked: view.observationMode === 'three_faces' },
          { label: '单面', value: 'single_face', checked: view.observationMode === 'single_face' },
          { label: '操作后', value: 'after_move', checked: view.observationMode === 'after_move' },
          { label: '受限', value: 'restricted', checked: view.observationMode === 'restricted' },
        ],
        (value) =>
          this.host.onConfigChange({
            observationMode: value as ConfigView['observationMode'],
          }),
      ),
      this.chipRow(
        '参与者',
        [
          { label: '人类', value: 'human', checked: view.participant === 'human' },
          { label: 'AI Agent', value: 'agent', checked: view.participant === 'agent' },
        ],
        (value) => this.host.onConfigChange({ participant: value === 'agent' ? 'agent' : 'human' }),
      ),
      this.puzzleRow(view),
    );
  }

  private chipRow(
    label: string,
    options: readonly { label: string; value: string; checked: boolean }[],
    onPick: (value: string) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'slot-row';
    const text = document.createElement('span');
    text.className = 'slot-row__label';
    text.textContent = label;
    const slots = document.createElement('div');
    slots.className = 'slots slots--wrap';
    slots.setAttribute('role', 'radiogroup');
    slots.setAttribute('aria-label', label);
    for (const option of options) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'slot-chip';
      chip.dataset.checked = String(option.checked);
      chip.setAttribute('role', 'radio');
      chip.setAttribute('aria-checked', String(option.checked));
      chip.textContent = option.label;
      chip.addEventListener('click', () => onPick(option.value));
      slots.append(chip);
    }
    row.append(text, slots);
    return row;
  }

  private puzzleRow(view: ConfigView): HTMLElement {
    const row = document.createElement('div');
    row.className = 'slot-row';
    const text = document.createElement('span');
    text.className = 'slot-row__label';
    text.textContent = '题目';
    const slots = document.createElement('div');
    slots.className = 'slots slots--wrap';
    slots.setAttribute('role', 'radiogroup');
    slots.setAttribute('aria-label', '题目来源');

    const sources: { label: string; value: ChallengeConfig['puzzleSource'] }[] = [
      { label: '随机', value: 'random' },
      { label: '题库', value: 'preset' },
      { label: 'seed', value: 'seed' },
    ];
    for (const source of sources) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'slot-chip';
      chip.dataset.checked = String(view.puzzleSource === source.value);
      chip.setAttribute('role', 'radio');
      chip.setAttribute('aria-checked', String(view.puzzleSource === source.value));
      chip.textContent = source.label;
      chip.addEventListener('click', () => this.host.onConfigChange({ puzzleSource: source.value }));
      slots.append(chip);
    }

    if (view.puzzleSource === 'preset') {
      const select = document.createElement('select');
      select.className = 'config__select';
      select.setAttribute('aria-label', '选择预设题');
      for (const option of view.presets) {
        const opt = document.createElement('option');
        opt.value = option.id;
        opt.textContent = option.label;
        opt.selected = view.presetId === option.id;
        select.append(opt);
      }
      if (view.presetId === null) select.selectedIndex = 0;
      select.addEventListener('change', () => this.host.onConfigChange({ presetId: select.value }));
      slots.append(select);
    }

    if (view.puzzleSource === 'seed') {
      const input = document.createElement('input');
      input.className = 'config__input';
      input.type = 'text';
      input.maxLength = 32;
      input.placeholder = '1–32 位 seed';
      input.setAttribute('aria-label', '指定 seed');
      input.value = view.seedText;
      input.addEventListener('change', () =>
        this.host.onConfigChange({ seedText: input.value.trim() || '' }),
      );
      slots.append(input);
    }

    row.append(text, slots);
    return row;
  }
}
