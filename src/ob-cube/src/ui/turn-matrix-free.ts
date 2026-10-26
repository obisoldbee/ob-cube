/**
 * turn-matrix-free.ts —— tab「自由层」（PRD §5.3.2 保障 3 的鼠标完备性兜底）
 *
 * 形态：单轴 + 层槽多选 + 3 个转向键 = 8 个控件（4 阶），三轴全展开会破 19 峰值。
 *
 * 两个决策（文档未写死，理由见此处）：
 *  1. 三个转向按钮的可见标签直接用**按当前勾选算出的 Singmaster**（`2R` / `2R'` / `2R2`），
 *     而不是「顺时针 / 逆时针 / 180°」——反模式检查第 6 条只允许转动按钮出现 ASCII 记法，
 *     且这样标签与真正提交的指令一字不差，用户不必在脑子里做映射。
 *  2. 非法组合（勾满全部层）前置拦截：最后一个槽不可勾、三个按钮 aria-disabled、
 *     「将提交」显示 `—`，让用户在按下之前就知道不合法，而不是按下后吃错误码。
 */

import type { CubeSize, FaceId } from '../contracts';
import type { LayerSpec, PrefixChar, TurnIntent } from './keymap';
import { FACE_ZH } from './keymap';
import {
  canSelectLayer,
  FREE_AXES,
  freeLayerSpec,
  freePrefixOf,
} from './turn-matrix-data';
import { describeMove } from './move-preview';

export interface FreePanelHost {
  onTurn(intent: TurnIntent): void;
  onPrefixSync(prefix: PrefixChar | null): void;
  onHover(target: { face: FaceId; layers: LayerSpec } | null): void;
}

const AMOUNTS = [1, 2, 3] as const;

export class FreePanel {
  readonly el: HTMLElement;
  private axis: FaceId = 'R';
  private selected: number[] = [1];
  private size: CubeSize;
  private readonly rowAxis: HTMLElement;
  private readonly rowLayers: HTMLElement;
  private readonly previewEl: HTMLElement;
  private readonly turnsEl: HTMLElement;

  constructor(
    size: CubeSize,
    private readonly host: FreePanelHost,
  ) {
    this.size = size;
    this.el = document.createElement('div');
    this.el.className = 'matrix__free';
    this.rowAxis = document.createElement('div');
    this.rowAxis.className = 'slot-row';
    this.rowLayers = document.createElement('div');
    this.rowLayers.className = 'slot-row';
    this.previewEl = document.createElement('div');
    this.previewEl.className = 'matrix__preview';
    this.turnsEl = document.createElement('div');
    this.turnsEl.className = 'matrix__turns';
    this.el.append(this.rowAxis, this.rowLayers, this.turnsEl);
    this.render();
  }

  setSize(size: CubeSize): void {
    if (size === this.size) return;
    this.size = size;
    this.selected = this.selected.filter((l) => l <= size);
    if (this.selected.length === 0) this.selected = [1];
    this.render();
  }

  private spec(): LayerSpec {
    return freeLayerSpec(this.size, this.selected);
  }

  private render(): void {
    this.renderAxis();
    this.renderLayers();
    this.renderTurns();
  }

  private renderAxis(): void {
    this.rowAxis.replaceChildren();
    const label = document.createElement('span');
    label.className = 'slot-row__label';
    label.textContent = '轴';
    const group = document.createElement('div');
    group.className = 'slots';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', '选择转动轴');
    for (const axis of FREE_AXES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot-chip';
      btn.dataset.checked = String(axis === this.axis);
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', String(axis === this.axis));
      btn.textContent = axis;
      btn.title = `${FACE_ZH[axis]}所在的轴`;
      btn.addEventListener('click', () => {
        this.axis = axis;
        this.render();
      });
      group.append(btn);
    }
    this.rowAxis.append(label, group);
  }

  private renderLayers(): void {
    this.rowLayers.replaceChildren();
    const label = document.createElement('span');
    label.className = 'slot-row__label';
    label.textContent = '层';
    const slots = document.createElement('div');
    slots.className = 'slots';
    slots.setAttribute('role', 'group');
    slots.setAttribute('aria-label', '选择要转动的层');

    for (let layer = 1; layer <= this.size; layer += 1) {
      const checked = this.selected.includes(layer);
      const selectable = canSelectLayer(this.size, this.selected, layer);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'slot-chip';
      chip.dataset.checked = String(checked);
      chip.setAttribute('aria-pressed', String(checked));
      chip.textContent = String(layer);
      chip.title = checked
        ? `取消第 ${layer} 层`
        : selectable
          ? `选中第 ${layer} 层`
          : '全层转动请用视角旋转';
      if (!selectable) chip.setAttribute('aria-disabled', 'true');
      chip.addEventListener('click', () => {
        if (!canSelectLayer(this.size, this.selected, layer)) return;
        this.selected = checked
          ? this.selected.filter((l) => l !== layer)
          : [...this.selected, layer].sort((a, b) => a - b);
        if (this.selected.length === 0) this.selected = [layer];
        this.render();
        this.host.onPrefixSync(freePrefixOf(this.size, this.selected));
      });
      slots.append(chip);
    }

    const preview = describeMove(this.turnIntent(1), this.size);
    this.previewEl.replaceChildren(document.createTextNode('将提交：'));
    const bold = document.createElement('b');
    bold.textContent = preview.legal ? preview.move : '—';
    bold.dataset.illegal = String(!preview.legal);
    this.previewEl.append(bold);
    this.previewEl.dataset.illegal = String(!preview.legal);
    this.rowLayers.append(label, slots, this.previewEl);
  }

  private turnIntent(amount: 1 | 2 | 3): TurnIntent {
    return { face: this.axis, layers: this.spec(), amount, source: 'free-layer' };
  }

  private renderTurns(): void {
    this.turnsEl.replaceChildren();
    for (const amount of AMOUNTS) {
      const intent = this.turnIntent(amount);
      const desc = describeMove(intent, this.size);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'turn-btn';
      btn.textContent = desc.legal ? desc.move : '—';
      btn.setAttribute('aria-label', `${FACE_ZH[this.axis]}自由层：${desc.legal ? desc.move : '当前组合不合法'}`);
      if (!desc.legal) btn.setAttribute('aria-disabled', 'true');
      btn.addEventListener('click', () => {
        if (!describeMove(this.turnIntent(amount), this.size).legal) return;
        this.host.onTurn(this.turnIntent(amount));
        this.host.onPrefixSync(null);
      });
      btn.addEventListener('pointerenter', () => this.host.onHover({ face: this.axis, layers: this.spec() }));
      btn.addEventListener('pointerleave', () => this.host.onHover(null));
      this.turnsEl.append(btn);
    }
  }
}
