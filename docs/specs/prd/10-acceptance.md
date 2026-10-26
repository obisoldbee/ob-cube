# PRD v2.0 · 验收标准（EARS）

> 本文件是 [`docs/specs/PRD.md`](../PRD.md) 主文件的子章节 **10**。
> 权威级别：**产品需求（What / Why）**。实现契约见 `docs/specs/execution/`，设计规范见 `docs/specs/execution/ui-*.md`。
> 冲突裁定：本文件与 `execution/` 冲突时以本文件为准；AC 编号唯一真源见 [`11-appendix.md`](11-appendix.md) 附录 C。
>
> 含 v1.10 的 §14 验收标准 AC-01~AC-77。编号冻结规则见 `11-appendix.md` 附录 C；v2.0 新增「交付状态」列，不改动冻结编号。

---

## 14. 验收标准（EARS 格式）

> 格式：`While <状态>` / `When <触发>` / `If <条件>` + **系统必须** + `<可观测行为>`。
> 每条都能被机器验证（自动化测试或脚本断言）。P0 功能全覆盖。
> **交付状态**（已交付 / 部分 / 未实现 / 已降级 P1 / 已废弃）统一登记在 [`11-appendix.md`](11-appendix.md) 附录 C 的 v2.0 状态列，本章不重复标注，避免两处漂移。

### 14.0 v2.0 全局阅读规则（适用于本章全部条目）

附录 C 的冻结规则规定"编号一经发布即不可变更、条目作废时保号标注、不得删行"。为了让 v2.0 的口径裁定的生效，同时**不破坏已发布条文与四轮历史评审的可对照性**，本章采用"原文保留 + 统一解释规则"的方式。下列规则优先级高于条文原文的字面写法：

| # | 条文里的写法 | v2.0 一律读作 | 依据 |
|---|---|---|---|
| G1 | `返回 {ok:false, error_code:"X"}` | **抛出 `CubeError`，其 `code` 为 `X` 对应的 `E_` 全名** | [`07-agent-api.md`](07-agent-api.md) §7.3 裁定：失败一律抛异常。短名 ↔ 全名映射见 [`../execution/agent-api.md`](../execution/agent-api.md) |
| G2 | `{ok:true, ...}` | 成功返回包**平铺在根上**，无 `ok` 键（`ok:true` 是冗余的——不抛异常即成功） | 同上；字面真源 `contracts.ts` 的 `MoveResult` / `Observation` |
| G3 | 状态 `finished` | 对应的 `ended_*` 终态（`ended_solved` / `ended_timeout` / `ended_move_limit` / `ended_abandoned` / `ended_invalid` / `ended_interrupted`） | [`02-user-flow.md`](02-user-flow.md) §2.1 |
| G4 | `result: "solved"` / `"timeout"` / `"move_limit"` / `"aborted"` / `"invalid_submission"` / `"interrupted"` | `ended_solved` / `ended_timeout` / `ended_move_limit` / `ended_abandoned` / `ended_invalid` / `ended_interrupted` | 同上（含 v1.10 → v2.0 结局名映射表） |
| G5 | 状态 `configuring` | **不存在**。页面加载即 `idle` → `ready`；配置面板是左栏常驻，`ready` 与 `ended_*` 态可编辑 | [`02-user-flow.md`](02-user-flow.md) §2.1 / §2.2 步骤 1 |
| G6 | 状态 `review` | **不是状态**，是 `ended_*` 态下的一种 UI 投影 | [`02-user-flow.md`](02-user-flow.md) §2.2 步骤 6 |
| G7 | `observation_mode == "one_face"` / `"three_face"` | `"single_face"` / `"three_faces"`（代码口径） | [`05-dust-observation.md`](05-dust-observation.md) §8.2 C6 修订 1 |
| G8 | `OBSERVATION_DENIED` | 按拒绝原因分三码：`E_OBSERVATION_BUDGET_EXHAUSTED`（次数用尽）/ `E_OBSERVATION_REQUIRES_MOVE`（`after_move` 未转动）/ `E_STALE_OBSERVATION`（观察过期） | [`05-dust-observation.md`](05-dust-observation.md) §8.2 C6 修订 2 |
| G9 | `INVALID_STATE` | 该对外错误码**当前不存在**（`ERROR_CODES` 无 `E_INVALID_STATE`）。题面非法在生成期由 `puzzle` 层拒绝；镜像配色在提交期以 `mismatch.reason = 'invalid-scheme'` 区分。补码列为 P1 | AC-12 / AC-26 的 v2.0 修订说明 |
| G10 | `INVALID_LAYER` / `INVALID_MOVE` / `ALREADY_SOLVED` / `PAUSED` / `TIMEOUT` / `MOVE_LIMIT` / `ALREADY_FINISHED` / `NOT_STARTED` / `NOT_SOLVED` / `RATE_LIMITED` / `STORAGE_FULL` / `INTERNAL` / `ORIENTATION_NOT_MOVABLE` | 对应全名 `E_MOVE_LAYER_OUT_OF_RANGE` / `E_NOTATION_MALFORMED` / `E_CUBE_ALREADY_SOLVED` / `E_CHALLENGE_PAUSED` / `E_DEADLINE_EXCEEDED` / `E_MOVE_LIMIT_REACHED` / `E_CHALLENGE_ENDED` / `E_CHALLENGE_NOT_STARTED` / `E_NOT_SOLVED` / `E_RATE_LIMITED` / `E_STORAGE_FULL` / `E_INTERNAL` / `E_NOTATION_ORIENTATION_NOT_MOVABLE` | [`../execution/agent-api.md`](../execution/agent-api.md) 映射表 |
| G11 | `MoveEvent` / `ViewEvent` / `SessionEvent` 三种事件类型 | 实现是**单一 `RunEvent` 类型 + `type` 字段七值**（`move` / `view` / `start` / `pause` / `resume` / `submit` / `end`）；`index` → `seq`、`submitted_at_ms` → `at_ms`、`state_fingerprint_after` → `to_fingerprint`（另有 `from_fingerprint`） | [`08-data-model.md`](08-data-model.md) §13.4 修订说明 |
| G12 | `applyMove` 返回 8 字段 | 返回 **13 字段**（见 AC-42 的 v2.0 修订） | [`07-agent-api.md`](07-agent-api.md) §7.4 |

