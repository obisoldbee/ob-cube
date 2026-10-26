/**
 * 极小的同步事件发射器。用途只有一个：让 UI 在「挑战状态变化」时被动刷新，
 * 而不需要轮询 session。它不持有任何业务语义，也不做异步调度。
 */

export type Listener<T> = (payload: T) => void;

export interface Emitter<T> {
  on(listener: Listener<T>): () => void;
  off(listener: Listener<T>): void;
  emit(payload: T): void;
  clear(): void;
  readonly size: number;
}

export function createEmitter<T>(): Emitter<T> {
  const listeners = new Set<Listener<T>>();
  return {
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    off(listener) {
      listeners.delete(listener);
    },
    emit(payload) {
      // 复制一份再遍历：监听器里注销自己不会打断本次分发
      for (const listener of [...listeners]) listener(payload);
    },
    clear() {
      listeners.clear();
    },
    get size() {
      return listeners.size;
    },
  };
}
