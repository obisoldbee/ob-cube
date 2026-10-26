# PRD v2.0 · Agent API 对外契约

> 本文件是 [`docs/specs/PRD.md`](../PRD.md) 主文件的子章节 **07**。
> 权威级别：**产品需求（What / Why）**。实现契约见 `docs/specs/execution/`，设计规范见 `docs/specs/execution/ui-*.md`。
> 冲突裁定：本文件与 `execution/` 冲突时以本文件为准；AC 编号唯一真源见 [`11-appendix.md`](11-appendix.md) 附录 C。
>
> **v2.0 新编章节。** v1.10 把 API 契约散在 §2.2 步骤 4、§8.6、§12.1、§13 与 AC-41~45 五处，互相漂移（"8 字段" vs 代码 13 字段、`{ok:false,error_code}` vs 代码抛异常、`OBSERVATION_DENIED` vs 代码三个独立码）。本章把它们收敛为一处。
> TS 类型定义、snake_case 转换实现、幂等与限流的具体算法见 [`../execution/agent-api.md`](../execution/agent-api.md)；错误码全名 ↔ 短名映射表也在那里，本章只用短名叙述。

---

## 7.1 传输形态与命名口径

| 项 | 规定 |
|---|---|
| 传输形态 | `window.cubeAgent`，页面内 JS 对象。无 HTTP、无协议层、无认证 |
| 挂载时机 | 恒挂载，**与"参与者"配置无关**。参与者 = 人类时右栏不渲染 Agent 会话面板，但 `window.cubeAgent` 依然可用（AC-41 约束 API 形态，不约束面板可见性） |
| 方法名 | 一律 **camelCase** |
| 返回字段名 | 一律 **snake_case** |
| 转换位置 | camelCase ↔ snake_case 的转换集中在 `agent/` 的一个纯函数模块里，业务层不得散落转换 |
| 成功返回形状 | **平铺在根上**，禁止包 `data` / `result` 一层 |
| 失败返回形状 | **抛出 `CubeError`**（见 §7.3） |
| 对象冻结 | 返回对象冻结（`Object.freeze`），调用方不得改写 |

## 7.2 九方法白名单（AC-41，冻结）

`window.cubeAgent` 的自有属性**必须只包含**下列 9 个方法，多一个即违规，且**不得**包含可回溯到引擎实例的对象型属性：

| 方法 | 前置条件 | 主要失败码（短名） |
|---|---|---|
| `getChallengeInfo()` | 挑战已创建 | `NO_ACTIVE_CHALLENGE` |
| `observe(opts?)` | `status ∈ {running, solved_pending}` | `NOT_STARTED` / `OBSERVATION_BUDGET_EXHAUSTED` / `OBSERVATION_REQUIRES_MOVE` / `STALE_OBSERVATION` / `PAUSED` |
| `rotateView(req)` | `status ∈ {ready, running, solved_pending}`（v1.1 放开 `ready`：预观察需要转视角） | `VIEW_ORIENTATION_INVALID` / `VIEW_FACE_UNKNOWN` / `PAUSED` |
| `applyMove(move, opts?)` | `status === 'running'` | 记法错误组 / `DEADLINE_EXCEEDED` / `MOVE_LIMIT_REACHED` / `ALREADY_SOLVED` / `RATE_LIMITED` / `PAUSED` |
| `getProgress()` | 无 | — |
| `getLastActionResult(opId?)` | 已有操作 | `OP_ID_NOT_FOUND` |
| `submitSolution(note?)` | `status ∈ {running, solved_pending}` | `NOT_SOLVED` / `CHALLENGE_ENDED` / `PAUSED` |
| `getChallengeResult(challengeId, runId?)` | 该运行已结束 | `RUN_NOT_FINISHED` / `RUN_NOT_FOUND` |
| `abandonChallenge(note?)` | 挑战进行中 | `CHALLENGE_ENDED` |

**明确不得存在的方法**（AC-64）：`getDebugState` / `getSolution` / `getScramble` / `getFullState` / `pause` / `resume`。断言方式：`Object.getOwnPropertyNames(window.cubeAgent)` 与 `Object.getOwnPropertyNames(window)` 中均不得出现这些标识符。