### 14.1 引擎与状态（F02）

| 编号 | 类型 | 验收标准 |
|---|---|---|
| AC-01 | Ubiquitous | 系统**必须**对 2、3、4 阶分别维护一个 N×N×N 状态模型，任一时刻 6 面贴纸总数分别恒为 24 / 54 / 96，且每种颜色出现次数恒为 4 / 9 / 16。 |
| AC-02 | Event | When 收到指令 `R`，系统**必须**在 5ms 内完成转动并返回 `{ok:true, move:"R", layer_count:1, turn_amount:90}`。 |
| AC-03 `[v2.0 修订]` | Event | When 依次执行 `R` 然后 `R'`，系统**必须**使最终状态指纹等于初始状态指纹；When 依次执行 `R2` 两次，系统**必须**同样回到初始指纹（逆操作闭环）。<br>**修订理由**：v1.10 原文是"`R`、`R'`、`R2` 依次执行后指纹回初始"，其净效果等于 `R2`（`R` 与 `R'` 互相抵消，剩下一个 `R2`），**数学上恒假、永远无法通过**。第四轮评审已坐实该条不可满足。按附录 C 冻结规则保留编号，修正内容 |
| AC-04 | Event | When 收到同一轴同一层的 `R` 与 `R'`，系统**必须**使执行后的状态回到执行前（单次逆操作正确）。 |
| AC-05 | Event | When 在 4 阶收到 `Rw`，系统**必须**使 `layer_set == [1,2]`；收到 `3Rw` 时 `layer_set == [1,2,3]`；收到 `2R` 时 `layer_set == [2]`。**`layer_set` 用记法层号**（1-based，从规范化后的被命名面算起），因此 `3R` 归一化为 `2L'` 后按就近命名重解析 |
| AC-06 | Event | When 在 3 阶按 `Z`+`D`（R 面键，等价 `2R`），系统**必须**返回与 Singmaster `M'` 完全等价的状态变化。 |
| AC-07 | State-driven | While 阶数为 2，If 收到任何含层数 > 1 的前缀指令，系统**必须**返回 `{ok:false, error_code:"INVALID_LAYER"}` 且状态指纹不变。 |
| AC-08 | Unwanted | If 收到的指令无法解析（如 `"R3"`、`"Xq"`、`""`），系统**必须**返回 `{ok:false, error_code:"INVALID_MOVE"}` 且**状态指纹必须不变**、`move_count` 必须不增。 |

### 14.2 题面生成与复现（F04）

| 编号 | 类型 | 验收标准 |
|---|---|---|
| AC-09 | Event | When 用同一 seed 与同一 `cube_size` 连续生成 100 次题面，系统**必须**产出 100 个完全相同的 `state_fingerprint`。 |
| AC-10 | Event | When 连续生成 **1000** 个未指定 seed 的 2 阶题面，系统**必须**使**不同 `state_fingerprint` 的数量 ≥ 999**（碰撞率 ≤ 1‰）。断言方式：收集 1000 个指纹去重后计数。**原表述"比率 ≥ 99%"未给样本量——测试者取 3 次可得"100% 通过"，取 10 万次可得完全不同结论，随机性断言不给 N 即不可验收** |
| AC-11 | State-driven | While `gen_mode == "random_moves"`，系统**必须**使题面元信息 DOM 出现“随机操作”标识，并使结果页 DOM 逐字出现 §6.5 的完整句子：“本次题面由随机操作生成，非均匀随机状态，不构成标准化难度基准。”且 `gen_mode` 字段值**不得**为 `"random_state"`。 |
| AC-12 `[v2.0 修订]` | Unwanted | If 任何来源生成的题面非法（颜色计数不符、不可还原、已是还原态），系统**必须**拒绝该题面且**不进入** `ready` 态，并在配置面板就地显示原因（不弹窗）。<br>**修订理由**：原文要求返回 `{ok:false, error_code:"INVALID_STATE"}`，但 `ERROR_CODES` 里没有 `E_INVALID_STATE`；实现是 `puzzle` 层在生成期直接拒绝并重试/报错，不经过 API 错误码通道。补对外码列为 P1（阅读规则 G9） |
| AC-13 | Event | When 创建挑战成功，系统**必须**在内存中持有 `Challenge` 对象的全部 13.1 字段；写入 `localStorage` 的字段**必须**遵守 AC-15 的白名单，且 `state_fingerprint` 长度 ≥ 8。 |

### 14.3 蒙尘门控（F05）

