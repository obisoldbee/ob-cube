# PRD v2.0 · 数据模型

> 本文件是 [`docs/specs/PRD.md`](../PRD.md) 主文件的子章节 **08**。
> 权威级别：**产品需求（What / Why）**。实现契约见 `docs/specs/execution/`，设计规范见 `docs/specs/execution/ui-*.md`。
> 冲突裁定：本文件与 `execution/` 冲突时以本文件为准；AC 编号唯一真源见 [`11-appendix.md`](11-appendix.md) 附录 C。
>
> 含 v1.10 的 §13 数据模型。**字段名已按 `src/ob-cube/src/contracts.ts` 冻结契约对齐**，见本章修订说明。

---

## 13. 数据模型

> **v2.0 权威声明：本章定义字段的产品语义，字面真源是 `src/ob-cube/src/contracts.ts`（冻结文件）。**
> 两者不一致时**不是"谁优先级高谁赢"，而是一个待修缺陷**——按 [`../PRD.md`](../PRD.md) §1.3 的规则记裁定、改一侧。本章下面的表格保留 v1.10 的字段名以便与历史评审对照，**实际编码一律用右侧的代码字段名**。

### 13.0 v1.10 字段名 → 代码字段名对照（v2.0 新增，编码前必查）

| v1.10 写的 | 代码实际（`contracts.ts`） | 说明 |
|---|---|---|
| `Challenge` | **`ChallengeRules`** | 类型名不同 |
| `gen_mode`（`random_moves` / `preset` / `imported` / `random_state`） | **`scramble_method`**（`'random_moves' \| 'seeded_moves'`）+ `preset_id` | **`gen_mode` 这个字段名在代码里不存在。**"预设题"不是 `scramble_method` 的取值，而是 `preset_id !== null` + `scramble_method === 'seeded_moves'`。`imported` / `random_state` 是 v2 预留值，代码里没有 |
| `state_fingerprint`（题面初始指纹） | **`initial_fingerprint`**（在 `ChallengeResult` 上） | 初始/最终两个指纹都在结果对象上；挑战结束前不得落盘或经 API 返回（AC-15 / AC-77） |
| `Run` | **`ChallengeResult`** | 类型名不同 |
| `Run.result`（`solved` / `timeout` / …） | **`ChallengeResult.status`**（`ended_solved` / `ended_timeout` / …）+ `ended_reason` | 结局名映射见 [`02-user-flow.md`](02-user-flow.md) §2.1；`internal_error` 不设独立终态，走 `ended_reason` |
| `Run.metrics`（嵌套对象） | **平铺在 `ChallengeResult` 根上**：`elapsed_ms` / `move_count` / `tps` / `pause_count` / `paused_total_ms` / `htm_layer_count` / `qtm_count` | 没有 `metrics` 这一层。v1.10 §7.2 的 7 项计时指标只落了 `elapsed_ms`，其余见该章的交付状态列 |
| `Run.events`（`MoveEvent \| ViewEvent \| SessionEvent` 三类型） | **`RunEvent[]` 单一类型 + `type` 七值**（`move` / `view` / `start` / `pause` / `resume` / `submit` / `end`） | 见 §13.4 |
| `Run.observations`（`ObservationEvent[]` 独立数组） | **无此字段**。观察信息以 `RunEvent.observation_id` 关联，`observation_lag` 由事件流推导 | v1.10 §13.5 的 `ObservationEvent` 表在代码里没有对应类型 |
| `Run.truncated` | **无此字段** | 2000 条事件上限与截断标记未实现，P1 |
| `Run.device_class` | **无此字段** | 埋点整体降 P1，见 [`09-contract-nfr.md`](09-contract-nfr.md) §11.1 |
| `Run.agent_meta` | **无此字段** | v1.10 §13.3 与 §9.1「运行信息区」要求它，代码未落盘。**已交付的 `ChallengeResult` 里没有 Agent 元信息**——这是 §9.1 表格标"已交付"的一处例外，实测由配置页手填但未持久化，P1 补 |
| `MoveEvent.index` | **`RunEvent.seq`** | |
| `MoveEvent.submitted_at_ms` | **`RunEvent.at_ms`** | |
| `MoveEvent.state_fingerprint_after` | **`RunEvent.to_fingerprint`**（另有 `from_fingerprint`） | 代码多存一个"操作前指纹"，v1.10 没有；这是增益不是冲突 |
| `RunConfig`（8 字段） | **`ChallengeConfig`**（UI 层，7 字段）+ 散落在 `AppSettings` 的开关 | `observation_mode` / `observation_limit` / `auto_submit_on_solved` / `animation_ms` **不在 `ChallengeConfig` 里**：前两个随 F14 降 P1 且无入口；`autoSubmitOnSolved` 与 `mergeDoubleTap` 在 `AppSettings` 顶层；`animation_ms` 不是配置项而是 150ms 设计常量 |
| `time_limit_ms` | **`timeLimitSec`**（UI 层，秒）→ `time_limit_ms`（记录层，毫秒） | 两层单位不同，转换在 wiring 层 |
| `notation_version`（自由字符串） | **`notation_version: 'ss-2'`**（字面量类型） | 代码用字面量类型把它钉死，改版本号必须改类型，编译期即拦 |
| `OBSERVATION_DENIED` | 三个独立码 | 见 [`09-contract-nfr.md`](09-contract-nfr.md) §12.1 |
| `INVALID_STATE` | **不存在** | 见 AC-12 / AC-26 的 v2.0 修订 |