> **`pause` / `resume` 不暴露是有意设计**（AC-58）：真暂停只给人类。Agent 没有等价能力，因此人类的 `pause_count` / `paused_total_ms` 必须进入结果，让跨运行对比时"谁停了表"一眼可见。详见 [`04-scoring-judging.md`](04-scoring-judging.md) §7.2.1。

## 7.3 失败形状（v2.0 裁定）

> **裁定：失败一律抛 `CubeError`，不返回 `{ok:false, ...}`。**

v1.10 §12.1 写的是"所有失败一律返回 `{ok:false, error_code, message?}`"，但实现（经四轮评审验证）是抛异常。三个形状曾并存：

| 来源 | 声称的形状 |
|---|---|
| PRD v1.10 §12.1 | `{ok:false, error_code, message?}` |
| ARCHITECTURE v1.4 §7.1 | `{ok:false, error:{code, hint, retryable}}` + 保留 httpLike 列 |
| SPEC v1.0 §12 断言 B | "**抛** `E_CHALLENGE_NOT_STARTED`" |
| **代码现实** | **`throw new CubeError(code, message, hint)`** |

v2.0 以代码为准，理由：① 已交付且被 `tests/` 与四轮评审覆盖，改回返回值形状需重写全部调用方与测试；② 抛异常在语义上更契合"校验全部前置、失败绝不改状态"——调用方无法忽略失败；③ 三种形状并存本身就是缺陷，必须收敛到一个。

`CubeError` 的形状：

```
class CubeError extends Error {
  readonly code: ErrorCode;   // E_ 前缀全名，见 execution/agent-api.md 的映射表
  readonly hint: string;      // 人可读的下一步建议
  // 继承 name = 'CubeError'、message
}
```

**六条不可违反的契约**

1. **所有校验前置**：任何失败路径都不得已经改动状态、不得已经计步、不得已经产生事件。
2. **每个错误都带 `hint`**：文案不指责用户（用"无法识别的操作：`X`"，不用"你的操作有误"）。
3. **`deadline` 校验在入口第一行**：`observe` / `applyMove` / `rotateView` / `submitSolution` 四个方法的入口第一件事就是超时结算。**只依赖 UI 倒计时是可被绕过的**——Agent 可以用高频 `observe` 把主线程拖住，让 UI 的 tick 永不执行。**例外**：`status === 'solved_pending'` 不判超时（AC-75：还原优先，结果锁定 `solved`）。
4. **只读 API 内部会 tick 结算超时**：`getProgress()` 与 `observe()` 都可能让状态从 `running` 翻转为 `ended_timeout`。因此**任何状态翻转必须即调 `onMutate()` 同帧同步 UI**（AC-28）。曾出现的缺陷是"超时已结算但 UI 永久滞留在进行中，直到用户下一次操作才更新"，回归守护在 `tests/agent/read-flip-sync.test.ts`。
5. **错误不静默**：任何失败都在右栏日志留痕，并计入 `api_error` 埋点（埋点本身为 P1，见 [`09-contract-nfr.md`](09-contract-nfr.md) §11.1）。
6. **不因误判终止**：`NOT_SOLVED` 与记法错误不终止挑战；同一 run 内**累计** 3 次 `NOT_SOLVED` 才终止为 `invalid_submission`（`applyMove` 与观察不重置该计数）。

## 7.4 `applyMove` 返回形状（AC-42，v2.0 修订）

> **裁定：以代码的 13 字段为准，取代 v1.10 的"8 字段"。**
> v1.10 #55 曾把返回形状"统一为 8 字段"`{ok, move, layer_count, turn_amount, state_fingerprint_after, move_count, remaining_ms, observation_id}`，但实现是 13 字段，且**没有 `ok` 键**（失败走异常）、**没有根级 `observation_id`**（它在 `next_observation` 里）。AC-42 已在 `10-acceptance.md` 标记 `[v2.0 修订]`。