| 编号 | 类型 | 验收标准 |
|---|---|---|
| AC-14 | State-driven | While 状态为 `idle` / `configuring` / `ready`，When 调用 `window.cubeAgent.observe()`，系统**必须**返回 `{ok:false, error_code:"NOT_STARTED"}`，且返回值的 JSON 序列化中**必须不包含** `face_colors`、`state_snapshot`、`facelet_string`、`state_fingerprint`、`move_count`、`scramble`、`seed` 任一键名。 |
| AC-15 | State-driven | While 状态为 `ready` / `running` / `paused` / `solved_pending`，系统**必须**使 `localStorage` 中该题面只出现 §8.2 C3 的白名单字段；`state_snapshot`、`facelet_string`、`state_fingerprint`、`scramble`、`seed` 任一字段**必须不出现**。 |
| AC-16 | State-driven | While 状态为 `ready` 且 `dust_mode == true`，系统**必须**通过**确定性探针**证明魔方表面未出现任何贴纸颜色：在屏幕空间按相机矩阵计算固定探针点（每个可见面中心 1 点 + 每面 4 个内缩点），断言同时满足：① 所有探针像素与遮蔽色 `--cube-masked` 的色差 **ΔE ≤ 2**；② 任一探针像素与 6 个贴纸色中任一个的色差 **ΔE ≥ 20**。该判定对 2D 降级视图（§12.2 第 5 条）同样适用。**不得**使用"画布颜色种类数 ≤ N"这类统计式断言——MSAA/抗锯齿的边缘过渡色必然违反它，判定会恒假 |
| AC-17 | State-driven | While 状态为 `ready` 且 `dust_mode == true`，系统**必须**在遮蔽体相邻位置渲染文案，文案内容包含"不能阻止通过开发者工具读取内存"。 |
| AC-18 | Event | When 状态由 `ready` 转为 `running`，系统**必须**在 300ms 内使 `observe()` 返回成功且包含当前观察模式允许的全部字段。 |
| AC-19 | State-driven | While `observation_mode == "one_face"` 且状态为 `running`，系统**必须**使 `observe()` 返回的 `face_colors` 恰好包含 1 个面，且未请求的面以缺失键表达（不使用 `null` 占位）。 |
| AC-20 | State-driven | While `observation_mode == "three_face"`，When 调用 `rotateView()` 后再次 `observe()`，系统**必须**返回新朝向下可见的 3 个面（即"三面可见"而非"永久只能看三个面"）。 |

### 14.4 计步与判定（F06 / F07）

| 编号 | 类型 | 验收标准 |
|---|---|---|
| AC-21 | Ubiquitous | 系统**必须**使每条**已定稿**的转动事件使 `move_count` 增量恒为 1（`R`、`R'`、`R2`、`Rw`、`3Rw`、`2R`、`M/E/S`、以及归并产生的 `X2` 事件同样计 1）；视角旋转与观察调用的增量恒为 0。**`move_count` 必须等于事件数**，不得按层数累加、不得按角度除以 90 |
| AC-22 | Ubiquitous | 系统**必须**为每个 `MoveEvent` 记录 `layer_count`、`turn_amount`、`axis`、`layer_set` 四个字段，且可由其重算出 `HTM-layer` 计步结果。 |
| AC-23 | Event | When 2 阶 6 面各单色但处于任意整体朝向，系统**必须**判定为已还原。 |
| AC-24 | Event | When 3 阶 6 面各单色但处于任意整体朝向，系统**必须**判定为已还原。 |
| AC-25 | Event | When 4 阶 6 面各单色且"面→颜色"映射等于标准配色方案的任一 24 旋转，系统**必须**判定为已还原。 |
| AC-26 `[v2.0 修订]` | Unwanted | If 4 阶 6 面各单色但"面→颜色"映射为镜像配色（不属于 24 个合法旋转），系统**必须**判定为**未还原**，且未还原的原因**必须可区分**（当前实现：`SubmitResult.mismatch.reason === 'invalid-scheme'`）。<br>**修订理由**：原文要求返回 `INVALID_STATE`，该对外错误码不存在（阅读规则 G9）。真实流程中镜像配色不可能出现（合法转动无法达成，只有物理拆装或未来的非法导入路径会触发），为它现在扩错误码表不划算；补 `E_INVALID_STATE` 列为 P1。**判定本身（必须判未还原）已实现**：`engine/solved.ts` 做单色 + 双射 + 手性 `det = +1` 三重校验 |
| AC-27 | Event | When `move_count == move_limit` 且该步执行后已还原，系统**必须**先进入 `solved_pending` 并锁定 `result == "solved"`（还原优先于步数耗尽）；后续提交或自动提交**必须**产出 `finished/solved`。 |
| AC-28 | Event | When `elapsed_ms` 首次超过 `time_limit_ms` 且状态不是 `solved_pending`，系统**必须**在 200ms 内将 `result` 置为 `"timeout"`，且此后 `applyMove` 必须返回 `{ok:false, error_code:"TIMEOUT"}`；且 **UI 必须在状态迁移的同一渲染帧内禁用并置灰全部输入控件（按钮矩阵、键盘通道、会话按钮），最迟不超过 200ms**，不得等用户下一次操作才体现（v1.9 / v1.10）。若当前为 `solved_pending`，不得判超时，结果保持 `solved`。 |
| AC-29 | Unwanted | If 调用 `submitSolution()` 时状态为 `running` 且未还原，系统**必须**返回 `{accepted:false, error_code:"NOT_SOLVED"}` 且**不终止**挑战；同一 run 内累计第 3 次失败时**必须**将 `result` 置为 `"invalid_submission"` 并终止。`solved_pending` 下提交成功 → `result: "solved"`。 |
| AC-30 | Event | When 人类玩家点击"放弃"并确认，系统**必须**将 `result` 置为 `"aborted"` 并保留终止前全部事件。 |
| AC-75 `[v2.0 修订]` | Event | When `applyMove` 后满足还原条件，系统**必须**进入 `solved_pending` 而非任何 `ended_*` 终态；**人类与 Agent 一律须显式 `submitSolution()`** 才进入 `ended_solved`（`auto_submit_on_solved` 默认 `false`）；`solved_pending` 下 `applyMove` 抛 `E_CUBE_ALREADY_SOLVED`，`observe` / `rotateView` / `submitSolution` 仍可用，**不可暂停**，**超时不得覆盖已锁定的 `solved`**。<br>**修订理由**：v1.10 原文是"人类 `auto_submit_on_solved=true` 时自动提交"，但该字段在 `settings.ts` 里定义后**全库无消费者**，实测人类同样停在 `solved_pending` 需手点提交。v2.0 改文档对齐代码（默认 `false`，人机一致）。<br>**交付状态（2026-10-26 更正）："超时不得覆盖 `solved`" 已实现**：`session.tick()` 在 `paused` 与 `ended_*` 之外也排除 `solved_pending`；回归用例见 `tests/challenge/session.test.ts` 的「D1：solved_pending 不被超时覆盖」两条。原登记的 D1 缺陷与「无测试覆盖」结论均已过时（2026-10-26 更正） |

