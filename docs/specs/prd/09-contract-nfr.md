# PRD v2.0 · 错误码与非功能需求

> 本文件是 [`docs/specs/PRD.md`](../PRD.md) 主文件的子章节 **09**。
> 权威级别：**产品需求（What / Why）**。实现契约见 `docs/specs/execution/`，设计规范见 `docs/specs/execution/ui-*.md`。
> 冲突裁定：本文件与 `execution/` 冲突时以本文件为准；AC 编号唯一真源见 [`11-appendix.md`](11-appendix.md) 附录 C。
>
> 含 v1.10 的 §11 非功能需求、§12 错误处理。错误码表已按代码 `ERROR_CODES`（30 码）全量重写。

---

## 11. 非功能需求

| 类别 | 要求 | 优先级 |
|---|---|---|
| 性能 | 首屏可交互 < 3s（4G 中等机型）；转动动画稳定 50fps 以上；4 阶 96 贴纸场景下拖拽视角帧率 ≥ 40fps；单次 `applyMove` 引擎耗时 p95 < 5ms | P0 |
| 性能 | 回放 2000 条事件的跳转响应 < 300ms（靠关键帧） | P1 |
| 可用性 | 无单点故障依赖：纯静态资源，无任何外部 API 调用；无网络时除首次加载外全功能可用 | P0 |
| 可用性 | 挑战中途刷新/关闭页面，尽力保存已发生的记录：`running`/`paused` 标 `interrupted`，`solved_pending` 标 `solved`（§7.3） | P0 |
| 存储 | localStorage 单次运行记录压缩后 ≤ **200KB**（2000 条事件上限下）；总占用**达到或超过 4MB** 时触发"清理最旧记录"提示（不静默删除） | P0 |
| 安全 | 全站 HTTPS；无第三方脚本注入；不采集任何个人身份信息；无 Cookie | P0 |
| 安全 | **MVP 不提供导入功能**；若未来恢复导入，必须做严格 schema 校验，拒绝超大对象（> 256KB）与原型污染键（`__proto__` / `constructor` / `prototype`） | P1 |
| 兼容性 | Chrome / Edge / Safari / Firefox 最近 2 个大版本；最小窗口 1280×720；不支持 IE | P0 |
| 可访问性 | 键盘可达（所有按钮可 Tab 到达并有可见焦点环）；文字对比度 ≥ 4.5:1（正文）/ 3:1（大字）；**魔方操作本身不以颜色为唯一信息载体**（面视角按钮带文字标签，颜色差异同时有面名标注） | P1 |
| 可访问性 | 提供"高对比配色方案"开关（色弱友好，6 面颜色使用可区分的明度差） | P2 |
| 国际化 | 预留 i18n 文案接口，MVP 仅中文；数字与时间格式统一 `mm:ss.mmm` | P2 |
| 图标 | 统一 SVG 图标库，由架构师按项目选型锁定；本文所有图标描述均为文字（如"重置图标"），不使用图形字符代替 | P0 |
| 主题 | 深色竞技风；不使用紫色到粉色的渐变方案 | P0 |

### 11.0 v2.0 交付状态说明

上表是**要求**，不是现状。核对时间 2026-10-26，未达成项如下（完整证据见 `docs/reports/2026-10-26-implementation-status-report.md`）：

| 要求 | 状态 | 说明 |
|---|---|---|
| 单次 `applyMove` p95 < 5ms；4 阶拖拽 ≥ 40fps | **未测量** | `measureFrameBudget()` 已导出但无调用者，无 draw call / 帧间隔采样。AC-02 的 5ms 断言在 `tests/engine/` 里也没有 |
| 构建产物体积 | **有警告** | 单 chunk 719.15 KB（gzip 188.23 KB），Vite 报 >500KB 建议代码分割。P1 处理 |
| "4MB 触发清理最旧记录提示" | **未实现** | 当前只有事后抛 `E_STORAGE_FULL`；记录上限 50 条（`services/history.ts` 的 `MAX_RECORDS`） |
| "2000 条事件上限 + 截断标记 + `ViewEvent` 优先丢弃" | **未验证** | 无对应测试 |
| WebGL 失败降级 2D | **未实现** | 见 §12.2 第 7 条与 AC-53 |
| 可访问性：面中心字母（色盲三级之二） | **未实现** | `stickerLabels` 是死配置，`setMono()` 无调用者 |
| 可访问性：高对比配色开关 | **未实现（P2）** | 符合 P2 定级 |
| 图标统一 SVG、P0 字符零命中 | **已达成** | `lucide-static` 单一图标源；第四轮修复后构建产物扫描零命中 |
| 深色竞技风、禁紫粉渐变、禁弹跳缓动 | **已达成** | 见 `execution/ui-visual.md` |

