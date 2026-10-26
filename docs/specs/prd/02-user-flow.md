# PRD v2.0 · 用户流程与状态机

> 本文件是 [`docs/specs/PRD.md`](../PRD.md) 主文件的子章节 **02**。
> 权威级别：**产品需求（What / Why）**。实现契约见 `docs/specs/execution/`，设计规范见 `docs/specs/execution/ui-*.md`。
> 冲突裁定：本文件与 `execution/` 冲突时以本文件为准；AC 编号唯一真源见 [`11-appendix.md`](11-appendix.md) 附录 C。
>
> 含 v1.10 的 §2 用户流程。**状态机已按代码实现口径收敛**，见本章 §2.1 的 v2.0 修订说明。

---

## 2. 用户流程

### 2.1 状态机总览

> **v2.0 修订：状态机按代码实现口径收敛。**
> v1.10 写的 `idle → configuring → ready → running ⇄ paused → finished → review` 里有三个状态**从未存在过**：`configuring`（页面加载即生成题面进入 `ready`，配置面板是左栏常驻而非独立阶段）、`finished`（实现用 6 个 `ended_*` 终态区分结局，不是一个笼统的"已结束"）、`review`（回放是 `ended_*` 态下的一种 UI 投影，不是状态机节点）。
> 字面真源是 `src/ob-cube/src/contracts.ts` 的 `ChallengeStatus` 与 `ENDED_STATUSES`。

```
idle ──▶ ready ──▶ running ⇄ paused
                     │   │
                     │   └──(已还原)──▶ solved_pending ──(submitSolution)──▶ ended_solved
                     │
                     └──(超时 / 步数耗尽 / 放弃 / 提交累计失败 3 次 / 页面关闭 / 内部错误)──▶ ended_*
```

> `paused` 是 `running` 的子状态（**仅人类模式可进入**），**计时冻结**（v1.9 真暂停）。详见 [`04-scoring-judging.md`](04-scoring-judging.md) §7.2.1。
> `solved_pending` 是"已还原、尚未正式结算"的中间态：`applyMove` 后检测到还原即进入。**v2.0：人类与 Agent 一律需显式 `submitSolution()`**（`auto_submit_on_solved` 默认改为 `false`，见下方裁定说明）。详见 [`04-scoring-judging.md`](04-scoring-judging.md) §7.4 / AC-75。
> `solved_pending` **不判超时**（AC-75：还原优先，结果锁定 `solved`）。**当前实现缺这条豁免，是已登记的高危缺陷 D1**，见 [`../PRD.md`](../PRD.md) §4.2。

| 状态 | 含义 | 魔方是否可见 | 计时 | API 可写 | API 可读颜色 |
|---|---|---|---|---|---|
| `idle` | 尚未创建挑战 | 不渲染 | 未启动 | 否 | 否 |
| `ready` | 题面已生成、等待开始（**蒙尘点**） | 蒙尘=开：仅遮蔽材质；蒙尘=关：真实题面（预观察，v1.9） | 未启动 | 仅 `rotateView` | **否** |
| `running` | 挑战进行中 | 按观察规则开放 | 运行 | 是 | 按观察规则 |
| `paused` | 暂停中（仅人类，屏蔽输入与观察） | 冻结在暂停前最后一帧并加遮罩 | **冻结**（v1.9） | 否 | 否 |
| `solved_pending` | 已还原、等待显式提交 | 全开（已无隐藏信息） | 继续，但结果已锁定为 `solved`；**不判超时** | 仅 `submitSolution` / `rotateView` / `observe` | 是（已无隐藏信息） |
| `ended_solved` | 已还原并成功提交 | 全开 | 停止 | 否 | 是（含答案） |
| `ended_timeout` | 超时 | 全开 | 停止 | 否 | 是 |
| `ended_move_limit` | 步数耗尽 | 全开 | 停止 | 否 | 是 |
| `ended_abandoned` | 主动放弃 | 全开 | 停止 | 否 | 是 |
| `ended_invalid` | 提交累计失败 3 次 | 全开 | 停止 | 否 | 是 |
| `ended_interrupted` | 页面在 `running` / `paused` 中被关闭或刷新 | — | — | — | — |