### 14.5 键盘与操作（F03）

| 编号 | 类型 | 验收标准 |
|---|---|---|
| AC-31 | Event | When 在 `running` 态按下裸键 `W`/`A`/`S`/`D`/`X`/`Q`，系统**必须**分别提交 `U`/`L`/`F`/`R`/`D`/`B`，且 `input_channel == "keyboard"`。 |
| AC-32 | Event | When 按住 `Shift` 再按任一面键，系统**必须**提交对应的逆时针指令（`U'`/`L'`/…）。 |
| AC-33 | Event | When 在 300ms 内按下**同一面键 + 同一层集合 + 同一转向**两次且其间无其他输入，系统**必须**使最终状态等于该操作 `X2`、`move_count` 增量 = 1、且只产生 1 条 `MoveEvent`（`merged_from` 记录两次原始输入）。不同转向（如 `D` 后 `Shift+D`）或不同层集合不得归并。 |
| AC-34 | Event | When 按下前缀键 `2` 后按面键 `D`（R 面；3/4 阶），系统**必须**提交 `Rw`；按下 `3` 后按 `D`（仅 4 阶）**必须**提交 `3Rw`；按下 `Z` 后按 `D`，**4 阶必须**提交 `2R`、**3 阶必须**提交 `M'`；按下 `Z` 后按 `A`（L 面键），**4 阶必须**提交 `2L`、**3 阶必须**提交 `M`。`2`+`D` `D` 必须产出 `Rw2`（开放事件保留层集合）。**系统不得存在 `C` 前缀**（按下 `C` 不产生任何转动） |
| AC-35 | Unwanted | If 按下前缀键后 3 秒内无面键输入，系统**必须**取消该前缀状态，且状态栏不再显示"将提交"预览。 |
| AC-36 | Unwanted | If `event.repeat === true`（长按连发），系统**必须**忽略该 `keydown`，`move_count` 不增。 |
| AC-37 | Ubiquitous | 系统**必须**不注册任何 `Ctrl` 或 `Cmd` 组合键处理器，且对 `Ctrl+W`、`Ctrl+T`、`Ctrl+N`、`Cmd+W` **必须**不调用 `preventDefault()`。 |
| AC-38 `[v2.0 修订]` | State-driven | While 状态为 `running` / `solved_pending` / `paused` **或任一 `ended_*` 终态**，When 按下 `Space`，系统**必须**不产生任何魔方操作、不改变 `move_count`、不改变暂停状态、不触发任何会话动作，且**必须**调用 `preventDefault()` 阻止页面滚动。<br>**修订理由**：v1.10 §5.3.4 写的"`finished` 态 `Space` = 返回配置"在 v1.9 把配置面板改为左栏常驻后已无落点，代码现状是 `ended_*` 下 `Space` 无动作。v2.0 追认现状（裁定 Q9），并把 `ended_*` 显式纳入本条覆盖范围 |
| AC-39 | State-driven | While 状态为 `ready`，When 按下 `Space`，系统**必须**将状态转为 `running`。 |
| AC-40 | Ubiquitous | 系统**必须**按**轴口径**满足联合覆盖：对任意三元组 `(axis, L, t)`——`axis` ∈ {x, y, z}（3 个）；`L` 为 `1..N` 上的**连续非空区间** `[a,b]` 且满足 `b-a+1 < N`（**排除整轴全层**，那是整体旋转，按 AC-66 拒绝）；`t` ∈ {`90顺`,`90逆`,`180`}——界面上**必须**存在一条可点击路径完成该操作。**验证方法：程序枚举全部三元组，逐个驱动 UI（键盘序列，或"层选择器选定连续区间 `L` + 点击该轴转向 `t` 按钮"），断言 `applyMove` 收到的规范化指令满足 `parse(describe(axis,L,t)) === (axis,L,t)` 且 `ok == true`。**三元组总数：2 阶 18 / 3 阶 45 / 4 阶 81，合计 144**（3 轴 × 连续真子集数 × 3 转向；2 阶 2 区间、3 阶 5 区间、4 阶 9 区间）。**采用轴口径而非面口径**：面口径存在跨面冗余（2 阶 `2R` ≡ `L'`、3 阶 `3R` ≡ `L'`、4 阶 `4R` ≡ `L'` 都是同一物理层换个面命名），会对同一物理操作重复计数。**不要求每个三元组都有独立键盘按键**，键盘只需覆盖 §5.6 列出的高频子集 |

