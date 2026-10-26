// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LocalStore } from '../../src/services/storage';
import { TelemetryService } from '../../src/services/telemetry';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

describe('PRD §11.1 本地埋点', () => {
  it('开关开启时事件落盘，字段含公共属性且不含个人信息', () => {
    const store = new LocalStore(new MemoryStorage());
    const telemetry = new TelemetryService(store, () => true);
    telemetry.track('page_view', { referrer_type: 'direct', device: 'desktop' });
    telemetry.flush();
    const events = telemetry.list();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      name: 'page_view',
      version: expect.stringContaining('ob-cube'),
      device_class: expect.stringMatching(/desktop|mobile/),
    });
    expect(events[0]?.session_id).toMatch(/^s-/);
    expect(JSON.stringify(events[0])).not.toMatch(/ip|email|user_agent/i);
  });

  it('开关关闭后不写任何事件', () => {
    const store = new LocalStore(new MemoryStorage());
    const telemetry = new TelemetryService(store, () => false);
    telemetry.track('move_made', { move: 'R' });
    telemetry.flush();
    expect(telemetry.list()).toHaveLength(0);
  });

  it('环形缓冲上限 500 条，旧事件被淘汰', () => {
    const store = new LocalStore(new MemoryStorage());
    const telemetry = new TelemetryService(store, () => true);
    for (let i = 0; i < 520; i += 1) {
      telemetry.track('move_made', { step_index: i });
    }
    telemetry.flush();
    const events = telemetry.list();
    expect(events).toHaveLength(500);
    expect(events.at(-1)?.props.step_index).toBe(519);
  });

  it('存储不可用时保留内存队列，不抛异常', () => {
    const telemetry = new TelemetryService(new LocalStore(null), () => true);
    expect(() => {
      telemetry.track('challenge_started', { cube_size: 3 });
      telemetry.flush();
    }).not.toThrow();
    expect(telemetry.list()).toHaveLength(1);
  });
});