**v1.10 → v2.0 的结局名映射**（供阅读旧文档与旧评审时对照）：

| v1.10 `result` 值 | v2.0 / 代码 `ChallengeStatus` |
|---|---|
| `solved` | `ended_solved` |
| `timeout` | `ended_timeout` |
| `move_limit` | `ended_move_limit` |
| `aborted` | `ended_abandoned` |
| `invalid_submission` | `ended_invalid` |
| `interrupted` | `ended_interrupted` |
| `internal_error` | 无独立终态；内部错误经 `ended_*` + `ended_reason` 表达（v2.0 裁定：不新增第 7 个终态，理由见 `docs/decisions/2026-10-26-prd-v2-rulings-decision.md`） |

> **`ended_*` 态的 `Space` 键无动作**（v2.0 裁定 Q9）。v1.10 §5.3.4 写的"`finished` 态 `Space` = 返回配置"在 v1.9 把配置面板改为左栏常驻后已无落点；代码现状是 `ended_*` 下 `Space` 只 `preventDefault()` 阻止滚动、不触发任何操作。v2.0 追认现状，见 [`03-notation-keyboard.md`](03-notation-keyboard.md) §5.3.4。

### 2.2 逐步流程

#### 步骤 1：配置与创建挑战（`idle` → `ready`）

**界面状态**：单页三栏布局，**页面加载即生成默认题面并进入 `ready`**——没有"空态引导 + 点创建"这个阶段（v1.10 的中栏空态描述已过期）。左栏为常驻"挑战配置"面板，中栏为 3D 魔方 + 视角 HUD + 转动按钮矩阵，右栏按参与者类型显示 Agent 会话面板或操作日志/结果。

**可配置项与默认值**（v2.0 按九条裁决与代码现状对齐）：

| 字段 | 选项 | 默认 | 备注 |
|---|---|---|---|
| 阶数 | 2×2 / 3×3 / 4×4 | 3×3 | 切换阶数时重置 tab 与层选择器（`normalizeTab`） |
| 参与者 | 人类 / AI Agent | 人类 | 人类=不渲染右栏 Agent 会话面板；AI Agent=渲染。**不影响引擎与 `window.cubeAgent` 挂载**（v1.9） |
| 题目来源 | 随机 / 指定 seed / 内置题库（6 条预设） | 随机 | 见步骤 2。**"随机"= 随机操作打乱（`random_moves`），不提供均匀随机状态生成**（[`04-scoring-judging.md`](04-scoring-judging.md) §6.5）。UI 上不得出现"随机状态 / 均匀随机 / 标准化题面"一类措辞。导入功能不在范围 |
| 时间限制 | **不限时 / 2min / 5min / 20min / 自定义** | **不限时**（v1.9） | 下限 10s，上限 180 分钟。不限时=计时器只计上行时间，无倒计时条。**v2.0 删除 60s 预设**（九条裁决 #2 的清单里没有它，代码也未实现） |
| 步数限制 | **不限步 / 20 / 50 / 100 / 自定义** | 不限步 | 下限 1。**v2.0 删除 200 预设**（同上，九条裁决 #3b 与代码均无 200） |
| 蒙尘模式 | 开 / 关 | **关** | 开=`ready` 态遮蔽（C1~C5）；关=**预观察模式**：`ready` 态显示真实题面、可旋转视角，计时从按下"开始挑战"起算（v1.9）。API 门控两种模式下相同 |
| 键盘 180° 双击归并 | 开 / 关 | 开 | `mergeDoubleTap`。关闭后 180° 只能通过界面按钮提交，键盘不提供替代键（`Alt` 因会触发浏览器菜单栏聚焦，已禁用，见 [`03-notation-keyboard.md`](03-notation-keyboard.md) §5.3.5） |
| 还原后自动提交 | 开 / 关 | **关**（v2.0 修订） | `autoSubmitOnSolved`。**v2.0 把默认从"人类=开"改为"一律关"**，见下方裁定说明。当前该字段是死配置（已定义、无消费者），接线为 P1 |
| 观察模式 | 完整 / 三面 / 单面 / 操作后 / 受限 | 完整 | **v2.0 降为 P1（F14），配置面板暂无此入口**。引擎侧已支持 `three_faces` / `single_face` / `restricted`（预算 24），`after_move` 缺门控逻辑。当前只能通过控制台直接调 API 触发。规则见 [`05-dust-observation.md`](05-dust-observation.md) §8.2 C6 |
| 观察次数上限 | 正整数 / 不限 | — | 仅 `restricted` 模式生效；已达上限时抛 `OBSERVATION_BUDGET_EXHAUSTED`。**随 F14 降为 P1，暂无入口** |
| 转动动画时长 | 60–300ms | 150ms | **v2.0 澄清：这是设计常量，不是用户可配置项**。`settings.ts` 无 `animationMs` 字段，配置面板无此控件。UIUX 与代码均为 150ms；ARCHITECTURE v1.4 写的"默认 180、可配 [0,400]"已作废 |

