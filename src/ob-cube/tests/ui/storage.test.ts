import { describe, expect, it } from 'vitest';
import { LocalStore } from '../../src/services/storage';
import { HistoryService } from '../../src/services/history';
import { coerceSettings, DEFAULT_SETTINGS, SettingsService } from '../../src/services/settings';
import { CubeError, isCubeError } from '../../src/contracts';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  quotaLeft = Infinity;
  throwOnWrite = false;

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
    if (this.throwOnWrite) {
      const error = new Error('quota');
      error.name = 'QuotaExceededError';
      throw error;
    }
    if (value.length > this.quotaLeft) {
      const error = new Error('quota');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

describe('localStorage 封装（SPEC §7）', () => {
  it('键名一律带 ob-cube:v1 命名空间', () => {
    const backend = new MemoryStorage();
    const store = new LocalStore(backend);
    store.writeJson('settings', { a: 1 });
    expect(backend.key(0)).toBe('ob-cube:v1:settings');
  });

  it('配额不足抛 E_STORAGE_FULL，而不是静默丢弃', () => {
    const backend = new MemoryStorage();
    backend.quotaLeft = 2;
    const store = new LocalStore(backend);
    try {
      store.writeJson('runs', { payload: 'x'.repeat(64) });
      throw new Error('应当抛出');
    } catch (error) {
      expect(isCubeError(error)).toBe(true);
      expect((error as CubeError).code).toBe('E_STORAGE_FULL');
      expect((error as CubeError).hint).toContain('清理历史');
    }
  });

  it('存储不可用时 available=false，写入抛 E_STORAGE_FULL', () => {
    const store = new LocalStore(null);
    expect(store.available).toBe(false);
    expect(() => store.writeJson('settings', {})).toThrowError(/存储不可用/);
    expect(store.read('settings')).toEqual({ ok: false, reason: 'unavailable', raw: null });
  });

  it('损坏记录返回 corrupt 并带上原始串，不当作空值吞掉', () => {
    const backend = new MemoryStorage();
    backend.setItem('ob-cube:v1:settings', '{ not json');
    const store = new LocalStore(backend);
    const read = store.readJson('settings');
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.reason).toBe('corrupt');
      expect(read.raw).toBe('{ not json');
    }
  });
});

describe('设置服务', () => {
  it('单字段损坏只回落该字段，不整份丢弃', () => {
    const { settings, repaired } = coerceSettings({ cubeSize: 9, keymapCollapsed: true });
    expect(repaired).toBe(true);
    expect(settings.cubeSize).toBe(DEFAULT_SETTINGS.cubeSize);
    expect(settings.keymapCollapsed).toBe(true);
  });

  it('写入失败不影响本次会话，但留下可见错误', () => {
    const backend = new MemoryStorage();
    backend.throwOnWrite = true;
    const service = new SettingsService(new LocalStore(backend));
    service.patch({ cubeSize: 4 });
    expect(service.get().cubeSize).toBe(4);
    expect(service.getError()).toContain('写入失败');
  });
});

describe('历史记录仓储（PRD §9.3）', () => {
  const result = (id: string) =>
    ({
      rules: { run_id: id, cube_size: 3, challenge_id: 'cb3-1', seed: null },
      status: 'ended_solved',
      solved: true,
      move_count: 10,
      elapsed_ms: 1000,
      tps: 10,
      events: [],
      initial_fingerprint: 'a',
      final_fingerprint: 'b',
      ended_reason: null,
    }) as never;

  it('保存后可列出，按时间倒序', () => {
    const store = new LocalStore(new MemoryStorage());
    const history = new HistoryService(store);
    history.save(result('r1'), new Date('2026-01-01T00:00:00Z'));
    history.save(result('r2'), new Date('2026-01-02T00:00:00Z'));
    const snapshot = history.list();
    expect(snapshot.records.map((record) => record.id)).toEqual(['r2', 'r1']);
    expect(snapshot.corrupt).toHaveLength(0);
  });

  it('单条记录损坏不会毁掉整份历史，且能被识别出来', () => {
    const backend = new MemoryStorage();
    const store = new LocalStore(backend);
    const history = new HistoryService(store);
    history.save(result('r1'), new Date('2026-01-01T00:00:00Z'));
    history.save(result('r2'), new Date('2026-01-02T00:00:00Z'));
    backend.setItem('ob-cube:v1:run:r1', 'broken');
    const snapshot = history.list();
    expect(snapshot.records.map((record) => record.id)).toEqual(['r2']);
    expect(snapshot.corrupt.map((entry) => entry.id)).toEqual(['r1']);
    expect(snapshot.corrupt[0]?.raw).toBe('broken');
  });

  it('删除一条记录只影响它自己', () => {
    const store = new LocalStore(new MemoryStorage());
    const history = new HistoryService(store);
    history.save(result('r1'));
    history.save(result('r2'));
    history.remove('r1');
    expect(history.list().records.map((record) => record.id)).toEqual(['r2']);
  });
});