| 字段 | 类型 | 说明 |
|---|---|---|
| `op_id` | `string \| null` | 幂等键回显；调用方未传时为 `null` |
| `deduplicated` | `boolean` | 命中幂等缓存、本次**未执行也未计步**时为 `true` |
| `move` | `string` | 规范化记法（`describeMove` 的输出，唯一真源） |
| `layer_count` | `number` | 本次转动涉及的层数（AC-22） |
| `turn_amount` | `90 \| 180` | 归并出的 `X2` 是 `180`（AC-22 / AC-42） |
| `axis` | `'x' \| 'y' \| 'z'` | 转轴（AC-22） |
| `layer_set` | `readonly number[]` | **记法层号**，1-based，从规范化后的被命名面算起，升序（AC-05：4 阶 `Rw` → `[1,2]`、`3Rw` → `[1,2,3]`、`2R` → `[2]`；`3R` 归一化为 `2L'` 后 → `[3]` 按就近命名重解析） |
| `state_fingerprint_after` | `string \| null` | **键恒存在，不得省略**。`observation_mode === 'full'` 时为真实指纹；**其他四档一律 `null`**（理由见 [`05-dust-observation.md`](05-dust-observation.md) §8.6）。省略键会让调用方无法区分"不支持"与"为空" |
| `move_count` | `number` | 累计步数（本平台 HTM 口径） |
| `elapsed_ms` | `number` | 活跃时长（已扣除全部暂停段） |
| `remaining_ms` | `number \| null` | `null` = 不限时 |
| `solved` | `boolean` | 本次操作后是否已满足还原条件 |
| `next_observation` | `Observation` | 执行后的最新观察。**Agent 不需要再单独调 `observe()` 即可继续决策** |

## 7.5 `observe` 返回形状与观察裁剪

| 字段 | 说明 |
|---|---|
| `challenge_id` / `cube_size` | 题面标识 |
| `observation_id` | 格式 `<run_id>:o<seq>`，**不可被客户端构造** |
| `view_orientation` | `{up, front}` 两个面名 |
| `visible_faces` | 本次授权可见的面名数组 |
| `face_colors` | **只包含 `visible_faces` 中的面**；未授权面在此处**不出现**，而不是出现后置 `null`（AC-19） |
| `allowed_actions` | `{notation[], layer_indices[], can_rotate_view}`——Agent 应只从这里取合法指令，不要自己拼 |
| `elapsed_ms` / `remaining_ms` / `move_count` / `status` | 进度快照 |

**裁剪必须发生在 API 层，不是渲染层**（AC-65）。断言方式：对 `observe()` 返回值做 `JSON.stringify`，结果必须同时满足 ① 不出现未授权面的面名键；② 不出现 6 个贴纸色的色值字符串；③ 键名集合是"授权字段集"的**子集**（白名单断言，不是黑名单断言）。

**`observation_id` 的回显契约**（AC-43）：它表示"本次决策所依据的那次观察"。`observe()` 返回 id `X`，紧接着的 `applyMove` 必须在 `next_observation` 之外把这个 `X` 关联进事件记录；`observation_lag` 据此推导。

## 7.6 幂等（`op_id`）

`applyMove` 带 `op_id` 时：

| 情形 | 行为 |
|---|---|
| `op_id` 命中缓存且 `move` 相同 | 返回缓存结果，`deduplicated: true`，**不执行、不消耗步数、不产生事件** |
| `op_id` 命中缓存但 `move` 不同 | 抛 `OP_ID_CONFLICT` |
| `getLastActionResult(opId)` 查不到 | 抛 `OP_ID_NOT_FOUND` |

幂等是为了让 Agent 在网络/超时重试下不会重复计步。**它不是可选优化**：没有它，"同一段 Agent 代码跑两次得到不同步数"就会污染评测结论。

## 7.7 限流

单帧内 `applyMove` 调用超过 **60 次**必须拒绝（AC-44），抛 `RATE_LIMITED`，且不改变状态。目的是防 Agent 死循环打爆主线程——纯前端下 API 调用是同步的，一个 `while(true) applyMove('R')` 会直接冻结页面。

## 7.8 整体旋转的裁决（AC-66 / AC-67 / AC-68）

> **`x` / `y` / `z` 只转相机，不是可提交的转动指令。**