### 14.6 Agent API（F08）

| 编号 | 类型 | 验收标准 |
|---|---|---|
| AC-41 | Ubiquitous | 系统**必须**在页面内暴露 `window.cubeAgent`，其自有属性**必须**只包含方法（`getChallengeInfo`、`observe`、`rotateView`、`applyMove`、`getLastActionResult`、`getProgress`、`submitSolution`、`getChallengeResult`、`abandonChallenge`），**不得**包含可回溯到引擎实例的对象型属性。 |
| AC-42 `[v2.0 修订]` | Event | When 在 `running` 态调用 `applyMove("R")`，系统**必须**返回 **13 个平铺字段** `{op_id, deduplicated, move, layer_count, turn_amount, axis, layer_set, state_fingerprint_after, move_count, elapsed_ms, remaining_ms, solved, next_observation}`（**键必须存在，不得省略**；失败时不返回而是抛 `CubeError`，故无 `ok` 键）。其中 `state_fingerprint_after` 的取值受观察模式约束：`observation_mode === "full"` 时返回真实指纹；**`observation_mode !== "full"` 时必须为 `null`**（理由见 [`05-dust-observation.md`](05-dust-observation.md) §8.6）。挑战结束后由 `getChallengeResult` 正常返回最终指纹。<br>**修订理由**：v1.10 #55 写的是"统一为 8 字段 `{ok, move, layer_count, turn_amount, state_fingerprint_after, move_count, remaining_ms, observation_id}`"，但实现是 13 字段、无 `ok` 键、无根级 `observation_id`（它在 `next_observation` 里）。实现已经过四轮评审与 `tests/` 覆盖，改回 8 字段需重写全部调用方与测试且无产品收益，故以实现为准。字段语义见 [`07-agent-api.md`](07-agent-api.md) §7.4 |
| AC-43 | Event | When 调用 `observe()`，系统**必须**返回含 `observation_id` 的对象，且后续 `applyMove` 的返回值中 `observation_id` **必须**与该 `observation_id` 一致（用于关联"基于哪次观察做了决定"）。 |
| AC-44 | Unwanted | If 单帧内 `applyMove` 调用次数超过 60，系统**必须**返回 `{ok:false, error_code:"RATE_LIMITED"}` 且不改变状态。 |
| AC-45 | Ubiquitous | 系统**必须**使人机两条输入路径收敛到同一引擎入口：用键盘 `D` 键提交 `R` 与用 `applyMove("R")` 提交，在相同初始状态下**必须**产出相同的 `state_fingerprint_after`、相同的 `layer_count`、相同的 `move_count` 增量。 |

### 14.7 记录、结果与回放（F09 / F10 / F11）

| 编号 | 类型 | 验收标准 |
|---|---|---|
| AC-46 | Event | When 挑战结束，系统**必须**生成 `Run` 对象并写入 `localStorage`，字段覆盖 13.3 全部项。 |
| AC-47 | Event | When 打开回放并点击“下一步” `k` 次，系统**必须**使画面状态等于第 `k` 条 `MoveEvent` 的 `state_fingerprint_after`（`ViewEvent` / `SessionEvent` 不计入步序）。 |
| AC-48 | Event | When 在回放中拖拽进度条到第 `k` 步，系统**必须**在 300ms 内将画面与日志定位到第 `k` 步。 |
| AC-49 | Ubiquitous | 系统**必须**在结果页同时展示三种计步口径，且各自带可断言的标签文本：`HTM`、`HTM-layer`、`QTM`（断言三个标签字符串均存在于结果页 DOM，且三者旁各有一个数值节点）。默认排序与默认展示使用 `HTM`。 |
| AC-50 | State-driven | While `engine_version` 与当前引擎不一致，When 打开该次回放，系统**必须**在顶部显示旧版引擎提示并要求确认后才开始播放。 |
| AC-51 | Unwanted | If `localStorage` 的 `getItem` / `setItem` 均抛异常，系统**必须**在顶部渲染非阻塞提示条，且在无存储条件下**完整走通**"创建挑战 → 连续 10 次 `applyMove` → `submitSolution` → 结果页渲染"全流程且不抛未捕获异常；历史列表渲染为空态而非报错。 |
| AC-52 | Ubiquitous | 系统**必须**在结果页展示"本机测量，未经服务端校验"与"难度为启发式估计，非最短解距离"两条标注，且不可被配置关闭。 |
| AC-53 | Unwanted | If WebGL 上下文创建失败（`canvas.getContext("webgl2")` 与 `"webgl"` 均返回 `null`），系统**必须**降级到 2D 展开图模式，并在该模式下同时满足三项断言：① 键盘提交 `R` 后 `move_count` 增 1；② 同一题面的还原判定结果与 3D 模式逐条一致；③ `Run` 记录正常写入。三项缺一即失败。 |
| AC-54 | Ubiquitous | 系统**必须**使界面功能图标全部为 `<svg>` 元素（断言：所有带图标语义的元素 `tagName === "svg"`），且 DOM 中**全部文本节点**的字符**不得**落在 U+2700–27BF、U+2600–26FF、U+1F300 以上三个区间（命中数必须为 **0**）。 |

