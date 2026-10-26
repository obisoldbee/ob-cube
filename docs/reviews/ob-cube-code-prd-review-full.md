# ob-cube 代码与 PRD 审查报告

## 审查基线与检查范围

| 项目 | 内容 |
|---|---|
| 仓库 | `obisoldbee/ob-cube` |
| 代码基线 | 上一轮读取的 `main` 提交 `c6236e2817394ff30fca92c083f79de4ff578ef3` |
| 需求依据 | 附件 `specs(1).zip` 中的 specs v2.0 正文及 v2.1-dev 变更记录 |
| 附件清单 | 25 份 Markdown |
| 附件 SHA-256 | `7327d8585d1a6e375e5b4182ca77535843c57a33a2dc2caf6de072b25b7cc733` |
| 附件主 PRD 的 Git blob SHA-1 | `b4541a26f3467a5f33b678195fd3938ff088c59d`，与上一轮仓库返回的对应文件标识一致 |
| 审查方式 | 静态代码审查，对照需求、公共接口、状态机、渲染、输入、记录及回放实现 |
| 未执行的检查 | 类型检查、单元测试、构建、浏览器操作复现 |
| 仓库修改 | 无 |
| 本次整理 | 将上一轮审查全文导出为 UTF-8 Markdown，补齐独立可用的来源链接与结束标记；未重新拉取仓库或执行代码测试 |

代码基线与需求文件分别见提交记录和主 PRD。[^s17][^s09]

**建议先修复会改变评测结果的缺陷，再验收 Agent 评测功能。** 当前最重要的问题集中在题面信息泄露、API 与画面不同步、双击计步、观察记录和历史复现。

下文的复现路径是根据静态代码提出的回归测试设计，尚未执行。所有代码路径均相对于 `src/ob-cube/src/`。严重度反映问题对产品目标的影响，不代表已经完成浏览器实测。

## 一、优先修复的代码问题

### 1. 挑战开始后返回 seed，Agent 可以直接重建打乱序列

**严重度高，影响所有 Agent 评测。**

`agent/index.ts` 的 `getChallengeInfo()` 只在 `ready`、`idle` 状态隐藏 seed。进入 `running` 后就返回真实值。specs 的 C3、C4、AC-64、AC-77 则要求在整个未结束阶段持续隐藏，包括 `running`、`paused` 和 `solved_pending`。[^s02][^s10]

`puzzle/puzzle.ts` 又提供了确定性的生成链路，seed、阶数和生成规则足以重新生成 scramble。Agent 因此可以取得打乱序列，再执行逆序逆操作，绕过原本要测试的观察和还原过程。[^s04]

**复现路径**

开始挑战后调用 `window.cubeAgent.getChallengeInfo()`，检查 `seed`。当前代码会返回实际种子。

**建议修复**

为未结束状态建立统一的公开数据投影，`getChallengeInfo()` 始终隐藏 seed 和 scramble，完整复现资料在结束后的结果中提供。测试要遍历全部状态，尤其覆盖 `running` 和 `solved_pending`。

### 2. Agent 的操作改变了状态，但普通转动没有同步到 3D 画面

**严重度高，影响观看 Agent 操作，也影响依赖截图继续判断的 Agent。**

人类操作走的是下面这条链路。

```text
applyTurn() → session.applyIntent() → animate(spec)
```

Agent 操作走另一条链路。

```text
cubeAgent.applyMove() → session.applyMoveNotation() → onApiMutate() → sync()
```

问题在于，`sync()` 更新面板、日志和结果，只有 2D 降级模式会调用 `updateNet()`。正常 3D 模式下，普通的 `running → running` 转动没有调用 `animate()` 或 `applyFacelets()`。`tickAndSync()` 只在挑战状态发生迁移时补上 `repaint()`。[^s03]

视角也有相同问题。API 的 `rotateView()` 修改会话中的朝向，回调没有调用 `stage.rig.applyView()`；人类视角按钮的路径则会调用。[^s02][^s03]

**复现路径**

在一次转动后仍未还原的局面中，通过 API 执行 `R`、`U`，比较返回的颜色矩阵与画面。再通过 API 修改 `{up, front}`，检查相机是否随之变化。