> **v2.0 裁定：`auto_submit_on_solved` 默认改为 `false`**
>
> v1.10 §2.1 / §7.4 / AC-75 写的是"人类默认 `auto_submit_on_solved=true`，还原后立即自动提交进入 `finished/solved`；Agent 默认 `false`，等待显式 `submitSolution()`"。实现里 `settings.ts` 定义了这个字段并默认 `true`，但**全库没有任何消费者**——`session.ts` 从不读它，实测人类还原后同样停在 `solved_pending`，必须手点提交。四轮评审都记录了这个背离，但一直没裁决。
>
> v2.0 裁定**改文档对齐代码**（默认 `false`，人机一致都需显式提交），理由：① 零代码改动即可消除背离；② 人机一致更符合"同一套引擎、同一份计步规则"的产品定义——给人类一条自动结算的捷径，本身就是对 Agent 的差异化对待；③ 还原后允许继续旋转视角展示、再决定何时结算，对两类参与者都有价值。
>
> 该字段**保留**为 P1 配置项（接线后即可让用户自选），不删除。AC-75 已按此重写。

**系统行为**：
- 表单校验不通过（如时间填 0、步数填负数、seed 超长）时，"创建挑战"按钮禁用并就地显示原因文案，不使用弹窗。
- 配置面板在 `ready` 与 `ended_*` 态可编辑，**编辑即按新配置重建题面并回到 `ready`**；`running` / `paused` / `solved_pending` 态控件禁用。
- URL 参数（`?size=&time=&moves=&seed=`）优先级高于本地设置，仅作复现链接用途。URL 与配置面板**共用同一套边界校验**（seed 1–32、time 10s–180min、moves ≥1）；超长 seed 不得触发首屏异常。

#### 步骤 2：生成题面（`idle` → `ready`）

**系统行为**（顺序执行，任一失败则回到 `idle` 并就地显示原因，不弹窗）：

1. 按题目来源生成题面：
   - **随机**：内部生成一个高熵 seed（32 位），用该 seed 生成题面，并把 seed 写进题面元信息。
   - **指定 seed**：用户输入 1–32 位字符串，用规范化后的 seed 生成题面。
   - **预设题**（已交付 6 条，2/3/4 阶各 2）：按 `preset_id` 读取内置题库中的固定 seed 与 `scramble`，用该 seed 重放打乱生成题面；预设题的 seed 由题库锁定，不接受用户覆盖。`seed` 与 `scramble` 均保留，供复现。
   - **导入**：不在范围（v1.9 #44，v2.0 维持）。