### 13.1 题面（`ChallengeRules`）

> **可复现四件套（缺一即不可逆降级）**：`scramble` + `gen_version`（算法版本）+ `notation_version`（记法版本，钉死为 `'ss-2'`）+ `initial_fingerprint`（初始状态指纹）。这四样必须在**第一版就存全**——当时没存，历史记录就永久变成"无法验证的静态数字"，且无法事后补。**四项在代码里都已落盘**（`ChallengeRules` + `ChallengeResult.initial_fingerprint`）。

| 字段 | 类型 | 说明 |
|---|---|---|
| `challenge_id` | string | 唯一 ID |
| `cube_size` | 2 \| 3 \| 4 | 阶数 |
| `gen_mode` | `random_moves` \| `preset`（v1.1）\| `imported`（v2 预留）\| `random_state`（v2 预留） | 生成方式（必须区分，见 §6.5）。v1 只能产出 `random_moves`；v1.1 增加 `preset`；`imported` 与 `random_state` 在 v1/v1.1 不得产出 |
| `preset_id` | string \| null | 预设题 ID；`gen_mode === "preset"` 时必填，其余为 `null` |
| `seed` | string \| null | 随机种子；`preset` 时由题库锁定；`imported` 时为 `null` |
| `scramble` | string \| null | 打乱序列（Singmaster）；`preset` / `random_moves` 必填；`imported` 时为 `null` |
| `facelet_string` | string \| null | 把每个面按行展开拼接的 facelet 串。**在 `ready`/`running`/`paused`/`solved_pending` 期间只在内存中持有，不得落盘、不得经 API 返回**（§8.2 C3）；挑战结束后随 `Run` 落盘 |
| `state_fingerprint` | string | `facelet_string` 的 **FNV-1a** 哈希（不引入 crypto 依赖），前 8 位用于 UI 展示与"同题面"比对。**只用于一致性校验，不得用于反推颜色**；挑战结束前不得落盘/返回 |
| `state_snapshot` | — | **v1 不存**。已由架构师裁决（§16.2 Q2 关闭）：**不存打乱后的状态快照，改为"重放打乱序列 + 指纹校验"**。载入时重放 `scramble` 得到状态，再用 `state_fingerprint` 校验一致；不一致即报 `INVALID_STATE` 并拒绝进入 `ready` |
| `distance_is_estimated` | boolean | 最短解距离是否为估计值（本版恒为 `true`） |
| `estimated_distance` | number | 净有效步数作为代理值 |
| `difficulty_score` | number | §6.2 公式结果 |
| `difficulty_level` | `beginner` \| `standard` \| `hard` | 主等级 |
| `difficulty_tags` | string[] | `structure` / `long_sequence` / `observation` / `timed` / `dust` 等正交标签 |
| `structure_tag` | string \| null | 指定结构标签 |
| `gen_version` | string | 题目生成算法版本。**与 `notation_version`、`state_fingerprint`、`scramble` 四者共同构成可复现的最小信息集**，缺任一项历史记录即降级为不可验证的静态数字 |
| `notation_version` | string | **记法版本**。记法与 `describeMove` 的语义一旦变更（如新增阶数、调整命名规则），必须升版本号；载入旧题面时据此判断能否精确重放 |
| `created_at` | number | 时间戳 |

### 13.2 挑战配置（`RunConfig`）

| 字段 | 类型 | 说明 |
|---|---|---|
| `participant` | `human` \| `agent` | |
| `time_limit_ms` | number \| null | `null` = 不限时 |
| `move_limit` | number \| null | `null` = 不限步 |
| `dust_mode` | boolean | |
| `observation_mode` | `full` \| `three_face` \| `one_face` \| `after_move` \| `restricted` | |
| `observation_limit` | number \| null | `restricted` 模式下的观察次数上限；默认 10 |
| `double_tap_merge` | boolean | 180° 双击归并开关 |
| `auto_submit_on_solved` | boolean | 人类模式默认 `true`，Agent 模式默认 `false` |
| `animation_ms` | number | 转动动画时长，60–300，默认 150 |

### 13.3 运行（`Run`）

