# ob-cube 代码与规格复审报告 R2

| 项目 | 本轮取值 |
|---|---|
| 审查日期 | 2026-10-26，版本日期按 UTC 记录 |
| 仓库 | `obisoldbee/ob-cube` |
| 上轮基线 | `c6236e2817394ff30fca92c083f79de4ff578ef3` |
| 修复提交 | `02ace80c34544b5e42740dffd921fbfba5b51fdc` |
| 本轮锁定版本 | `DeepSeek` 的 `2e03f8aee8bb44623b647037c58afeeebdc41c05` |
| 审查对象 | 修复代码、R01–R13 回归测试、修复裁定、OPEN-DECISIONS，以及用户提供的浏览器测试文字记录 |
| 工作方式 | 只读评审。未修改、提交或推送项目代码 |
| 验证级别 | 源码与调用链核验，另执行 8 个源码逻辑的隔离探针。未运行完整项目测试或本轮真实浏览器测试 |

## 1. 评审结论

**本轮建议为需要修改。上轮若干修复已经落地，仍有 8 项实现问题需要处理，其中 3 项 P1、5 项 P2。另有 1 项受限观察的产品口径需要单独裁定。**

主要修复已经可以在代码中看到，包括未结束阶段的 seed 门控、普通 API 操作后的画面同步、同题运行 ID 校验、`solved_pending` 中断保存，以及结果中保存原始打乱序列。[Agent 接口][S02]、[挑战会话][S01]、[装配层][S03]。

本轮发现集中在组合路径。人类切换视角时，3D 授权面遮罩未更新；`after_move` 的界面读取绕过显式观察交付；双击之间插入视角事件，会破坏事件序号和时间顺序。此外，别名指令重试、当前成绩与历史中位数的时间口径、回放初始视角等仍有具体缺口。逐项证据见第 3 节。

开发方报告的 **25 个测试文件、292 条通过**属于上一轮执行结果。本轮已经阅读新增测试及其断言，但没有重新执行该测试套件。[修复实现报告][S14]、[主要回归测试][S10]、[键盘回归测试][S11]。

优先处理 R2-01 至 R2-04，再补真实浏览器验证。其余问题按结果统计和审计记录任务处理。Q01 应与这些代码修复分开，先统一规则，再调整相应实现。

### 1.1 版本核对

远端读取结果与用户贴出的提交信息一致。

| 远端分支 | 核对到的提交 |
|---|---|
| `main` | `c6236e2817394ff30fca92c083f79de4ff578ef3` |
| `fix/review-2026-10-26` | `02ace80c34544b5e42740dffd921fbfba5b51fdc` |
| `DeepSeek` | `2e03f8aee8bb44623b647037c58afeeebdc41c05` |