2. 校验题面合法性（配色方案合法、可还原、非已还原态、最短解距离满足下限，见 [`04-scoring-judging.md`](04-scoring-judging.md) §6.4）。
3. 在内存中保存题面元信息（[`08-data-model.md`](08-data-model.md) §13.1）；持久化只写 [`05-dust-observation.md`](05-dust-observation.md) §8.2 C3 的白名单字段，`facelet_string` / `state_fingerprint` / `scramble` / `seed` 在挑战结束前不得落盘。
4. 视角复位到默认（默认展示前、上、右三面）。
5. 进入 `ready`：蒙尘=开时 3D 场景切遮蔽材质（**单色平光 unlit**，不显示任何贴纸色差——v1.10 #27 已从"哑光 PBR"改口径，因为 PBR + 方向光会让各面亮度不同，直接违反 AC-16）；蒙尘=关（预观察模式，v1.9）时直接显示真实贴纸并允许旋转视角。API 侧状态均置为 `ready`。

**关键约束（蒙尘点，仅蒙尘=开时）**：`ready` 状态下
- `observe()` **不返回任何颜色、状态字符串或可推导颜色的字段**，而是抛 `E_CHALLENGE_NOT_STARTED`（预观察模式下同样如此——预观察是给人眼的，不是给 API 的读数通道，v1.9）；
- 蒙尘=开时，页面 DOM 中不渲染任何带颜色的贴纸元素；
- 打乱序列、seed、初始状态/`facelet_string` 不写入 `localStorage`，不由 `window` 可达对象持有（见 [`05-dust-observation.md`](05-dust-observation.md)）。

#### 步骤 3：开始挑战（`ready` → `running`）

**界面状态**：若蒙尘=开，遮蔽材质在 **600ms** 内逐面颜色插值溶解为真实贴纸（v2.0 裁定：取 UIUX §6.4 的 600ms，v1.10 §2.2 写的 200ms 作废——解锁转场属视觉专项，设计契约是权威；实现同时受 `prefers-reduced-motion` 约束）；蒙尘=关时本就显示真实贴纸，不做溶解。计时器开始跳字；左栏按钮由"开始挑战"变为"暂停"（次要样式）+ "结束挑战"（次要危险样式）+ "放弃"；右栏操作日志开始接收事件。**Agent 模式下不渲染"暂停"按钮**（[`04-scoring-judging.md`](04-scoring-judging.md) §7.2.1 P4'/P5'，AC-58）。

> **按钮语义**：`暂停` = 进入 `paused`（仅人类）；`结束挑战` = 提交当前状态，等价 `submitSolution()`（未还原时抛 `E_NOT_SOLVED` 并计一次失败，**不终止**，累计 3 次才终止为 `ended_invalid`）；`放弃` = 进入 `ended_abandoned`。后两者都需确认，不得静默结算。

**系统行为**：
1. 记录 `started_at`（墙钟时间戳）与单调时钟基准；**计时用单调时钟**，且全项目只允许 `challenge/clock.ts` 一处取时间。
2. 状态置 `running`。
3. 开放观察权限：`observe()` 首次返回该观察模式允许的数据。
4. 启动限时倒计时（若配置了时间）。
5. 键盘/按钮/API 输入通道同时开放。

#### 步骤 4：操作（`running` / `solved_pending`）

**人类玩家**：
1. 鼠标拖拽空白区域 → 轨道旋转视角（不计步、不改变状态，只产生 `ViewEvent`）。
2. 键盘按 [`03-notation-keyboard.md`](03-notation-keyboard.md) §5 键位 → 立即提交一次转动。
3. 或：在层选择器中勾选层组合 → 点击轴向箭头按钮。
4. 每次操作后：播放转动动画（150ms 设计常量），追加一条操作事件，刷新右栏日志。**`move_count` 只在事件定稿时 +1**：双击归并窗口内的第一下先执行、但步数在窗口关闭后 +1（[`03-notation-keyboard.md`](03-notation-keyboard.md) §5.4.1）。
5. 或：点击"暂停"进入 `paused`——输入与观察被屏蔽，**计时冻结**（v1.9）。再点"继续"回到 `running`，计时从冻结点恢复。
6. 已还原后进入 `solved_pending`：可继续旋转视角、可 `observe`、可提交；`applyMove` 抛 `E_CUBE_ALREADY_SOLVED`，不再改变状态。