**建议修复**

把成功操作后的渲染同步收敛到统一通道。按钮、键盘、记法输入和 API 都产生标准化的操作结果，由装配层统一处理动画、贴纸更新、视角和日志。当前“共用 Session”已经做到，渲染侧还没有做到同一套处理。

### 3. 双击归并发生在提交之后，会在步数边界判错结果

**严重度高，直接影响胜负和人机步数对比。**

`challenge/session.ts` 的 `applyIntent()` 先调用 `commit()`，之后才执行 `mergeLastIntoDouble()`。但 `commit()` 已经完成了计步、还原判定和步数耗尽判定。[^s01]

因此，系统会先按两次独立的 90° 操作处理，再尝试把日志改成一次 180° 操作。终止状态可能在归并前就已经产生。

**最有价值的回归用例**

构造一个只差 `R2` 即可还原、且剩余 1 步的局面。

- API 执行 `R2`，可以在 1 步内还原。
- 键盘快速双击对应面键，第一次 90° 就耗尽剩余步数，第二次无法完成预期的归并。

剩余 2 步时也有风险。第二次 `commit()` 可能已经添加 `end` 事件，而归并函数要求最后两条都是 `move`，于是归并被跳过。[^s01]

此外，`ui/keyboard.ts` 在第一次面键后立即清除前缀。按 `2`、`D`、`D` 时，第二个 `D` 会按外层解释，无法保留第一次的宽转层集合，得到规格要求的 `Rw2`。[^s05]

**建议修复**

按照 specs 的“开放事件”规则，在动作定稿前完成归并，再做正式计步与步数终止判定。待归并动作必须保存完整的面、层集合、方向和输入时间。

PRD 是否继续保留双击归并，也值得重新决定，第二部分第 5 项单独说明。

### 4. 受限观察只限制了 observe()，其他入口仍能取得新题面

**严重度高，影响已经开放的观察难度模式。**

`observe()` 检查了 `restricted` 的 24 次预算，也检查了 `after_move` 的开放条件。但是每次成功转动时，`commit()` 直接调用 `buildObservation()`，把新题面放进 `next_observation`，没有经过预算检查，也没有消耗观察次数。[^s01]

这会形成一个明确的绕过路径。用尽 24 次观察后，显式调用 `observe()` 被拒绝，继续 `applyMove()` 仍然能收到新的颜色布局。

页面观察面板也通过 `peekObservation()` 直接读取当前颜色。正常 3D 游戏的 `repaint()` 没有设置授权面遮蔽；`setReveal()` 目前主要用在观察者回放里。相机拖动只改变相机，因此受限模式下仍存在从画面观察其他面的路径。[^s03][^s06][^s07]

**建议修复**

先在 PRD 中定义“一次观察”的含义，然后统一实现。

推荐把一次向参与者交付新颜色布局定义为一次观察。显式 `observe()`、操作后的自动观察，以及会展示新题面的界面更新，都遵守同一规则。只读查询历史快照可以不消耗预算，但应返回原快照，不能重新读取当前状态。

预算耗尽后的 `applyMove()` 可以继续执行，返回值中的观察部分应明确表示当前不可获取，不能继续携带新颜色。

### 5. 新观察没有新编号，操作依据也没有写入事件

**严重度高，影响逐步评测和过程复盘。**

目前只有 `observe()` 会递增 `obsSeq`。`applyMove()` 自动返回的 `next_observation` 使用 `buildObservation()`，不会递增编号。于是 Agent 按“观察一次，然后连续使用每步返回的新观察”执行时，不同状态可能一直使用同一个 `observation_id`。[^s01]

`agent/index.ts` 接收了 `based_on_observation_id`，但只是原样放进返回值，没有传给会话层，也没有写入对应的 `RunEvent`。事件仍然使用会话当前的 `obsSeq` 自动生成关联。[^s02]

这与 PRD 要求的“记录本次决策所依据的观察”存在直接差异。[^s11]

**建议修复**

区分三个字段。

| 字段 | 用途 |
|---|---|
| `state_revision` | 每次成功转动后递增，标识魔方状态版本 |
| `observation_id` | 标识实际交付的一份观察快照 |
| `based_on_observation_id` | 写入操作事件，记录该操作依据哪份观察 |