| 面 | 口径 |
|---|---|
| 定义 | 整体旋转 = 改变观察方向，**不改变魔方内部状态**，不计步 |
| 人类玩家 | 只能通过鼠标拖拽、方向键、`Home`、界面 6 个面视角按钮实现；**键盘不提供 `x`/`y`/`z` 按键** |
| Agent | 只能通过 `rotateView()` 实现。**`applyMove('x')` 必须被拒绝**，抛 `ORIENTATION_NOT_MOVABLE`（全名 `E_NOTATION_ORIENTATION_NOT_MOVABLE`），且状态指纹不变、`move_count` 不增、不产生 `MoveEvent` |
| 为什么这样定 | ① 若 `applyMove` 接受整体旋转，它就能被用来"免费"改变状态而不计步，破坏计步公平性；② 人类与 Agent 必须走同一条权限路径——人类不能用键盘做，Agent 也不能用 `applyMove` 做；③ 把"观察"与"操作"两个通道彻底分开，是产品设计原则"视觉展示 / 真实状态 / 观察权限三者独立"的直接落地 |
| 连带影响 | `getProgress()` 与 `MoveEvent` 里**不得**出现整体旋转；回放的"视角变化"只作为 `ViewEvent` 记录 |

**`rotateView` 的入参形状**（v2.0 修订，PRD v1.10 的 `{axis, direction, steps}` 已过期）：

| 形式 | 入参 | 语义 | 产生的 `ViewEvent` |
|---|---|---|---|
| 相对旋转 | `{quarter_turns}` 或方向 + 步数 | 绕轴转 N 个 90° | `axis` / `direction` / `steps` 均有值（`steps` 恒为 1） |
| 绝对朝向 | `{up, front}` | 直接指定上/前面 | `axis` / `direction` / `steps` 均为 `null`（绝对朝向无单轴语义） |

## 7.9 人机同源（AC-45 / AC-70）

人类与 Agent 的转动**走同一个引擎入口**。人类按键后产生的指令字符串，与 Agent 提交的指令字符串，进入同一条校验与执行路径、产出同构事件。

断言：用键盘 `D` 键提交 `R` 与用 `applyMove("R")` 提交，在相同初始状态下必须产出相同的 `state_fingerprint_after`、相同的 `layer_count`、相同的 `move_count` 增量。

**比较基准是"经输入整形后的规范化 move 序列"，不是"按了几个键"或"调了几次接口"**：

| 场景 | 表达出来的 move 序列 | 事件数 | `move_count` |
|---|---|---|---|
| 人类 300ms 内双击 `D` 键两次 | `['R2']`（整形后） | 1 | **1** |
| 人类点 `R2` 按钮 | `['R2']` | 1 | **1** |
| Agent 调 `applyMove('R2')` | `['R2']` | 1 | **1** |
| Agent 连调两次 `applyMove('R')` | `['R','R']` | 2 | **2** |
| 人类按 `D` 键两次但间隔 > 300ms | `['R','R']` | 2 | **2** |

键盘 300ms 双击是**输入整形规则**的一部分（把两次 90° 表达为一次 `X2` 意图）；API 没有这个时间窗，两次 `applyMove('R')` 就是两次独立意图。**禁止的是在归并判定之后按 `input_channel` 再做差异化处理**（不得"键盘已归并、API 再合并一次"，也不得"键盘不归并、API 归并"），不是禁止键盘双击归并本身。详见 [`04-scoring-judging.md`](04-scoring-judging.md) §7.1.1 三公理与 [`03-notation-keyboard.md`](03-notation-keyboard.md) §5.4.1 开放事件。

## 7.10 题面字段的白名单（AC-64 / AC-77）

在 `ready` / `running` / `paused` / `solved_pending` 期间，`getChallengeInfo()` 对下列字段**必须返回 `null`**，且它们也不得写入 `localStorage`：

`state_snapshot`、`facelet_string`、`state_fingerprint`、`scramble`、`seed`

允许返回/落盘的只有：`challenge_id`、`cube_size`、`gen_mode`、`preset_id`、`distance_is_estimated`、`estimated_distance`、`difficulty_score`、`difficulty_level`、`difficulty_tags`、`structure_tag`、`created_at`。

挑战结束后由 `getChallengeResult()` 返回完整题面与最终指纹——此时已无隐藏信息可泄露。

完整机制与"为什么纯前端做不到真隔离"见 [`05-dust-observation.md`](05-dust-observation.md)。