**Agent**：
1. `observe()` → 拿到观察数据（含 `observation_id`）。
2. 基于观察决定下一步。
3. `applyMove('R')` → 拿到 13 字段的平铺返回包（`op_id` / `deduplicated` / `move` / `layer_count` / `turn_amount` / `axis` / `layer_set` / `state_fingerprint_after` / `move_count` / `elapsed_ms` / `remaining_ms` / `solved` / `next_observation`）。**完整字段语义与"受限观察下 `state_fingerprint_after` 为 `null`"的规则见 [`07-agent-api.md`](07-agent-api.md) §7.4**。失败时抛 `CubeError`，不返回 `{ok:false}`。
4. 循环 1–3，直到 `submitSolution()` 或触发终止条件。已还原后进入 `solved_pending`，**人类与 Agent 一律须显式 `submitSolution()`** 才会得到 `ended_solved`（v2.0：`auto_submit_on_solved` 默认 `false`）。

**统一约束**：人类与 Agent 的转动**走同一个引擎入口**。人类按键后产生的指令字符串，与 Agent 提交的指令字符串，进入同一条校验与执行路径、产出同构事件（AC-45 / AC-70，见 [`07-agent-api.md`](07-agent-api.md) §7.9）。

#### 步骤 5：结束（`running` / `paused` / `solved_pending` → `ended_*`）

触发条件（判定顺序见 [`04-scoring-judging.md`](04-scoring-judging.md) §7.3）：提交成功 / 超时 / 步数耗尽 / 主动放弃 / 提交校验累计失败 3 次 / 页面关闭 / 内部错误。

> **v2.0 状态口径**：`applyMove` 后已还原**不直接结束**，先进入 `solved_pending`；**人类与 Agent 都需显式提交**才进入 `ended_solved`。`paused` 期间计时冻结，不可能超时；暂停中点"结束/放弃"按主动放弃结算。`solved_pending` 中超时**不得**覆盖已锁定的 `solved` 结果（还原优先，AC-75）——**此豁免当前未实现，是已登记的高危缺陷 D1**。

**系统行为**：
1. 停止计时，记录 `ended_at`。
2. 状态置为对应的 `ended_*` 终态，关闭写通道：`applyMove` 抛 `CubeError`，错误码按"结束后优先级"选择（`ended_timeout` → `E_DEADLINE_EXCEEDED`；`ended_move_limit` → `E_MOVE_LIMIT_REACHED`；其余 → `E_CHALLENGE_ENDED`）。**UI 必须在状态迁移的同一渲染帧内禁用全部输入控件并置灰，最迟不超过 200ms**（AC-28），不得等下一次操作才体现。
3. 3D 场景全开颜色（进行中的动画播放完毕后定格）。
4. 计算并落盘结果对象（[`08-data-model.md`](08-data-model.md) §13.3）。
5. 写入 `localStorage` 历史（含题面元信息、事件流、结果；**此时才允许写入完整题面字段**）。
6. 右栏切换为结果面板。

#### 步骤 6：结果与回放（`ended_*` 态内的 UI 投影）

`review` **不是状态机节点**，而是 `ended_*` 态下右栏/中栏的一种 UI 投影。结果展示见 [`06-result-replay.md`](06-result-replay.md) §9；回放见同文件 §10——注意 v2.0 已把回放拆为 **F09a（结果页原地重放，P0，已交付）** 与 **F09b（独立回放页与全套控件，P1，未实现）**。

---

