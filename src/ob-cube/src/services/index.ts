/**
 * services/index.ts —— UI 访问持久化的唯一通道
 *
 * 纪律：`src/ui/**` 不得直接 import `services/storage.ts`，只能从这里进。
 * 这样存储实现（localStorage → IndexedDB）变更时，UI 一行都不用改。
 */

import { HistoryService } from './history';
import { SettingsService } from './settings';
import { store } from './storage';

export { LocalStore, store, NAMESPACE, namespaced } from './storage';
export type { ReadResult, ReadFailureReason } from './storage';
export {
  SettingsService,
  DEFAULT_SETTINGS,
  DEFAULT_CHALLENGE_CONFIG,
  coerceSettings,
  isLegalMoveLimit,
  isLegalSeedText,
  isLegalTimeLimitSec,
  isObservationMode,
  TIME_LIMIT_RANGE,
} from './settings';
export type { AppSettings, ChallengeConfig } from './settings';
export { HistoryService, MAX_RECORDS } from './history';
export type { RunRecord, HistorySnapshot, CorruptRecord } from './history';

export const settings = new SettingsService(store);
export const history = new HistoryService(store);