### 11.1 数据埋点方案（**v2.0 整体降为 P1**）

> **v2.0 裁定：本节从"MVP 必须"降为 P1。**
>
> v1.10 写的是"MVP 必须埋点的事件（不埋等于上线后无法验证任何假设）"。实测结果：**全库零实现**——没有 `page_view`、没有 `move_made`、没有任何埋点代码，也没有内存队列与落盘逻辑。
>
> 这是一处典型的"PRD 单方面声明 P0、SPEC 锁定清单未收录、代码从未实现"的三角空洞（同类问题还有 F14 观察模式，见 [`01-product-scope.md`](01-product-scope.md) §3.3）。v2.0 的处理是**据实降级**而不是保留一个永远打不了钩的 P0：下表全部事件的优先级改为 P1，并在 P1 排期里与"观察模式配置入口"并列。
>
> 降级不影响产品定义——埋点是**运营侧**能力，不是"人机同台可比"这条产品地基的一部分。地基是统一引擎、seed 可复现、API 门控、操作记录与回放（见 `01-product-scope.md` §0 第 2 条），这四项都不依赖埋点。

以下为 P1 落地时的设计（纯前端方案，事件先入内存队列，随运行记录一起落 localStorage；不发送到任何远端）：

| 事件类别 | 事件名 | 触发时机 | 关键属性 |
|---|---|---|---|
| 获客 | `page_view` | 首次加载完成 | `referrer_type`（直接/外链/无）、`device`、`version` |
| 获客 | `challenge_config_submitted` | 点"创建挑战"且校验通过 | `cube_size`、`gen_mode`、`time_limit_ms`、`move_limit`、`dust_mode`、`observation_mode` |
| 激活 | `challenge_started` | 状态进入 `running` | `challenge_id`、`config_dwell_ms`（配置停留时长） |
| 激活 | `first_move_made` | 首次有效操作 | `time_to_first_move_ms`、`input_channel`（keyboard/button/api） |
| 活跃 | `move_made` | 每次有效操作 | `move`、`layer_count`、`turn_amount`、`input_channel`、`step_index` |
| 活跃 | `view_rotated` | 视角变化（节流 500ms） | `axis`、`method`（drag/key/button） |
| 活跃 | `challenge_paused` / `challenge_resumed` | 暂停 / 继续（仅人类） | `pause_index`、`elapsed_ms_at_pause`、`paused_duration_ms`（resume 时回填） |
| 活跃 | `move_merged_to_half_turn` | 双击归并触发 | `face`、`merged_from`、`window_ms`（两次按键间隔） |
| 留存 | `session_start` / `session_end` | 页面可见性变化 | `duration_ms`、`challenges_in_session` |
| 留存 | `run_again_clicked` | 点"再挑战一次"或"同题面重跑" | `same_challenge`（bool） |
| 转化 | `replay_opened` | 打开回放 | `challenge_id`、`result` |
| 转化 | `summary_copied` | 点"复制结果摘要" | `challenge_id` |
| 异常 | `illegal_move_rejected` | 引擎拒绝非法操作 | `raw_input`、`error_code` |
| 异常 | `api_error` | 任何 API 返回 `ok:false` | `method`、`error_code` |
| 异常 | `render_stall` | 帧间隔 > 100ms 连续 3 帧 | `cube_size`、`fps` |
| 异常 | `storage_unavailable` | localStorage 读写失败 | `reason`（quota/blocked） |

**埋点规范**：
- 命名：`{对象}_{动作}`，过去式（`move_made` 而非 `make_move`）。
- 公共属性：`session_id`、`client_time`、`version`、`device_class`、`cube_size`。
- **不采集**：IP、原始输入内容（只采集规范化后的指令）、任何可识别个人的信息。不做设备指纹。
- 埋点开关：配置页提供"本地使用统计（仅存本机，不外发）"开关，默认开；关闭后仍保留自用回放所需的最小事件，但不写埋点字段。

