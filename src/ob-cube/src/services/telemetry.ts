/**
 * telemetry.ts —— 本地数据埋点（PRD §11.1，v2.0 降为 P1）
 *
 * 纯前端、不外发：事件先入内存队列，并随每次 flush 写入 localStorage 的
 * `ob-cube:v1:telemetry` 键（环形缓冲，最多 500 条）。关闭开关后**不写任何事件**。
 *
 * 不采集：IP、原始输入内容、任何可识别个人的信息，不做设备指纹。
 */

import { ENGINE_VERSION } from '../contracts';
import type { LocalStore } from './storage';

export type TelemetryName =
  | 'page_view'
  | 'challenge_config_submitted'
  | 'challenge_started'
  | 'first_move_made'
  | 'move_made'
  | 'view_rotated'
  | 'challenge_paused'
  | 'challenge_resumed'
  | 'move_merged_to_half_turn'
  | 'run_again_clicked'
  | 'replay_opened'
  | 'summary_copied'
  | 'illegal_move_rejected'
  | 'api_error'
  | 'render_stall'
  | 'storage_unavailable';

export interface TelemetryEvent {
  readonly name: TelemetryName;
  readonly client_time: string;
  readonly session_id: string;
  readonly version: string;
  readonly device_class: 'desktop' | 'mobile';
  readonly props: Readonly<Record<string, string | number | boolean | null>>;
}

const KEY = 'telemetry';
const MAX_EVENTS = 500;

function deviceClass(): 'desktop' | 'mobile' {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'desktop';
  return /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
}

export class TelemetryService {
  private readonly sessionId = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  private queue: TelemetryEvent[] = [];

  constructor(
    private readonly store: LocalStore,
    private readonly enabled: () => boolean,
  ) {}

  track(name: TelemetryName, props: TelemetryEvent['props'] = {}): void {
    if (!this.enabled()) return;
    const event: TelemetryEvent = {
      name,
      client_time: new Date().toISOString(),
      session_id: this.sessionId,
      version: ENGINE_VERSION,
      device_class: deviceClass(),
      props,
    };
    this.queue.push(event);
    if (this.queue.length >= 20) this.flush();
  }

  /** 把内存队列并入持久化环形缓冲；存储不可用时保留内存事件，不抛异常 */
  flush(): void {
    if (!this.enabled() || this.queue.length === 0) return;
    if (!this.store.available) {
      this.queue = this.queue.slice(-MAX_EVENTS);
      return;
    }
    try {
      const read = this.store.readJson<unknown>(KEY);
      const existing = read.ok && Array.isArray(read.value) ? (read.value as TelemetryEvent[]) : [];
      const merged = [...existing, ...this.queue].slice(-MAX_EVENTS);
      this.store.writeJson(KEY, merged);
      this.queue = [];
    } catch {
      this.queue = this.queue.slice(-MAX_EVENTS);
    }
  }

  /** 已落盘事件（测试与本地排查用） */
  list(): TelemetryEvent[] {
    const read = this.store.readJson<unknown>(KEY);
    if (!read.ok || !Array.isArray(read.value)) return [...this.queue];
    return [...(read.value as TelemetryEvent[]), ...this.queue];
  }

  clear(): void {
    this.queue = [];
    if (this.store.available) this.store.remove(KEY);
  }
}
