# 执行契约 · 持久化

> 所属：**执行侧文档树** `docs/specs/execution/`。产品口径见 [`../PRD.md`](../PRD.md)，架构总纲见 [`CONTRACT.md`](CONTRACT.md)，设计总纲见 [`UIUX.md`](UIUX.md)。
> 权威级别：**实现契约（How）**。与 `../prd/` 冲突时以 PRD 为准；AC 编号一律以 [`../prd/11-appendix.md`](../prd/11-appendix.md) 附录 C 为唯一真源。
> 来源：原 `ARCHITECTURE.md` v1.4 §10（持久化），**命名空间与上限已按代码修订**
> 本文件独占的主题：localStorage 命名空间、写入纪律、导入的安全边界、迁移策略。**其他文件不得重述，只能链接到此处。**

---

## 10. 持久化

### 10.1 命名空间

| key | 内容 | 上限策略 |
|---|---|---|
| `cube.v1.schema` | `{ version: 1, updated_at }` | 单条 |
| `cube.v1.puzzles` | `Record<challengeId, PuzzleRecord>` | 最多 500 条，按 `created_at` 淘汰 |
| `cube.v1.runs` | `Record<runId, RunRecord>` | 最多 100 条，按 `started_at` 淘汰 |
| `cube.v1.settings` | 界面与默认挑战配置 | 单条 |

### 10.2 写入纪律（钉死）

1. **禁止每次 `applyMove` 同步写 localStorage。** `localStorage.setItem` 是同步阻塞 API，一次 JSON 序列化 + 写入在 4 阶长日志下可达数毫秒，会直接吃掉 §8.5 的 8ms 帧预算，并且在限时挑战里造成「因为写盘所以超时」的荒谬结论。
2. 策略：**内存中维护当前 run，写入用 500ms debounce 合并**；以下四个时点**强制 flush**：`start`、`solve`、`submit`、`abort`，另加 `visibilitychange → hidden` 与 `beforeunload`。
3. 写入失败（配额溢出）必须捕获 `QuotaExceededError`，转成 `E_STORAGE_FULL` 并触发一次「淘汰最旧 run」的重试；重试一次仍失败则把当前 run 标记为 `unsaved: true` 并提示用户。**不得静默吞掉**——静默失败会让用户丢掉一次评测记录，这是本产品最贵的失败。
4. 读写一律经 `local-store.ts`，禁止任何模块直接 `localStorage.xxx`（用 lint 规则或 code review 拦截）。

### 10.3 导入的边界（安全约束，PRD §11 强制）

题面导入（PRD F15，优先级 P1）会引入外部 JSON，必须在 `puzzle/import-validate.ts` 里做四道检查，任何一道不过即 `ok:false`，且**不进入** `ready` 态（AC-12）：

| 检查 | 规则 | 错误码 |
|---|---|---|
| 体积 | 原始字符串 ≤ 256KB | `E_IMPORT_TOO_LARGE` |
| 键名安全 | 递归拒绝 `__proto__` / `constructor` / `prototype` 三个键 | `E_IMPORT_UNSAFE_KEY` |
| schema | 字段名、类型、阶数枚举、颜色 id 枚举逐项校验（不用「宽松反序列化后再说」） | `E_INVALID_STATE` |
| 可解性 | 颜色计数每色恰为 `N²`；§3.4 三步判定通过（含 `det = +1` 手性） | `E_INVALID_STATE` |

`JSON.parse` 本身不会污染原型（它不执行 setter），但后续 `Object.assign` / 递归合并会把 `__proto__` 变成真实赋值。因此检查必须在**任何合并之前**做，用 `Object.keys` 遍历而不是 `for...in`。

### 10.4 迁移

`schema.version` 只增不减。`migrations.ts` 维护 `v(n) → v(n+1)` 的幂等函数链。遇到高于当前版本的记录（用户回退了应用版本），**不得删除**，标记为 `E_SCHEMA_AHEAD` 并在历史列表里显示为「由更新版本创建，当前版本不可读」。

---