---

## 12. 错误处理

### 12.1 错误码表（产品口径短名）

> **v2.0 命名口径**：本表使用无前缀短名，便于在 PRD 与 AC 中叙述。**全名（`E_` 前缀）、完整 30 码清单、短名 ↔ 全名映射表一律以 [`../execution/agent-api.md`](../execution/agent-api.md) 为唯一权威**，字面真源是 `src/ob-cube/src/contracts.ts` 的 `ERROR_CODES`。本章不得自建第二张码表。
>
> **v1.10 的两处错误已修正**：① 它举例的 `E_INVALID_MOVE` 与 `E_PAUSED` **两个全名都不存在**（实为 `E_NOTATION_MALFORMED` 与 `E_CHALLENGE_PAUSED`）；② 它写"统一返回 `{ok:false, error_code, message?}`"，但实现是抛异常（见 [`07-agent-api.md`](07-agent-api.md) §7.3 裁定）。

| 短名 | 全名 | 语义 | 触发场景 | 用户/Agent 可见文案 |
|---|---|---|---|---|
| `NOT_STARTED` | `E_CHALLENGE_NOT_STARTED` | 尚未开始 | `idle` / `ready` 态调用 `observe` / `applyMove` | "挑战尚未开始，无法观察或操作。" |
| `NO_ACTIVE_CHALLENGE` | `E_NO_ACTIVE_CHALLENGE` | 无进行中的挑战 | 未创建挑战即调 `getChallengeInfo` | "还没有创建挑战。" |
| `CHALLENGE_ENDED` | `E_CHALLENGE_ENDED` | 已结束 | `ended_*` 态调用写操作，且结局不是超时/步数耗尽 | "挑战已结束。" |
| `TIMEOUT` | `E_DEADLINE_EXCEEDED` | 已超时 | `ended_timeout` 后任何写操作 | "已超过时间限制。" |
| `MOVE_LIMIT` | `E_MOVE_LIMIT_REACHED` | 步数耗尽 | `ended_move_limit` 后任何写操作 | "已达步数上限。" |
| `ALREADY_SOLVED` | `E_CUBE_ALREADY_SOLVED` | 已还原、待提交 | `solved_pending` 态调用 `applyMove` | "魔方已还原，请提交或继续观察。" |
| `INVALID_MOVE` | `E_NOTATION_MALFORMED` | 非法指令 | 记法解析失败（如 `R3`、`Xq`、空串） | "无法识别的操作：`{raw}`。" |
| —（记法细分） | `E_NOTATION_LOWERCASE` / `E_NOTATION_MULTIPLE_MOVES` | 小写记法 / 一次传多步 | v1.10 未列；实现把记法错误细分为三码以便 Agent 自我纠正 | "记法必须大写。" / "一次只能提交一步。" |
| `INVALID_LAYER` | `E_MOVE_LAYER_OUT_OF_RANGE` | 非法层 | 层索引超出该阶数范围（如 2 阶请求 3 层） | "当前阶数不支持该层操作。" |
| —（整轴全层） | `E_MOVE_COVERS_ALL_LAYERS` | 覆盖全 N 层 = 整体旋转 | 层集合等于整轴全部层 | "覆盖全部层等于整体旋转，请用视角操作。" |
| —（偶数阶切片） | `E_SLICE_NOT_AVAILABLE` | 偶数阶无中层 | N 为偶数时用 `M`/`E`/`S` | "偶数阶没有中层，请用内层记法。" |
| `ORIENTATION_NOT_MOVABLE` | `E_NOTATION_ORIENTATION_NOT_MOVABLE` | 整体旋转不是转动 | `applyMove('x')` / `'y2'` 等任何整体旋转记法 | "整体旋转是观察操作，请使用视角旋转。" |
| —（观察三码） | `E_OBSERVATION_BUDGET_EXHAUSTED` / `E_OBSERVATION_REQUIRES_MOVE` / `E_STALE_OBSERVATION` | 次数用尽 / 需先转动 / 观察已过期 | **v2.0 裁定：取代 v1.10 笼统的 `OBSERVATION_DENIED`**。分码让 Agent 知道下一步该做什么 | "观察次数已用尽。" / "本档观察需先完成一次转动。" / "该观察已过期，请重新观察。" |
| `INVALID_STATE` | **（不存在，P1 待补）** | 状态非法 | 任何来源生成的题面不合法/不可还原 | 当前实现：生成期由 `puzzle` 层直接拒绝，不经错误码通道；提交期镜像配色以 `mismatch.reason='invalid-scheme'` 区分。见 AC-12 / AC-26 的 v2.0 修订 |
| `NOT_SOLVED` | `E_NOT_SOLVED` | 提交时未还原 | `submitSolution` | "魔方尚未还原。" |
| `PAUSED` | `E_CHALLENGE_PAUSED` | 挑战已暂停 | `paused` 态下调用 `observe` / `applyMove` / `rotateView` / `submitSolution` | "挑战已暂停。计时已冻结。" |
| `RATE_LIMITED` | `E_RATE_LIMITED` | 调用过频 | 单帧内 API 调用 > 60 次 | "调用过于频繁，请降低频率。"（防 Agent 死循环打爆主线程） |
| —（视角两码） | `E_VIEW_ORIENTATION_INVALID` / `E_VIEW_FACE_UNKNOWN` | 朝向组合非法 / 面名未知 | `rotateView({up, front})` 参数错误 | "上/前面组合不合法。" / "未知的面名。" |
| —（幂等两码） | `E_OP_ID_NOT_FOUND` / `E_OP_ID_CONFLICT` | `op_id` 查不到 / 同 id 不同 move | `getLastActionResult(opId)`、带 `op_id` 的 `applyMove` | "找不到该操作 ID。" / "同一操作 ID 提交了不同的指令。" |
| —（记录两码） | `E_RUN_NOT_FINISHED` / `E_RUN_NOT_FOUND` | 运行未结束 / 找不到该运行 | `getChallengeResult` | "该运行尚未结束。" / "找不到该运行记录。" |
| —（复现失败） | `E_REPRODUCTION_MISMATCH` | 重放打乱后指纹与记录不符 | 载入历史题面 | "题面复现失败，记录可能已损坏。" |
| —（seed 两码） | `E_SEED_OUT_OF_RANGE` / `E_SEED_INVALID` | seed 超长 / 格式非法 | 指定 seed 创建挑战 | "seed 长度须在 1–32 之间。" / "seed 含非法字符。" |
| `STORAGE_FULL` | `E_STORAGE_FULL` | 存储已满 | localStorage 配额不足 | "本机存储已满，本次结果未保存。" |
| `INTERNAL` | `E_INTERNAL` | 内部错误 | 引擎抛出未预期异常 | "内部错误，本次运行已终止。"+ 允许复制诊断摘要 |