同时规定过期观察的处理方式。可以拒绝，也可以允许执行并标记滞后，但必须能从日志中准确还原。

### 6. 已还原、未提交时刷新页面，结果会丢失

**严重度高，影响成功记录的保存。**

specs §7.3 明确要求，`solved_pending` 状态关闭或刷新页面时，应保存为 `ended_solved`，并保留 `submit_ms = null`。[^s12]

当前两处实现都只接受 `running` 和 `paused`。

一处是 `ChallengeSession.interrupt()`，另一处是装配层的 `beforeunload` 监听。`solved_pending` 会被直接跳过；该状态又尚未进入正常的结束保存流程。[^s01][^s03]

**建议修复**

进入 `solved_pending` 时就保存成功检查点。显式提交再补充提交事件和提交时间。这样刷新结算可以从已有检查点完成，成功记录的保存也更稳妥。

### 7. 历史记录缺少原始打乱序列，观察者回放使用了结束时的视角

**严重度高，影响最初要求的同题复现和多轮对比。**

这部分有两个独立缺口。

**题面持久化缺口**

`PuzzleRecord` 在内存里保存了完整 `scramble`，并把它定义为复现依据。`getChallengeResult()` 没有把该序列带入结果，`HistoryService.save()` 保存的又只有 `ChallengeResult`。因此历史记录没有保留原始打乱序列。当前版本还能依赖 seed 和同一生成器重建，生成算法升级后就缺少按原序列直接复现的资料。[^s04][^s01][^s08]

**观察者回放缺口**

`replayVisibleFaces()` 在观察者模式下调用当前的 `session.visibleFaces()`。回放逐步重建了转动状态，却没有逐步恢复当时的视角和观察权限。绝对视角操作的事件也没有保存完整目标朝向。结果是历史各步可能一直按结束时的可见面展示。[^s03][^s01]

**建议修复**

结束保存时写入原始 `scramble`、生成器版本、记法版本和初始指纹。事件中保存视角变化的完整目标值，以及观察快照或足以重建该快照的信息。观察者回放必须恢复每个历史时刻的授权视野。

### 8. 其他应一并修复的接口与统计问题

| 问题 | 当前实现及影响 | 建议 |
|---|---|---|
| `applyMove()` 返回契约漂移 | PRD 规定 13 个字段，外层 API 又添加 `ok`、根级 `observation_id`、`based_on_observation_id`，实际为 16 个字段 | 统一公共返回类型与契约测试，明确版本 |
| `runId` 参数被忽略 | `getChallengeResult(challengeId, _runId)` 只检查题目 ID，同题多次运行时可能返回另一轮结果 | 校验并按运行 ID 查询，或者明确接口只接受当前运行 |
| 末步重试无法正常命中幂等缓存 | `applyMoveNotation()` 先检查结束态、`solved_pending`，再查缓存；最后一步已经成功时，相同 `op_id` 的重试会先报错 | 明确已接受命令的重试语义，允许返回原执行结果 |
| 第二轮继承上一轮 Agent 统计 | `resetRun()` 没有重置 `agentCalls` 和 `agentMoves` | 按 run 清零，区分会话总计和本轮统计 |
| 同题中位耗时混入失败记录 | `compareElapsedMs()` 只筛选同题 ID 和正数耗时，放弃、超时及不同规则的记录都会进入中位数 | 成功耗时、成功率分别统计；对比时匹配规则与参与者信息 |

以上分别可在 Agent 包装层、会话层和装配层直接定位。[^s11][^s02][^s01][^s03]

## 二、PRD 本身需要调整的地方

### 1. 难度公式与文档自己的例子对不上

PRD 把“三阶、净有效步数不超过 6、涉及 2 至 3 个面”列为典型入门题，同时要求入门分数小于 3。[^s12]

按它自己的公式，仅三阶规模分和两个面的覆盖分就达到

```text
S + 0.8 × dF
= 2.5 + 0.8 × 2
= 4.1
```

其他加分项尚未加入，已经超过入门阈值。