`2e03f8a` 的提交内容只涉及 `memory/2026-10-26.md`，应用修复位于 `02ace80`。本报告所有源码链接固定到 `2e03f8a`，避免分支后续推进造成引用漂移。[提交明细](https://github.com/obisoldbee/ob-cube/commit/2e03f8aee8bb44623b647037c58afeeebdc41c05)。

## 2. 上轮 R01–R13 的复核结果

下表的“代码已对应修正”表示本轮读到了对应实现与测试。完整执行验证状态统一见第 7 节。

| 上轮用例 | 本轮结论 | 已有证据与剩余缺口 |
|---|---|---|
| R01 未结束时隐藏题面元信息 | 代码已对应修正 | `getChallengeInfo()` 使用 `!isEnded(status)`，覆盖四个未结束状态；新增测试逐态断言 |
| R02 API 操作与画面同步 | API 主路径已修，GUI 路径有新缺口 | `onApiMutate()` 调用 `syncVisual()`；人类视角按钮缺少同等遮罩刷新，见 R2-01 |
| R03 仅剩一步的双击归并 | 原窄场景已覆盖，事件交叉仍有问题 | 测试覆盖直接 `R2`、连续双击、窗口到期；缺少双击之间的视角及观察事件，见 R2-03 |
| R04 `2 D D` 保留宽转层集合 | 代码已对应修正 | 键盘保存上一按的完整层规格，新增 3 条测试覆盖意图、会话计步及窗口过期 |
| R05 观察预算 | API 自动交付已统一，整体语义仍待明确 | `deliverObservation()` 统一显式和自动交付；`after_move` 面板、状态提示及 R-4 的实时画面例外见 R2-02、R2-07、Q01 |
| R06 观察编号与操作依据 | API 自动观察主路径已修 | 交付递增编号，事件记录 `based_on_observation_id`；界面直接投影及归并后的状态变化仍需补测 |
| R07 末步成功后幂等重试 | 规范记法场景已修 | 缓存命中前置到终态检查之前；合法别名重试仍报冲突，见 R2-04 |
| R08 `solved_pending` 刷新保存 | 状态机和卸载接线已修 | `interrupt()` 与 `beforeunload` 均覆盖该状态；本轮未执行真实刷新落盘测试 |
| R09 同题不同 run 的隔离 | 代码已对应修正 | 新 run ID 带递增计数，调用统计清零，指定旧 run ID 会报错 |
| R10 观察者回放 | 部分修复 | `view_after` 已入事件，按动作步恢复面集合；相机、开始前朝向与观察交付轨迹仍有缺口，见 R2-06 |
| R11 保存原始题面后重建 | 保存内容和数据级重建已对应修正 | 结果增加 `scramble`、其指纹及生成器版本；测试使用内存存储重载后校验初始指纹 |
| R12 成功运行的可比统计 | 过滤已改，展示口径混用 | 已过滤失败和部分不同规则记录；历史取还原时刻，当前取总耗时，见 R2-05 |
| R13 超限事件记录 | 尾部保留已实现，完整记录仍未完成 | 增加 `events_dropped`，保留 `end`；头部动作和视角仍可能被删，OD-07 保持 OPEN |

依据来自[主要回归测试][S10]、[键盘回归测试][S11]及对应的[会话][S01]、[接口][S02]、[历史服务][S05]实现。

## 3. 本轮需要修改的实现问题

P1 表示影响核心操作、观察规则或事件完整性，建议在本轮修复验收前处理。P2 表示具体接口、统计或回放缺陷，应独立建项并补回归。

### R2-01 · P1 · 人类切换视角后，3D 授权面遮罩仍停在旧朝向

**位置**

`wiring/index.ts` 的 `applyReveal()`、`applyView()`、`ports.viewStep()`、`ports.faceView()`、`guard()`、`sync()`。同时核对了 `render/scene.ts` 的渲染循环。[装配层][S03]、[场景渲染][S16]。

**实际调用链**

API 的 `rotateView()` 会经过 `onApiMutate()` 和 `syncVisual()`，其中调用 `applyReveal()` 并重新给贴纸赋材质。

人类点击视角按钮或按方向键时，代码只修改 `session.viewOrientation` 并调用 `setCamera()`。随后 `guard()` 执行的 `sync()` 更新界面面板，没有为正常 3D 路径调用 `applyReveal()` 或 `applyFacelets()`。`stage.render()` 也只更新相机、绘制场景，未补这次授权面更新。

**复现步骤**

1. 使用 `three_faces` 开始挑战，初始授权面为 `U/F/R`。
2. 不执行转动，通过人类方向键或视角按钮把前面换为 `L`。
3. 对照观察面板、会话授权面和实际贴纸材质。

根据当前调用链，面板会使用新授权面，3D 的 reveal 集合仍保留旧值。新进入视野的已授权面可能仍显示为遮蔽色，旧面仍保留颜色。单面模式同样受影响。2D 降级路径在 `sync()` 中另有刷新，因此需要分别测试两条路径。

**修改建议**

所有成功的离散视角变更统一触发授权面及材质刷新。相机动画可以继续保留，但相机目标、授权面和观察面板必须来自同一份视角状态。

**验收**

覆盖人类四方向键、六面视图、Home 复位及 API `rotateView()`。分别在 `single_face`、`three_faces` 下核对实际有色贴纸所在的世界面，不能只断言相机位置或画布像素变化。

**证据级别**

源码调用链确认。本轮未在浏览器中执行上述交互。

### R2-02 · P1 · `after_move` 的面板读取绕过交付，成功观察也没有及时刷新界面

**位置**

`challenge/session.ts` 的 `peekObservation()`、`shouldAutoDeliver()`、`deliverObservation()`；`agent/index.ts` 的 `observe()`；`wiring/index.ts` 的 `observationView()`；`ui/shell.ts` 的观察面板端口。[会话][S01]、[API][S02]、[装配层][S03]、[界面端口][S08]。

**第一处缺口在 `peekObservation()`。** 它只对 `restricted` 返回 `lastDelivered`，其余模式直接执行 `buildObservation()`。因此 `after_move` 虽然禁止自动交付，并要求调用方显式 `observe()`，页面观察面板仍可直接拿到当前颜色布局。

例如先成功观察一次，再转动或改变观察方向。在尚未显式获取下一份观察时，面板可以出现新数据，编号却仍沿用当前 `obsSeq`。这与 R-2 的“显式取用”和 R-4 表格中的“面板返回已交付快照”存在差异。[本轮裁定 R-2、R-4][S12]。

**第二处缺口在 API 回调。** `agent.observe()` 只有在 `session.status` 发生变化时才调用 `after()`。普通成功观察会更新 `lastDelivered`、编号和预算，却通常保持 `running`。面板不会立即收到刷新。当前帧循环仅定期更新挑战信息，未周期性刷新观察面板。

这在 `restricted` 模式中特别明显。开始时面板显示尚未获得观察；Agent 首次成功 `observe()` 后，面板可能继续显示旧提示，直到下一次变更操作。

此外，当前 `ObservationPanel` 的界面端口只有复制观察 ID，没有显式获取观察的动作。选择 `after_move` 的人类玩家缺少与新裁定对应的操作入口。

**修改建议**

把 `after_move` 和 `restricted` 的结构化面板都改为显示已交付快照，成功交付后显式通知界面。为需要主动取用观察的模式提供按钮或明确的自动交付规则。按钮、键盘及记法输入应采用同一观察策略。

源码还对人类记法输入传入 `deliver=false`，而按钮和键盘默认走自动交付。相同动作的观察预算消耗目前会随输入入口变化，这项差异也应纳入统一处理。[记法输入接线][S03]。

**验收**

不改变挑战生命周期，只调用一次 `observe()`，面板就应更新到新编号。`after_move` 在未成功交付前保持上一快照；观察动作入口明确可用。相同物理动作通过不同输入渠道执行时，交付次数符合同一条已确认规则。

**证据级别**

源码确认，隔离探针 P01、P02 验证了回调不触发和旧编号对应新投影的分支。未进行浏览器端复现。

### R2-03 · P1 · 双击之间插入视角操作，会产生重复事件序号和倒序时间

**位置**

`ui/keyboard.ts` 的方向键处理、`handleFace()`；`challenge/session.ts` 的 `canMerge()`、`commitMerged()`、`pushEvent()`。[键盘][S04]、[会话][S01]。

**触发条件**

在 300ms 窗口内执行 `D → 方向键 → D`。方向键会产生 `view` 事件，但不会清除键盘保存的上一按，也不会关闭 Session 的 `lastTurn`。第二次 `D` 仍可进入归并。

`commitMerged()` 删除第一次转动的事件。此时它后面的视角事件仍保留原序号。新事件通过 `events.length + 1` 编号，会重用该视角事件已经占用的序号；随后又把新事件的 `at_ms` 改回第一次按键的时间。

下面是对这些数组操作的隔离演算。

```text
归并前
seq=1  start  t=0
seq=2  R      t=10
seq=3  view   t=80

归并后
seq=1  start  t=0
seq=3  view   t=80
seq=3  R2     t=10
```

结果同时出现重复序号和数组中的时间倒序。最终魔方状态可以仍然正确，但日志顺序、视角归属和回放解释已经受损。

另一个相关边界是 `after_move`。第一次 90° 后显式观察，会把 `lastObservedMoveCount` 记成 1；归并后的 `R2` 仍计 1 步。当前门控比较的是步数，新的物理状态可能被视作已经观察过，拒绝第二次观察。[`observationUnlocked()` 与归并实现][S01]。

**修改建议**

明确哪些事件会关闭归并窗口。较简单的实现是视角变化、显式观察、暂停和渠道切换前，先定稿当前开放动作。事件序号使用独立的递增计数，避免依赖可删除数组的长度。观察是否过期使用状态版本，而不是会被归并保持不变的 `moveCount`。

R-3 已选择回到转前状态重算，本报告按这条现行裁定评审。需要修正的是它对已发出事件、观察和时间顺序的处理。[R-3][S12]。

**验收**

对 `D → 方向键 → D`、`D → observe → D`、`D → pause/resume → D` 分别断言序号唯一、时间顺序明确、状态指纹链连续，以及观察版本正确。原来的“连续两个按键且没有插入事件”用例继续保留。

**证据级别**

源码确认，隔离探针 P03 得到了上面的重复序号。未运行完整键盘与 Session 联合测试。

### R2-04 · P2 · 同一个合法别名指令重试，会被判为 `op_id` 冲突

**位置**

`challenge/session.ts` 的 `applyMoveNotation()` 缓存分支，`engine/notation.ts` 的 `canonicalNotation()`。[会话][S01]、[记法归一化][S09]。

第一次操作把规范化后的记法保存在 `cached.move`，重试时却使用 `cached.move !== raw` 比较。

以四阶 `2Rw` 为例，解析器接受它并归一化为 `Rw`。以下两个完全相同的请求，第二次会比较 `Rw` 与 `2Rw`，从而抛出 `E_OP_ID_CONFLICT`。

```javascript
cubeAgent.applyMove('2Rw', { op_id: 'retry-alias' });
cubeAgent.applyMove('2Rw', { op_id: 'retry-alias' });
```

R07 只用已经规范化的 `R2` 重试，因此没有覆盖这条分支。[R07 测试][S10]。

**修改建议**

明确幂等的请求比较口径。可以保存原始请求，与原始请求比较；也可以对两边都规范化后比较。使用后一种方案时，终态重试仍需先正确命中原缓存。

**验收**

至少覆盖 `2Rw`、四阶 `3R`、三阶 `2R` 等可归一化别名。相同请求与相同 `op_id` 返回 `deduplicated=true`；真正不同的动作才返回冲突。重试不增加步数、不改观察预算。

**证据级别**

源码确定性路径，隔离探针 P04 核对了当前比较结果。未运行项目解析器的完整测试。

### R2-05 · P2 · 当前成绩显示总耗时，历史中位数却使用还原耗时

**位置**

`services/history.ts` 的 `medianSolvedElapsed()`；`ui/panels/result-panel.ts` 的 `metrics()`；`wiring/index.ts` 的 `resultView()`。[历史服务][S05]、[结果面板][S06]、[装配层][S03]。

历史中位数明确优先读取 `solved_at_ms`，缺失时回退到 `elapsed_ms`。结果卡片显示的仍是当前运行的 `elapsedMs`，并把这个历史中位数附在“总耗时”下方。

例如两次运行都在第 10 秒还原，第 30 秒提交。当前卡片会显示总耗时 30 秒，旁边的同题中位数为 10 秒。界面把两个不同终点的指标放在同一比较位置。旧记录缺失 `solved_at_ms` 时，历史样本内部也会混用两个终点。

OD-06 仍登记为 OPEN，开发方报告称主指标口径尚未单方面改变；实际历史比较已经先采用了其中一种口径。[未决项][S13]、[修复报告][S14]。

**修改建议**

在 OD-06 裁定前，可以让当前值与历史值都使用现有的 `elapsed_ms`。采用还原耗时后，则统一当前值、历史样本、标签和 TPS 分母，并把提交时间独立展示。旧记录缺少对应字段时标记不可比，或在明确的兼容分组中展示。

**验收**

增加有明显提交等待时间的成功记录，检查整张结果卡片，而不只是测试中位数函数。明确处理缺少 `solved_at_ms` 的旧记录。

**证据级别**

源码确认，隔离探针 P05 得到当前 30000ms、历史中位数 10000ms。

### R2-06 · P2 · 观察者回放只恢复了部分面集合，未恢复完整视角与观察轨迹

**位置**

`challenge/session.ts` 的 `viewAtStep()`；`wiring/index.ts` 的 `replayVisibleFaces()`、`paintReplay()`、`seekReplay()`。[会话][S01]、[回放接线][S03]。

本次新增 `view_after` 后，已经能按动作步推导部分历史面集合，但仍有两处明确缺口。

**开始前选择的视角在第 0 步丢失。** `rotateView()` 允许 `ready` 状态使用，事件会记录该次选择。`viewAtStep(events, 0)` 却在读取第一个事件之前就因 `moves >= step` 退出，并返回默认 `U/F`。当前调用也没有传入实际的运行初始视角。

**历史相机未随回放步更新。** `paintReplay()` 设置授权面和贴纸颜色，没有将相机设置为该步的历史朝向。结束时的相机可能一直保留，新恢复的授权面却位于另一侧。R10 测试仅比较面名数组，未覆盖实际相机和可见结果。[R10][S10]。

当前事件中还没有完整的观察交付记录。对于 `after_move`，动作发生与观察交付分属两个时刻。现有按 move 步号重建的方式，无法完整回答某一步决策前实际交付了哪份结构化快照。产品若需要这种回放，应补记录模型，或明确当前界面只提供动作与离散视角回放。

**修改建议**

保存每轮的 `initial_view`，回放时同步恢复对应相机。进一步区分动作步、视角事件和观察交付事件。对于缺失历史字段或已截断的记录，明确展示可恢复范围。

**验收**

开始前选非默认视角，开始后多次换视角，结束时停在另一面；拖动回放到第 0 步及各历史步，分别检查相机、授权面和颜色。再覆盖 `after_move` 转动后尚未观察的状态。

**证据级别**

源码确认，隔离探针 P07 验证了第 0 步返回默认朝向。本轮未执行完整回放 UI 流程。

### R2-07 · P2 · 预算耗尽后 `getProgress()` 仍提示允许观察

**位置**

`challenge/session.ts` 的 `getProgress()`、`observationUnlocked()`、`canDeliverObservation()`。[会话][S01]。

`observation_allowed` 只检查运行状态和 `after_move` 的步数条件。`restricted` 下 `observationUnlocked()` 恒为真，因此第 24 次交付后仍会返回 `observation_allowed=true`，紧接着调用 `observe()` 却抛出预算耗尽错误。

**修改建议**

该字段应同时包含观察预算条件。后续可以增加剩余预算或拒绝原因字段，但这需要同步更新公开契约；本次最小修复是先让现有布尔值准确。

**验收**

在第 23 次、第 24 次交付后分别检查进度，再分别通过显式观察和操作后自动观察耗尽预算。所有入口下的提示与实际许可保持一致。

**证据级别**

源码确认，隔离探针 P06 得到许可提示为真、交付条件为假。

### R2-08 · P2 · API 返回内部缓存引用，调用方可以反向改坏幂等结果

**位置**

`agent/index.ts` 的 `Object.freeze(api)`、`getLastActionResult()`；`challenge/session.ts` 的结果缓存和查询方法。[API][S02]、[会话][S01]。

目前冻结的是包含九个方法的 API 对象。`applyMove()`、`getLastActionResult()` 和观察查询仍会把内部保存的对象直接返回给调用方。

例如读取某次结果后，在本地整理数据时改写 `result.move`，实际会修改 `opCache` 中的对象。同一个原始操作再次重试时，可能因缓存内容已被改写而报冲突。观察数据及其嵌套数组也存在共享引用。当前 PRD 对返回对象有冻结要求。[API 契约 §7.1][S15]。

```javascript
const result = cubeAgent.applyMove('R', { op_id: 'a' });
result.move = 'U';
// 当前 result 与内部缓存共享引用，后续重试所比较的 move 已改变。
cubeAgent.applyMove('R', { op_id: 'a' });
```

**修改建议**

在公开边界返回与内部存储隔离的只读数据。可使用复制后的 DTO 并冻结嵌套结构，或让内部快照从创建时就不可变。只冻结根对象时，仍需检查 `face_colors`、`visible_faces`、事件及 `next_observation` 的嵌套引用。

**验收**

对公开返回值的根字段与嵌套字段尝试写入，内部缓存、历史事件、真实状态和后续重试结果均保持原值。

**证据级别**

源码确认，隔离探针 P08 验证了冻结 API 容器仍会留下可变的结果引用。

## 4. Q01 · 受限观察的产品规则已经发生变化，需要明确确认

这项应作为产品契约处理，与第 3 节的确定性代码缺陷分开。

R-4 开头把一次观察定义为向参与者交付一份新的颜色布局，并强调所有入口同规则；同一裁定的理由第 3 条又允许 3D 画面持续显示实时颜色，把预算限定为结构化快照的交付次数。[R-4 原文][S12]。

当前实现符合后一种解释的部分行为。API 预算用尽后返回 `next_observation=null`，画面仍按当前状态刷新。这会使 API Agent 与通过截图、按钮操作的 GUI Agent 受到不同的信息限制。用户最初明确要求 Agent 也能通过页面按钮观察和还原，因此这项差异会直接影响测试分组。

建议在以下两种规则中明确选择，并同步名称、测试和结果字段。

| 规则 | 需要实现的行为 | 适用的评测描述 |
|---|---|---|
| 结构化观察配额 | 保留实时画面，限制 `observe` 与自动结构化快照；明确标注预算只约束结构化接口 | 比较相同结构化接口规则下的 Agent，不与可持续看图的运行混为同组 |
| 全渠道信息受限 | API、DOM 面板、3D、2D 都使用授权快照；预算耗尽后冻结在最后交付内容或遮蔽 | 比较相同信息预算下的 GUI/API Agent，需同时固定相应操作和计时规则 |

本报告不把实时画面单独列成“违背 R-4 已确认规则”的代码缺陷。需要处理的是裁定内部的两种表述、原评测目的与“任何入口都不再交付新题面”的测试标题之间的差异。R05 当前只断言 API 与 `peekObservation()`，没有验证画面，也无法替产品选择其中一种规则。[R05][S10]。

另外建议调整 OPEN-DECISIONS 的处理方式。

| 未决项 | 本轮建议 |
|---|---|
| OD-01 难度公式 | 先修正文档中与公式不符的算例。正式校准阈值可以等待运行数据，算术勘误可以立即完成。登记册中的“至少 30 条”应说明来源或标为暂定采样计划 |
| OD-05 双击归并 | 正式评测优先采用显式 180° 入口；练习模式保留可选双击。即使暂时保留当前规则，也要先修 R2-03 的事件错误 |
| OD-06 主指标 | 建议主成绩使用还原耗时，提交时间独立记录。决定落地前先消除 R2-05 的同卡片混用 |
| OD-07 记录截断 | 可暂缓分块持久化，但结果必须明确标注动作与视角分别缺失的范围，回放应识别缺口 |
| OD-08 契约正文 | 将已经执行的裁定写回规范正文。裁定、实现报告和测试标题应使用同一种语义 |

以上均为本轮建议，未写入项目或关闭任何 OPEN 条目。[未决项登记册][S13]。

## 5. 对附加浏览器测试记录的复核

用户提供的 `粘贴的文本 (1)(7).txt` 包含测试过程及最终总结。本轮读取的是文字记录，未取得其中提到的 21 张原始截图、完整浏览器日志或测试脚本。因此这里区分记录中的观测、源码能确认的行为和仍需重测的判断。

| 原记录中的项目 | 本轮复核意见 | 后续处理 |
|---|---|---|
| 超时后大计时器为 `0:00.00`，已用时间约 `2:00.11` | 代码在有限时模式下让大计时器显示 `remainingMs`，已用时间另行显示。两个数值对应不同指标 | 给大计时器补明确的“剩余时间”标签；保留实际耗时。参考 `challenge-panel.ts` 的 `shown` 选择 |
| toast 隐藏后仍在 DOM | 当前使用单个 `toastEl` 复用，隐藏节点是该实现的一部分 | 应处理播报属性，节点是否移除不作为缺陷 |
| toast 缺少读屏播报 | `shell.ts` 创建 toast 时未设置 `role` 或 `aria-live`，挂载位置也没有对应的 live region | 增加合适的状态播报机制，并验证连续提示的播报行为 |
| 题库默认改为二阶，换阶后回到随机 | `wiring` 明确让预设题绑定自身阶数，默认第一条预设；换阶不匹配时回退随机 | 这是当前规则。补提示，或按当前阶数筛选预设，属于交互优化 |
| 退出回放被键位图遮挡 | 文字记录中有一次命中测试证据，后续在键位图折叠后无法复现 | 保留为条件性问题。固定“键位图展开”及 `2341×1334` 等尺寸再测，不写成已经稳定复现或已经修复 |
| 长驻 5173 服务自动刷新 | 新服务及 preview 未复现，只能确认出现过刷新且环境相关。记录没有给出确定的刷新触发来源 | 保留原因未定。捕获文档导航、Vite WebSocket/HMR 事件及服务端日志后再归因 |
| 性能已降级徽标出现，说明降级机制正常 | 当前主循环根据帧时间设置提示；已读代码未显示该分支同时降低分辨率、抗锯齿或其他渲染质量 | 可确认检测与提示触发。实际性能降级措施另行验证，或将文案改为“帧时间偏高” |
| 结果页重复出现“同题面重跑” | `primary === 'rerun'` 时主按钮使用该文案，次按钮列表又无条件添加同一动作 | 源码可确认，删除重复的次按钮即可 |
| 小视口需要滚动才能开始 | 记录后续确认左栏可以内部滚动，且没有持续证明主要控件不可达 | 按目标最小尺寸验证可达性和滚动提示，当前保留为体验优化 |

源码依据分别见[计时器][S07]、[toast 挂载][S08]、[预设接线及性能提示][S03]、[结果按钮][S06]、[场景配置][S16]。附件相关内容位于其末尾“待处理问题”及前面的重复测试过程。

浏览器的 `requestAnimationFrame()` 在后台标签页通常会暂停。单个较大的帧间隔还需要结合可见性和运行环境解释，不能直接换算为前台持续帧率。这里只将它作为性能复测的取样条件。[MDN 的 requestAnimationFrame 文档](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)。

## 6. 建议追加的回归测试

保留已有 R01–R13，以下用例补足跨通道、跨事件和 UI 接线。表中均为待加入项目并运行的验收用例。

| 编号 | 场景 | 必须检查的结果 |
|---|---|---|
| T01 | `three_faces` 下通过人类方向键、面视图按钮换面 | 相机目标、面板和 3D 实际有色面一致 |
| T02 | `single_face` 下切换六面并复位；另跑 2D 降级 | 当前只有授权面显示颜色，两条渲染路径规则一致 |
| T03 | `after_move` 观察一次，随后转动或换视角但不显式观察 | 结构化面板保持已交付快照，不能用旧 ID 展示新状态 |
| T04 | `restricted` 开始后仅调用一次 `observe()`，不再执行其他变更 | 观察面板及观察 ID 立即刷新，成功交付不依赖状态迁移 |
| T05 | 通过显式观察和自动观察分别用尽 24 次预算 | `observation_allowed` 与实际许可一致，计数口径准确 |
| T06 | 300ms 内执行 `D → 方向键 → D` | 事件序号唯一、时间顺序明确、回放视角归属正确 |
| T07 | `after_move` 下第一次 90° 后观察，再完成同键归并 | 新物理状态使用新的状态版本，观察权限符合选定的定稿规则 |
| T08 | 对 `2Rw`、`3R`、三阶 `2R` 使用同一 `op_id` 重试 | 正确命中缓存，不重复计步；不同物理操作仍报冲突 |
| T09 | 改写 `applyMove`、`observe`、`getLastActionResult` 的返回值和嵌套字段 | 内部状态、缓存、历史事件、后续重试均不被改写 |
| T10 | 两次都 10 秒还原、30 秒提交，并加入旧格式记录 | 当前值、历史中位数、标签和 TPS 使用一致且可识别的口径 |
| T11 | 开始前换到非默认视角，之后回放到第 0 步 | 恢复实际初始视角，而非固定 `U/F` |
| T12 | 多次切换视角后结束，在观察者回放里逐步拖动 | 相机、授权面与对应状态一致，不能只检查面名数组 |
| T13 | `after_move` 中部分动作之后未观察 | 回放明确区分动作发生与结构化观察交付 |
| T14 | Q01 确认后的 API、DOM、3D、2D 信息预算 | 按选定规则核对全部入口；结果记录操作模式与观察规则版本 |
| T15 | 真实浏览器中解出确定性题目，在 `solved_pending` 刷新 | 实际 localStorage 留下 `ended_solved`，`submit_ms=null`，重进可查看 |
| T16 | 动作与视角分别超过事件阈值，导出后再检查记录 | 保留终局，同时明确缺失范围，回放识别不完整记录 |
| T17 | 键位图展开后打开回放，覆盖大屏和最小目标尺寸 | 退出按钮可见且可点击，命中测试落在按钮或其子元素 |

测试分为三层执行。纯规则测试覆盖状态、事件、幂等和预算；装配层测试覆盖成功观察通知与渲染接线；真实浏览器测试覆盖贴纸授权、相机、回放交互和刷新落盘。

## 7. 本轮实际完成的检查

| 检查 | 实际结果 |
|---|---|
| 远端分支与提交读取 | 已完成，锁定 `2e03f8a` |
| 核心修复代码与相关调用链 | 已读取 Session、Agent、wiring 相关段落，以及键盘、历史、UI、记法和渲染实现 |
| 新增回归断言审阅 | 已读取主要 R01–R13 文件及键盘归并文件 |
| 修复裁定与未决项 | 已读取 R-1 至 R-6、OPEN-DECISIONS、修复实现报告及当前 API 契约相关条文 |
| 用户浏览器测试文字记录 | 已读取，已区分源码确认、条件性观测和待复测项目 |
| 隔离逻辑探针 | Node `v22.16.0` 下执行 8 项；均得到预设的反例输出 |
| 完整项目获取 | 本地 `git clone` 失败，运行环境无法解析 `github.com`；后续源码通过 GitHub 连接器逐文件读取 |
| 项目类型检查、292 条测试、生产构建 | 本轮未执行。开发方的通过记录保留为已有报告证据 |
| 本轮真实浏览器验证 | 未执行。当前 Browser 接口只提供标签页读取，且本轮未取得可运行的完整本地工程 |
| 仓库修改 | 无 |

### 7.1 隔离探针的范围与结果

探针从已读源码中转写相关函数或表达式，使用固定输入和依赖替身检查分支、引用与数组操作。它们没有加载完整项目、真实魔方引擎或浏览器，不计入仓库的测试数量。

| 探针 | 实际输出 |
|---|---|
| P01 成功观察的 API 回调 | 已取得 `run:o1`，通知回调次数仍为 `0` |
| P02 `after_move` 的只读投影 | 原快照和新投影均为 `run:o1`，数据却分别是 `before` 与 `after` |
| P03 归并跨过视角事件 | 序号变成 `[1,3,3]`，时间变成 `[0,80,10]` |
| P04 别名请求缓存比较 | 原输入 `2Rw`，缓存 `Rw`，结果为 `E_OP_ID_CONFLICT` |
| P05 当前与历史时间终点 | 当前总耗时 `30000`，历史中位数 `10000` |
| P06 预算耗尽的许可提示 | `observation_allowed=true`，交付条件为 `false` |
| P07 第 0 步回放朝向 | 实际初始选择 `U/R`，函数返回 `U/F` |
| P08 可变结果引用 | API 容器已冻结，结果未冻结；修改返回值后缓存中的 `move` 变为 `U` |

配套证据文件为 `isolated-probes.mjs` 与 `isolated-probes-results.json`，保存在本轮证据包中。验收仍以第 6 节的原工程回归和浏览器测试为准。

## 8. 交付与未解决项

本轮交付新的 Markdown 复审报告及隔离探针证据。报告保留旧问题的修复状态，新增问题使用独立编号，未覆盖或改写上一轮评审原文。

未解决项为 R2-01 至 R2-08 的项目内修复与执行验证、Q01 产品规则确认，以及真实浏览器中的遮罩、观察者回放、已还原刷新保存和条件性布局问题复测。

## 9. 源码索引

以下源码和项目文档均固定到本轮审查提交 `2e03f8aee8bb44623b647037c58afeeebdc41c05`。链接指向实际读取的原件。

| 编号 | 内容 | 路径 |
|---|---|---|
| S01 | 挑战会话及观察、归并、结果实现 | [`src/ob-cube/src/challenge/session.ts`][S01] |
| S02 | Agent 接口包装 | [`src/ob-cube/src/agent/index.ts`][S02] |
| S03 | 装配层及回放、渲染同步 | [`src/ob-cube/src/wiring/index.ts`][S03] |
| S04 | 键盘输入及双击识别 | [`src/ob-cube/src/ui/keyboard.ts`][S04] |
| S05 | 历史记录和成功耗时中位数 | [`src/ob-cube/src/services/history.ts`][S05] |
| S06 | 结果面板 | [`src/ob-cube/src/ui/panels/result-panel.ts`][S06] |
| S07 | 挑战信息和计时器 | [`src/ob-cube/src/ui/panels/challenge-panel.ts`][S07] |
| S08 | 界面端口及 toast 挂载 | [`src/ob-cube/src/ui/shell.ts`][S08] |
| S09 | 记法归一化 | [`src/ob-cube/src/engine/notation.ts`][S09] |
| S10 | 本轮主要回归测试 R01–R13 | [`src/ob-cube/tests/regression/review-2026-10-26.test.ts`][S10] |
| S11 | 键盘归并回归测试 R04 | [`src/ob-cube/tests/regression/keyboard-merge.test.ts`][S11] |
| S12 | 修复轮口径裁定 R-1 至 R-6 | [`docs/decisions/2026-10-26-review-fixes-ruling.md`][S12] |
| S13 | 未决项登记册 | [`docs/decisions/OPEN-DECISIONS.md`][S13] |
| S14 | 开发方修复实现报告 | [`docs/reports/2026-10-26-review-fix-report.md`][S14] |
| S15 | 当前 PRD 的 Agent API 契约 | [`docs/specs/prd/07-agent-api.md`][S15] |
| S16 | 3D 场景渲染及帧时间采样 | [`src/ob-cube/src/render/scene.ts`][S16] |

附件文字记录的 SHA-256 为 `bc25735910e1542627c25012a3b3334cb4419742e87a578b6269fc09f6c113a3`。它作为开发方浏览器测试过程的来源使用，未作为本轮浏览器执行结果。

[S01]: https://github.com/obisoldbee/ob-cube/blob/2e03f8aee8bb44623b647037c58afeeebdc41c05/src/ob-cube/src/challenge/session.ts
[S02]: https://github.com/obisoldbee/ob-cube/blob/2e03f8aee8bb44623b647037c58afeeebdc41c05/src/ob-cube/src/agent/index.ts
[S03]: https://github.com/obisoldbee/ob-cube/blob/2e03f8aee8bb44623b647037c58afeeebdc41c05/src/ob-cube/src/wiring/index.ts
[S04]: https://github.com/obisoldbee/ob-cube/blob/2e03f8aee8bb44623b647037c58afeeebdc41c05/src/ob-cube/src/ui/keyboard.ts
[S05]: https://github.com/obisoldbee/ob-cube/blob/2e03f8aee8bb44623b647037c58afeeebdc41c05/src/ob-cube/src/services/history.ts
[S06]: https://github.com/obisoldbee/ob-cube/blob/2e03f8aee8bb44623b647037c58afeeebdc41c05/src/ob-cube/src/ui/panels/result-panel.ts
[S07]: https://github.com/obisoldbee/ob-cube/blob/2e03f8aee8bb44623b647037c58afeeebdc41c05/src/ob-cube/src/ui/panels/challenge-panel.ts
[S08]: https://github.com/obisoldbee/ob-cube/blob/2e03f8aee8bb44623b647037c58afeeebdc41c05/src/ob-cube/src/ui/shell.ts
[S09]: https://github.com/obisoldbee/ob-cube/blob/2e03f8aee8bb44623b647037c58afeeebdc41c05/src/ob-cube/src/engine/notation.ts
[S10]: https://github.com/obisoldbee/ob-cube/blob/2e03f8aee8bb44623b647037c58afeeebdc41c05/src/ob-cube/tests/regression/review-2026-10-26.test.ts
[S11]: https://github.com/obisoldbee/ob-cube/blob/2e03f8aee8bb44623b647037c58afeeebdc41c05/src/ob-cube/tests/regression/keyboard-merge.test.ts
[S12]: https://github.com/obisoldbee/ob-cube/blob/2e03f8aee8bb44623b647037c58afeeebdc41c05/docs/decisions/2026-10-26-review-fixes-ruling.md
[S13]: https://github.com/obisoldbee/ob-cube/blob/2e03f8aee8bb44623b647037c58afeeebdc41c05/docs/decisions/OPEN-DECISIONS.md
[S14]: https://github.com/obisoldbee/ob-cube/blob/2e03f8aee8bb44623b647037c58afeeebdc41c05/docs/reports/2026-10-26-review-fix-report.md
[S15]: https://github.com/obisoldbee/ob-cube/blob/2e03f8aee8bb44623b647037c58afeeebdc41c05/docs/specs/prd/07-agent-api.md
[S16]: https://github.com/obisoldbee/ob-cube/blob/2e03f8aee8bb44623b647037c58afeeebdc41c05/src/ob-cube/src/render/scene.ts

OB_CUBE_REVIEW_R2_COMPLETE