### 14.8 暂停语义（F18）

> **冻结索引说明（v1.10）**：AC-55 / AC-56 的旧口径（暂停期间 `elapsed_ms` 继续累加、暂停中超时判负）已作废，按附录 C 冻结规则保留号位并标 `[已废弃]`；现行口径由 **AC-73 / AC-74** 承接。下表的 AC-57~AC-60 与 AC-73/74 继续有效。

| 编号 | 类型 | 验收标准 |
|---|---|---|
| AC-57 | Unwanted | If 在 `paused` 态调用 `observe` / `applyMove` / `rotateView` / `submitSolution`，系统**必须**返回 `{ok:false, error_code:"PAUSED"}`，且 `move_count` 与 `state_fingerprint` **必须**均不变。 |
| AC-58 | Ubiquitous | 系统**必须**不向 `window.cubeAgent` 暴露 `pause` / `resume` 方法（Agent 模式不支持暂停）；且 Agent 模式下界面**必须**不渲染暂停按钮。 |
| AC-59 | Event | When 一次运行中发生 `N` 次暂停，系统**必须**在 `Run.metrics` 中记录 `pause_count == N` 与 `paused_total_ms`，且在结果页显示"本次运行包含 `N` 次暂停（共 `M` 秒），计时已扣除。"（v1.9 改写） |
| AC-60 | Event | When 人类玩家在 `running` 态点击暂停，系统**必须**在事件流中追加一条 `type:"pause"` 的 `SessionEvent`；点击继续时追加一条 `type:"resume"`，两者均含 `at_ms`。 |
| AC-73 | State-driven | While 状态为 `paused`，When 经过 `Δ` 毫秒后调用 `getProgress()`，系统**必须**返回 `elapsed_ms` 增量为 `0`（容差 ±50ms），`remaining_ms` 不变；恢复后从冻结点继续（替代已废弃的 AC-55）。 |
| AC-74 | Unwanted | If 在 `paused` 期间等待任意时长，系统**必须不**触发超时判定；`result` 保持非 `timeout`（替代已废弃的 AC-56）。 |

### 14.9 180° 归并机制的实现约束（§5.4）

| 编号 | 类型 | 验收标准 |
|---|---|---|
| AC-61 | Event | When **同一面键 + 同一层集合 + 同一转向**在 300ms 内被按下两次且其间无其他输入，系统**必须**满足：① 最终 `state_fingerprint` 等于**直接执行该 `(layerSet, X2)`** 得到的指纹；② 事件流只新增 **1** 条 `MoveEvent`；③ `move_count` 净增 **1**；④ 该事件 `turn_amount == 180` 且 `merged_from.length == 2`。不同转向或不同层集合不得归并。 |
| AC-62 | Unwanted | If 归并发生，系统**必须**不产生任何逆操作事件（事件流中不得出现 `R'` / `U'` 等被插入的逆向 `MoveEvent`）；且该面在该次归并期间的旋转角度轨迹**必须单调不回退**（0° → 90° → 180°，不得出现 90° → 0° → 180° 的闪回）。验证方式：测试钩子采样每次渲染帧的目标角度序列并断言单调性。 |
| AC-63 | Ubiquitous | 系统**必须**使归并产生的 `MoveEvent` 与 Agent 直接提交 `X2` 产生的 `MoveEvent` 在 `move`、`turn_amount`、`layer_set`、`axis`、`state_fingerprint_after` 五个字段上完全一致（仅 `raw_input` / `merged_from` / `input_channel` 允许不同）。 |
| AC-76 | Event | When 300ms 内同面键第二次按下，系统**必须**仅在该次与开放事件具有相同 `layerSet` 且相同 `turn_amount` 时归并；不同转向（`D` 后 `Shift+D`）或不同层集合必须产生两条独立 `MoveEvent`。前缀双击（`2`+`D` `D`）必须按开放事件保留的层集合产出 `Rw2`。 |

### 14.10 蒙尘补充约束（对应 §8.2 C4 / C6）

| 编号 | 类型 | 验收标准 |
|---|---|---|
| AC-64 | Unwanted | 系统**必须**在 `Object.getOwnPropertyNames(window.cubeAgent)` 与 `Object.getOwnPropertyNames(window)` 中**均不出现** `getDebugState`、`getSolution`、`getScramble`、`getFullState` 任一标识符。且 While 状态为 `ready` / `running` / `paused` / `solved_pending`，When 调用 `getChallengeInfo()`，返回值的 `seed`、`scramble`、`facelet_string`、`state_fingerprint` 字段**必须**均为 `null`。 |
| AC-65 | Ubiquitous | 系统**必须**在 API 层（而非渲染层）执行观察裁剪。断言方式：当 `observation_mode` 为 `one_face` / `three_face` 时，对 `observe()` 返回值做 `JSON.stringify`，其结果**必须同时满足**：① 不出现未授权面的面名键（`U`/`D`/`L`/`R`/`F`/`B` 中未授权的那些）；② 不出现 6 个贴纸色的色值字符串；③ 键名集合是"授权字段集"的**子集**（白名单断言，非黑名单）。 |
| AC-77 | Ubiquitous | 系统**必须**在 `ready` / `running` / `paused` / `solved_pending` 期间对 `localStorage` 与 `getChallengeInfo()` 执行字段白名单：不得出现 `state_snapshot`、`facelet_string`、`state_fingerprint`、`scramble`、`seed`；`getChallengeInfo()` 对这四个题面字段必须返回 `null`。 |