| 字段 | 类型 | 说明 |
|---|---|---|
| `run_id` | string | 唯一 ID |
| `challenge` | `Challenge` | 题面元信息（**不含状态快照**；由 `seed` + `scramble` + 版本 + 指纹重建） |
| `config` | `RunConfig` | |
| `agent_meta` | object \| null | `{name, version, prompt_version, tool_version, note}`，由 Agent 运行时的用户填写 |
| `started_at` / `ended_at` | number | 墙钟时间戳；活跃计时用单调时钟，只有 `metrics.elapsed_ms` 落盘 |
| `result` | `solved` \| `timeout` \| `move_limit` \| `aborted` \| `invalid_submission` \| `interrupted` \| `internal_error` | |
| `result_detail` | string | 人可读原因（v1.9 起暂停中不可能超时，"超时发生于暂停中"不再出现） |
| `metrics` | object | §7.2 全部计时指标（含 `elapsed_ms`、`wall_elapsed_ms`、`solved_at_ms`、`submit_ms`）+ `move_count` + `htm_layer_count` + `qtm_count` + `pause_count` + `paused_total_ms` |
| `events` | `(MoveEvent \| ViewEvent \| SessionEvent)[]` | 见 13.4 / 13.6；`SessionEvent` 为 `pause` / `resume` 事件，含 `at_ms` |
| `observations` | `ObservationEvent[]` | 见 13.5 |
| `truncated` | boolean | 事件是否被截断 |
| `engine_version` | string | 用于回放兼容性判断 |
| `device_class` | string | `desktop` / `tablet` / `mobile`（仅用于自用分析） |

### 13.4 转动事件（`MoveEvent`）

| 字段 | 说明 |
|---|---|
| `index` | 步序（0 起） |
| `raw_input` | 原始输入（`"R"` / `"2R"` / `"key:R"` 的来源标记） |
| `move` | 规范化指令（如 `"Rw'"`） |
| `axis` / `layer_set` / `layer_count` / `turn_amount` | §7.1 辅助字段 |
| `input_channel` | `keyboard` \| `button` \| `api` |
| `submitted_at_ms` | 相对开始的时间 |
| `state_fingerprint_after` | 操作后状态指纹 |
| `observation_id` | 本步基于哪次观察（人类为 `null`） |
| `merged_from` | 归并来源（如 `["R","R"]`），无归并时为 `null` |
| `ok` | 是否执行成功 |
| `error_code` | 失败时的错误码 |

**归并事件的字段取值（按 §5.4 纠正后的机制，实现时照此填）**

| 字段 | 归并后的取值 | 说明 |
|---|---|---|
| `move` | `"R2"` | 规范化记法，与 Agent 直接提交 `R2` 完全一致 |
| `turn_amount` | `180` | 不是 `90`；因为最终语义是半转 |
| `layer_count` / `layer_set` / `axis` | 与原单次 90° 相同 | 层与轴不变 |
| `raw_input` | 第一次按键的原始输入 | |
| `merged_from` | `["R","R"]` | 审计用；回放时按 `move` 播放，不按 `merged_from` 逐条重放 |
| `submitted_at_ms` | **第二次**按键的时间 | 用户视角"这一步完成了"的时刻 |
| `state_fingerprint_after` | 第二次执行同一 `(layerSet, amount)` 之后的真实指纹 | 与直接执行 `R2` 的指纹相同（AC-63 一致性） |

> 注意：`move_count` 是**由事件数派生**的，归并后事件数减 1，故 `move_count` 净增 1。**不得**出现"事件 1 条但 `move_count` 增 2"或反之的实现。

### 13.5 观察事件（`ObservationEvent`）

| 字段 | 说明 |
|---|---|
| `observation_id` | 唯一 ID |
| `at_ms` | 相对开始时间 |
| `mode` | 当次观察模式 |
| `view_orientation` | 视角（朝向 + 旋转） |
| `face_set` | 返回的面集合（**只存面名，不存颜色**，颜色由回放引擎重建） |
| `denied` | 是否被拒绝 |

> **设计意图**：不把颜色矩阵写进存储，一是省空间（4 阶单面 16 色 × 多次观察会迅速膨胀），二是让“初始状态 + 顺序重放事件”成为唯一真相源，避免存储与状态不一致。**指纹是哈希，不能反推颜色**；它只用于重放后的一致性校验。

### 13.6 视角事件（`ViewEvent`）

| 字段 | 说明 |
|---|---|
| `type` | 固定为 `"view"` |
| `at_ms` | 相对开始时间 |
| `axis` / `direction` / `steps` | 视角旋转轴、方向、步数 |
| `source` | `drag` \| `key` \| `button` \| `api` |

> `ViewEvent` 只记录观察方向变化，**不计步、不改变 `state_fingerprint`**；它不进入 `MoveEvent` 流，也不参与回放的步序索引（AC-47）。

---