另一个例子是三阶、20 个净有效步骤、覆盖六面、无宽转、完整观察、不限时、关闭蒙尘。代入得到

```text
2.5 + 0.8 × 6 + 0.5 × (20 / 10)
= 8.3
```

算法会判为高难度，文档却将“三阶标准 20 步随机打乱”列为典型常规题。这里需要修正公式、阈值或示例，并为每个示例补上可执行测试。[^s12]

此外，公式中的“2 秒每步”明确采用新手节奏假设。**建议将题面标签与挑战规则分开记录**，先用固定测试题集积累 Agent 成功率、步数和耗时，再校准面向 Agent 的难度分层。

### 2. “净有效步数”不适合承担最短解下限的验收

PRD 要求二阶最短解至少 4 步、三阶和四阶至少 2 步，又允许用化简后的打乱长度作为代理。[^s12]

从逻辑上，打乱序列的逆序提供的是一个可行解，因此其长度给出的是最短解长度的**上界**。要保证“至少需要这么多步”，需要排除更短的解。

**建议改成两类独立条件。** 生成器负责题面可达、非已还原、满足明确的过滤规则；需要最短解下限的专项题，再通过有界搜索或经过验证的固定题目验收。启发式分数继续用于展示和分组。

### 3. 随机操作生成的固定题集，也可以用于受控评测

PRD §6.5 因题面分布不均匀，直接把“标准化能力测试”和跨平台对比排除掉，这个约束过强。[^s12]

你的核心需求是同题多次运行、比较 Agent 的表现。对此，首先需要固定题集、固定规则、固定观察与操作接口，以及完整的实验记录。题集可以采用预设状态或固定种子的随机操作生成方式。

**建议保留生成方式说明，把评测范围写清楚。** 例如结果表述为“在题集 A、规则 B 下的成功率和耗时”，需要估计整个魔方状态空间上的表现时，再设计对应的采样方案。

### 4. 正式评测应记录操作方式，并与练习模式分开

你的原始描述强调 Agent 也通过页面按钮操作。现在 specs 的重点是 `window.cubeAgent`。这两种方式测到的能力不同，建议都保留，但分组统计。

| 维度 | 建议 |
|---|---|
| 练习模式 | 允许预观察、暂停、自由配置和同题重试 |
| 正式评测模式 | 锁定规则，统一开始流程，记录是否预观察和是否暂停 |
| GUI 操作 | Agent 通过截图或 DOM 读取页面，再使用按钮、键盘完成操作 |
| API 操作 | Agent 通过结构化观察和命令接口操作 |

每条运行记录至少带上 `control_mode`、评测配置版本、Agent 标识和运行批次。模型版本、提示词版本可以由外部执行器传入，无需第一版就建设模型托管服务。

现有 PRD 已经规定人类可以暂停、API 始终挂载，因此这些差异尤其需要进入对比筛选条件。[^s11][^s12]

### 5. 双击归并可以从正式评测的必需交互中移出

300ms 双击归并带来了前缀保留、开放事件、定稿计步、动画连续性，以及限时限步边界的一整套处理。当前缺陷正集中在这些交叉点。[^s05][^s01]

**我的建议是把显式 180° 操作作为稳定入口。** 按钮直接提供 90°、逆 90° 和 180°；键盘通过明确的快捷方式或模式选择提交一次 180° 意图。双击归并可保留为练习模式的可选便利功能。

计步规则仍可保留“一次 180° 算一步”。WCA 的 OBTM 同样把外层转动和外层块转动各计一步，整体旋转计零步；本项目另有内层与连续层区间操作，应补充自己的计步版本定义。[^s15]

### 6. 主成绩应使用还原耗时，提交等待单独记录

现在 `solved_pending` 已豁免超时，但 `elapsed_ms` 会继续增长到提交或结束，`tps` 又使用这个总时长作为分母。等待点击提交的时间会影响“还原速度”。[^s01]

建议成功成绩主要使用 `solved_at_ms`，保留 `submit_ms` 测量 Agent 何时声明完成。需要测试“自主判断已经完成”的场景，再单独比较提交延迟。失败运行用于成功率和失败原因统计，不进入成功耗时中位数。