### 14.11 整体旋转口径（§5.3.4）

| 编号 | 类型 | 验收标准 |
|---|---|---|
| AC-66 | Unwanted | If 对 `applyMove` 传入任何整体旋转记法（`x`、`x'`、`x2`、`y`、`y'`、`z2` 等），系统**必须**返回 `{ok:false, error_code:"ORIENTATION_NOT_MOVABLE"}`（对外标识 `E_NOTATION_ORIENTATION_NOT_MOVABLE`），且 `state_fingerprint` **必须**不变、`move_count` **必须**不增、`MoveEvent` **必须**不产生。 |
| AC-67 | Ubiquitous | 系统**必须**使 `rotateView()` 成为整体旋转的唯一通道：调用后 `state_fingerprint` **必须**不变、`move_count` **必须**不增，且只产生 `ViewEvent`（含 `axis`/`direction`/`steps`），**不得**产生 `MoveEvent`。 |
| AC-68 | Ubiquitous | 系统**必须**保证人机权限一致：人类无法用键盘提交整体旋转（不注册 `x`/`y`/`z` 面键），Agent 无法用 `applyMove` 提交整体旋转（AC-66）。二者只能各自通过视角通道改变观察方向。 |

### 14.12 输入完整性（不得静默丢弃）

| 编号 | 类型 | 验收标准 |
|---|---|---|
| AC-69 | Unwanted | 系统**必须**不静默丢弃任何合法的面键输入。具体：If 在 180° 归并窗口（300ms）内到达的是**不同**的面键，系统**必须**立即执行该面键对应的转动，并保留已执行的前一步（不得回退、不得改写、不得丢弃其中任何一个）。验证方式：注入 `W` 后 120ms 注入 `Q`，断言事件流中恰好新增 2 条 `MoveEvent`（`U` 与 `B`）、`move_count` 净增 2、`state_fingerprint` 等于按序执行 `U` 再 `B` 的结果。 |
| AC-70 | Ubiquitous | 系统**必须**按**经 §5.4.1 输入整形后的规范化 move 序列**比较人机一致性：同一规范化序列，无论来自键盘、按钮还是 `applyMove`，`move_count` 与事件序列必须一致。键盘 300ms 内同面/同层/同向双击表达的是 `R2` 意图（1 条事件 1 步）；`applyMove('R')` 调用两次表达的是两次独立意图（2 条事件 2 步）。**禁止**在归并判定之后按输入通道再做任何差异化处理（不得“键盘已归并、API 再合并一次”，也不得“键盘不归并、API 归并”） |

### 14.13 记法往返恒等（§5.7）

| 编号 | 类型 | 验收标准 |
|---|---|---|
| AC-71 | Ubiquitous | 系统**必须**保证 `describeMove` 与记法解析互为逆运算：**对全部 144 个 `(axis, L, t)` 三元组，必须满足 `parse(describeMove(axis, L, t)) === (axis, L, t)`（轴、层区间、转向三项全等）**。验证方式：程序遍历 144 个三元组，先 `describe` 再 `parse`，逐项断言相等；任一组不等即失败。**理由**：若某条记法的输出无法被解析回原三元组，日志里就会出现"能显示但重放不了"的字符串，回放会静默失败——这是最难排查的一类缺陷。同时该 AC 保证 `describeMove` 的输出域必然落在 §5.1 的记法正则内 |

### 14.14 界面呈现与唯一真源一致（§5.3.2.1 / AC-40 的补充）

| 编号 | 类型 | 验收标准 |
|---|---|---|
| AC-72 | Ubiquitous | 系统**必须**保证"层选择器显示"与"将提交的指令"由**同一个** `layerSet` 唯一真源派生，二者不得脱钩。具体：When 点击任一操作 tab 的按钮（如 G4 的 `3Rw`），层选择器**必须**同步显示该按钮对应的层区间（断言：选择器宿主元素的 `data-layer-set` 属性值等于该按钮的规范化层区间，如 `[1,3]`）；When 手动改动层选择器，tab 中与该区间不符的高亮**必须**全部取消。**禁止**出现"点了 `3Rw` 但层选择器显示 `层 1`"的错位——那会让用户以为自己在转单层，而实际提交的是三层宽转 |

### 14.15 v2.0 新增条目（按附录 C 冻结规则追加在表末，不插入、不重排）