**结束后写操作的错误码优先级（唯一口径）**：`ended_timeout` → `E_DEADLINE_EXCEEDED`；`ended_move_limit` → `E_MOVE_LIMIT_REACHED`；其余已结束状态 → `E_CHALLENGE_ENDED`。不使用 HTTP 状态码语义。

### 12.2 错误处理原则

1. **非法操作绝不改变状态**：所有校验在状态变更之前完成（对应 AC-08）。
2. **失败一律抛 `CubeError`，不返回 `{ok:false}`**（v2.0 裁定，见 [`07-agent-api.md`](07-agent-api.md) §7.3）。调用方无法"忽略"一个异常，这正是我们要的——评测平台里静默吞掉失败会直接污染结论。
3. **错误不静默**：任何 `CubeError` 都在右栏日志留痕，并计入 `api_error` 埋点（埋点为 P1，见 §11.1）。
4. **每个错误都带 `hint`**：给出下一步建议，不只说"错了"。
5. **不因误判终止**：`NOT_SOLVED` 与记法错误不终止挑战（同一 run 内**累计** 3 次 `NOT_SOLVED` 除外；`applyMove` / 观察不重置计数）。
6. **错误文案不指责用户**：不用"你的操作有误"，用"无法识别的操作：`X`"。
7. **渲染异常降级**：若 WebGL 初始化失败，进入"2D 展开图模式"——用 6 个网格展示状态，键盘与按钮操作照常可用，计时与判定不受影响。这是唯一的功能降级路径（AC-53）。⚠️ **当前未实现**：WebGL 失败时只渲染一个终止提示页。见 [`../PRD.md`](../PRD.md) §4.1 与附录 C-bis。

---