时间边界也应明确采用命令接受时刻还是执行完成时刻。界面刷新另设体验指标。浏览器后台标签页通常会暂停 `requestAnimationFrame()`，所以“所有情况下最迟 200ms 更新 UI”不适合作为无条件验收标准。[^s16]

### 7. 完整实验记录与存储裁剪应分别设计

当前超过 2000 条事件时，会优先移除视角事件，再截取前 2000 条非视角事件。这样可能丢掉后续转动和结束事件。结果虽带截断标记，历史回放仍会缺少必要信息。[^s01]

你最初允许不限时间、不限步数，主要目的是记录 Agent 的尝试过程。建议只限制界面的可见日志行数，底层记录采用分块持久化。达到容量上限时明确提示和处理。

观察者回放需要保留视角及观察事件，不能默认将其作为最先丢弃的数据。普通还原动作回放与观察过程回放，可以使用不同的完整性标记。

### 8. 契约需要清理成当前规则，避免靠历史解释逐层修正

PRD §7.3 同时规定了“任何失败不得改变状态或产生事件”，以及“只读 API 可以触发超时结算”“错误必须留痕”“三次错误提交终止”。这些要求需要区分对象，否则开发按哪一条实现都会碰到另一条。[^s11]

建议改成更明确的规则。

**非法转动输入**不修改魔方状态、不消耗步数，可以记录诊断日志。**超时结算、提交校验和生命周期操作**按各自状态机规则更新并记录事件。

当前代码已经实现了观察模式配置、`after_move` 检查、`solved_pending` 超时豁免等，正文仍保留部分旧“未实现”描述，最新变更记录再解释其状态。建议需求正文只保留当前行为，交付状态集中在带提交版本的实现矩阵中。[^s03][^s01][^s13][^s14]

## 三、开发修复后的最低回归集

优先修复信息门控、操作同步、计步和记录，再调整难度公式与辅助统计。下面这些测试比继续增加界面功能更有价值。

本表共 13 条，均为待执行的回归用例。

| 编号 | 测试场景 | 必须达到的预期 |
|---|---|---|
| R01 | 遍历 `ready / running / paused / solved_pending` | 公开元信息接口始终隐藏 seed 和 scramble |
| R02 | API 执行普通转动、绝对视角切换 | 3D 画面、观察数据、日志与内部状态一致 |
| R03 | 只差 `R2`、剩余 1 步 | 显式 `R2` 与合法双击表达相同动作时，结果和计步一致 |
| R04 | `2`、`D`、`D` 在归并窗口内输入 | 保留宽转层集合，得到一条 `Rw2` |
| R05 | 用尽受限观察预算后继续转动 | 操作可以按规则执行，但所有入口都停止交付新题面 |
| R06 | 只观察一次，随后使用每步自动返回的观察 | 每份新观察可唯一识别，每个操作可追溯决策依据 |
| R07 | 最后一步成功后重复相同 `op_id` | 返回原执行结果，不重复计步，不丢失成功确认 |
| R08 | `solved_pending` 时刷新 | 保存成功记录，`submit_ms` 保持为空 |
| R09 | 同题连续运行两次 | run ID、统计、事件独立，按指定 run ID 获取正确结果 |
| R10 | 多次改变视角后进行观察者回放 | 每一步恢复当时实际获准看到的内容 |
| R11 | 保存记录后重载 | 使用保存的原始打乱序列重建，并校验初始指纹 |
| R12 | 同题同时存在成功、放弃、超时记录 | 成功耗时只统计符合相同规则的成功运行 |
| R13 | 运行超过事件数量阈值 | 明确验证记录完整性、截断行为及回放可用范围 |

## 来源索引

仓库链接固定到本报告审查的提交。文件整理时没有重新查询仓库后续变更。WCA、MDN 链接沿用上一轮报告引用的公开资料。

