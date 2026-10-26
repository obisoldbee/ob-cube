/**
 * storage.ts —— localStorage 的唯一封装（SPEC §7、ARCHITECTURE §10）
 *
 * 纪律：
 *  - 命名空间 `ob-cube:v1:*`，版本化键名，不裸写业务键
 *  - 写入失败**不得静默丢弃**：配额不足抛 `CubeError('E_STORAGE_FULL')`，
 *    上层据此提示「清理历史」而不是假装成功
 *  - 读取不做「失败即当空」：损坏必须被上层看见（`reason: 'corrupt'` + 原始串），
 *    否则「这次运行的记录无法读取」这个状态永远触发不了
 */

import { CubeError } from '../contracts';

export const NAMESPACE = 'ob-cube:v1';

export type ReadFailureReason = 'missing' | 'corrupt' | 'unavailable';

export type ReadResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: ReadFailureReason; readonly raw: string | null };

export function namespaced(key: string): string {
  return `${NAMESPACE}:${key}`;
}

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'QuotaExceededError') return true;
  if (error.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  const code = (error as { code?: number }).code;
  return code === 22 || code === 1014;
}

export class LocalStore {
  private readonly backend: Storage | null;

  constructor(backend?: Storage | null) {
    this.backend = backend === undefined ? detectStorage() : backend;
  }

  /** 隐私模式 / 被禁用时为 false —— UI 显示常驻提示条，但功能不降级 */
  get available(): boolean {
    return this.backend !== null;
  }

  read(key: string): ReadResult<string> {
    if (!this.backend) return { ok: false, reason: 'unavailable', raw: null };
    let raw: string | null = null;
    try {
      raw = this.backend.getItem(namespaced(key));
    } catch {
      return { ok: false, reason: 'unavailable', raw: null };
    }
    if (raw === null) return { ok: false, reason: 'missing', raw: null };
    return { ok: true, value: raw };
  }

  readJson<T>(key: string): ReadResult<T> {
    const raw = this.read(key);
    if (!raw.ok) return raw;
    try {
      return { ok: true, value: JSON.parse(raw.value) as T };
    } catch {
      return { ok: false, reason: 'corrupt', raw: raw.value };
    }
  }

  /** 写失败一律抛 E_STORAGE_FULL（含隐私模式），绝不 return false 让调用方忘检 */
  writeJson(key: string, value: unknown): void {
    if (!this.backend) {
      throw new CubeError('E_STORAGE_FULL', '浏览器存储不可用，本次结果不会被保存', '可点导出 JSON 手动留存');
    }
    let payload: string;
    try {
      payload = JSON.stringify(value);
    } catch {
      throw new CubeError('E_STORAGE_FULL', '记录无法序列化', '记录中含循环引用或不可序列化字段');
    }
    try {
      this.backend.setItem(namespaced(key), payload);
    } catch (error) {
      const hint = isQuotaError(error) ? '清理历史记录后重试' : '浏览器拒绝了写入，可能处于隐私模式';
      throw new CubeError('E_STORAGE_FULL', '本地存储写入失败', hint);
    }
  }

  remove(key: string): void {
    if (!this.backend) return;
    try {
      this.backend.removeItem(namespaced(key));
    } catch {
      // 删除失败不影响内存态，上层已有可见状态
    }
  }

  /** 只返回本命名空间的键（去掉前缀） */
  keys(): string[] {
    if (!this.backend) return [];
    const out: string[] = [];
    const prefix = `${NAMESPACE}:`;
    try {
      for (let i = 0; i < this.backend.length; i += 1) {
        const key = this.backend.key(i);
        if (key && key.startsWith(prefix)) out.push(key.slice(prefix.length));
      }
    } catch {
      return out;
    }
    return out;
  }

  /** 本命名空间当前占用的 UTF-16 字节数估计（PRD §11 的 4MB 提示阈值） */
  usageBytes(): number {
    if (!this.backend) return 0;
    let total = 0;
    let prefixCount = 0;
    const prefix = `${NAMESPACE}:`;
    try {
      for (let i = 0; i < this.backend.length; i += 1) {
        const key = this.backend.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        const value = this.backend.getItem(key);
        if (value !== null) total += (key.length + value.length) * 2;
        prefixCount += 1;
      }
    } catch {
      return 0;
    }
    return prefixCount === 0 ? 0 : total;
  }
}

function detectStorage(): Storage | null {
  try {
    const probe = `${NAMESPACE}:__probe__`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export const store = new LocalStore();