| 编号 | 类型 | 验收标准 |
|---|---|---|
| AC-78 | Event | **（F09a，P0）** When 挑战进入任一 `ended_*` 终态且用户点击"回放过程"，系统**必须**在结果页/中栏原地按事件流重放该次运行：① 从**已还原态**起播、按 `MoveEvent` 顺序逐步施加；② 每一步用**回放态**为该步上色（不是用当前实时状态）；③ 重放期间**不得修改任何原始记录**、不得产生新事件；④ 点击"重置"必须同时复位相机并停止回放。**本条描述的是已交付的 F09a**；独立回放页与进度条/调速/单步/三视角属 F09b（P1），见 AC-47 / AC-48 / AC-50 的降级标注 |
| AC-79 | Ubiquitous | **（v2.0 裁定）** 系统**必须**使 `autoSubmitOnSolved` 的默认值为 `false`，且人类与 Agent 两类参与者的默认值**必须相同**（不得按参与者类型差异化）。该配置项**必须**保留在设置模型中（供 P1 接线），但接线前**不得**有任何代码路径读取它来自动结算。断言：还原后不点提交，状态**必须**停在 `solved_pending`，`move_count` 与 `state_fingerprint` 不再变化 |
| AC-80 | Ubiquitous | **（v2.0 追认实现）** 系统的转动按钮矩阵 tab 组成**必须**为：2 阶 = 单层(18) + 自由层(6)；3 阶 = 单层(18) + 中层(9) + 宽转(18)；4 阶 = 单层(18) + 宽转 2(18) + 宽转 3(18) + 内层(10) + 自由层(8)。**视角控件不是 tab**，它在中栏舞台区。任一 tab **不得**折叠隐藏，峰值同屏控件数**必须** ≤ 19（18 按钮 + 1 层选择器）。「自由层」tab 允许任意多选层槽，但**非连续组合必须由"将提交"预览串显示 `—` 来拦截**（记法无法序列化非连续区间），不得静默丢弃、不得提交非法指令 |
| AC-81 | State-driven | **（P1，当前未实现）** While 视角已转到使被转动层处于背面/被遮挡方位，When 执行一次转动，系统**必须**在被转动层的可见外缘渲染 2px 轮廓描边，以标识"转的是哪一层"。**当前状态**：`render/layer-outline.ts` 已实现并入场景（预留 1 个 draw call），但 `shell.ts` 的 `onLayerHover` 是空实现、`show()` 全库无调用者，因此描边从不出现。`execution/verification.md` 的端到端断言 E 在接线前**必然失败**，不得据它判验收通过 |

#### AC-40 的覆盖性论证（为什么这条能过）

AC-40 不要求每个三元组配一个专用按钮，它要求"存在一条可点击路径"。这条路径只需**一条组合**就够：

> **G1 的 18 个按钮（6 面 × 3 转向）+ 层选择器的 9 个区间 = 162 个面组合。**

而 4 阶的轴三元组是 **3 轴 × 9 区间 × 3 转向 = 81 个**。162 恰好是 81 的两倍，因为**每个轴区间都正好有 2 个面表示**（x 轴区间可由 R 侧或 L 侧命名，两者等价）。因此：

- **G1 + 层选择器这一条路径就覆盖了 AC-40 的全部三元组**；
- 其余 4 个 tab（G3 / G4 / G5 / G6）是**纯捷径**，不是覆盖性所必需。

这个论证反过来约束了层选择器的能力边界：它**必须能表达全部 9 个区间**（4 阶）。少一个区间，对应三元组的可点击路径就断了。

| 阶数 | 连续区间数（排除整轴全层） | 轴三元组 | 面组合 |
|---|---:|---:|---:|
| 2 | 2（`[1]` `[2]`） | 18 | 36 |
| 3 | 5（`[1]` `[2]` `[3]` `[1-2]` `[2-3]`） | 45 | 90 |
| 4 | 9（4 个单层 + 3 个双层 + **2 个三层**：`[1-3]` `[2-4]`） | 81 | 162 |
| 合计 | — | **144** | 288 |

> **易漏点**：4 阶的 9 个区间里有 **2 个三层区间**（`[1-3]` = `3Rw`、`[2-4]` = `3Lw`）。若层选择器只做"单层 + 双层"，会漏掉 G4 那一整组，AC-40 随之失败。

#### AC-40 与 `move_catalog` 是两个不同维度（勿混用）

| 项 | AC-40 | `move_catalog`（架构契约） |
|---|---|---|
| 回答的问题 | **界面上有没有可点击路径**能完成这个物理转动 | **Agent 能下哪些合法指令串** |
| 计数维度 | **物理上不同的转动**（轴口径，别名去重） | **可提交的指令串**（含同物异名的别名 token） |
| 2 阶 | 18 | 18 |
| 3 阶 | 45 | 99 |
| 4 阶 | 81 | 162 |
| 用途 | QA 验收 | Agent 读的"我能下哪些指令" |

**为什么不一致且不矛盾**：

- **3 阶 45 vs 99**：`move_catalog` 把 `2R`、`2L`、`M` 这三个 token 都算作合法指令（同一个中间层有 3 种写法），而 AC-40 的轴口径只把它算作**一个**物理转动。差出来的 54 正是"同一物理转动的不同命名"。
- **4 阶 81 vs 162**：面口径（6 面 × 9 区间 × 3 转向 = 162）里每个轴区间都有正好 2 个面表示，轴口径去重后是 81。`move_catalog` 保留两种面命名，因为它要告诉 Agent"这两种写法都收"。
- **2 阶 18 = 18**：因为 2 阶只有 1 个可用区间，且 `2R` 这类前缀被 AC-07 拒绝，两个口径恰好重合。

**给 QA 的话**：验收 AC-40 时按 18 / 45 / 81 建用例；看到 `move_catalog` 的 18 / 99 / 162 不要当成错误。

---