[^s01]: 会话状态机、计步、观察、幂等和结果导出。[`challenge/session.ts`](https://github.com/obisoldbee/ob-cube/blob/c6236e2817394ff30fca92c083f79de4ff578ef3/src/ob-cube/src/challenge/session.ts)

[^s02]: Agent 公共 API 包装层。[`agent/index.ts`](https://github.com/obisoldbee/ob-cube/blob/c6236e2817394ff30fca92c083f79de4ff578ef3/src/ob-cube/src/agent/index.ts)

[^s03]: 页面、会话、渲染、回放和历史统计装配层。[`wiring/index.ts`](https://github.com/obisoldbee/ob-cube/blob/c6236e2817394ff30fca92c083f79de4ff578ef3/src/ob-cube/src/wiring/index.ts)

[^s04]: 题面生成、打乱序列、版本和复现校验。[`puzzle/puzzle.ts`](https://github.com/obisoldbee/ob-cube/blob/c6236e2817394ff30fca92c083f79de4ff578ef3/src/ob-cube/src/puzzle/puzzle.ts)

[^s05]: 键盘前缀、双击归并窗口和转动意图。[`ui/keyboard.ts`](https://github.com/obisoldbee/ob-cube/blob/c6236e2817394ff30fca92c083f79de4ff578ef3/src/ob-cube/src/ui/keyboard.ts)

[^s06]: 贴纸上色、蒙尘和授权面显示。[`render/cube-view.ts`](https://github.com/obisoldbee/ob-cube/blob/c6236e2817394ff30fca92c083f79de4ff578ef3/src/ob-cube/src/render/cube-view.ts)

[^s07]: 相机拖动及离散视角切换。[`render/camera-rig.ts`](https://github.com/obisoldbee/ob-cube/blob/c6236e2817394ff30fca92c083f79de4ff578ef3/src/ob-cube/src/render/camera-rig.ts)

[^s08]: 本地历史记录保存与读取。[`services/history.ts`](https://github.com/obisoldbee/ob-cube/blob/c6236e2817394ff30fca92c083f79de4ff578ef3/src/ob-cube/src/services/history.ts)

[^s09]: 主 PRD。[`docs/specs/PRD.md`](https://github.com/obisoldbee/ob-cube/blob/c6236e2817394ff30fca92c083f79de4ff578ef3/docs/specs/PRD.md)

[^s10]: 蒙尘、元信息隐藏和观察权限要求。[`docs/specs/prd/05-dust-observation.md`](https://github.com/obisoldbee/ob-cube/blob/c6236e2817394ff30fca92c083f79de4ff578ef3/docs/specs/prd/05-dust-observation.md)

[^s11]: Agent API 契约、返回形状、错误处理和幂等。[`docs/specs/prd/07-agent-api.md`](https://github.com/obisoldbee/ob-cube/blob/c6236e2817394ff30fca92c083f79de4ff578ef3/docs/specs/prd/07-agent-api.md)

[^s12]: 难度公式、计时、暂停和终止判定。[`docs/specs/prd/04-scoring-judging.md`](https://github.com/obisoldbee/ob-cube/blob/c6236e2817394ff30fca92c083f79de4ff578ef3/docs/specs/prd/04-scoring-judging.md)

[^s13]: v2.1-dev 需求与契约变更记录。[`docs/specs/prd/CHANGELOG.md`](https://github.com/obisoldbee/ob-cube/blob/c6236e2817394ff30fca92c083f79de4ff578ef3/docs/specs/prd/CHANGELOG.md)

[^s14]: 既有开发进度报告，用于解释正文与交付状态的时间差；其中的测试通过记录是仓库自述，本次未独立复跑。[`docs/reports/2026-10-26-deepseek-branch-progress.md`](https://github.com/obisoldbee/ob-cube/blob/c6236e2817394ff30fca92c083f79de4ff578ef3/docs/reports/2026-10-26-deepseek-branch-progress.md)

[^s15]: WCA 官方规则，Article 12 中的 OBTM 计步定义。[WCA Regulations](https://www.worldcubeassociation.org/regulations/)

[^s16]: MDN 对 `requestAnimationFrame()` 和后台标签页暂停行为的说明。[Window.requestAnimationFrame()](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)

[^s17]: 本次审查固定的代码提交。[`c6236e2817394ff30fca92c083f79de4ff578ef3`](https://github.com/obisoldbee/ob-cube/commit/c6236e2817394ff30fca92c083f79de4ff578ef3)

报告结束

OB_CUBE_REVIEW_COMPLETE
