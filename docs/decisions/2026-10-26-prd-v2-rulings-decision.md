# 决策记录：PRD v2.0 口径裁定

| 字段 | 值 |
|---|---|
| 日期 | 2026-10-26 |
| 决策者 | 用户（产品主理人）+ Agent 建议 |
| 状态 | Accepted |
| 影响范围 | `docs/specs/` 全文档树、`design/design-tokens.*`、`src/ob-cube/src/` 的注释、`AGENTS.md`、`memory/` |
| 触发 | 用户要求"重新整理项目目录 + 澄清 PRD 与 specs 的关系 + 拆分 PRD + 先 review 代码与文档矛盾再出 v2.0" |
| 关联 | `docs/migrations/2026-10-26-directory-migration.md`（目录迁移）、`docs/reports/2026-10-26-implementation-status-report.md`（代码证据）、`docs/specs/prd/CHANGELOG.md`（变更条目 62–102） |

---

## 1. 背景

项目原有四份"权威"文档，`memory/MEMORY.md` 声明的优先级链是：

```
docs/PRD.md（验收唯一依据）→ docs/ARCHITECTURE.md（实现契约）→ docs/UIUX.md（设计）→ docs/specs/SPEC-v1.0.md（开发期唯一契约）
```

两个只读调研（开发进度矩阵、四文档矛盾全清单）查出三类结构性问题：

1. **`SPEC-v1.0.md` 停留在 PRD v1.3 时代的旧编号体系。** AC 索引在 PRD **v1.6** 才冻结，而 SPEC 基于 **v1.3** 生成，用的是冻结前编号（把蒙尘像素写成 `AC-22`，而现行 `AC-22` 是"MoveEvent 四字段"、蒙尘是 `AC-16`）。它的 F 编号也与 PRD 完全不同（SPEC 的 F12=暂停，PRD 的 F12=同题面重跑）。**而它自称"与上游文档冲突时，以本文件为准"**——最陈旧的文档声称最高权威，同时 memory 的优先级链又把它排在最末。
2. **`ARCHITECTURE.md` 记法章未随 `ss-2` 与九条裁决更新**：仍写 `ss-1`、规范形式 `2Rw`、区间 `2-3Rw`、面口径 `18/90/162`、`E_PAUSED`、seed 1–128、`random-walk`、`algorithm_version`。它的附录 C 还自建了第二套"唯一权威 AC 映射表"，与 PRD 附录 C 的规则 3（"其他文档必须引用本表编号，不得自创别名"）直接互斥。
3. **PRD 单方面升 P0 的两项从未落地**：F14 观察模式（v1.10 #54 升 P0，但 SPEC 锁定清单从未收录、代码无配置入口、`after_move` 无门控逻辑）与 §11.1 埋点（写"MVP 必须"，代码零实现）。形成"验收依据说要、开发契约说不在列表、代码里没有"的三角空洞。

**这个错误编号已经渗进代码**：`src/ob-cube/src/` 里有 8 处 `AC-22` + 1 处 `AC-25` 指向完全不相关的验收条目，`render/cube-view.ts` 甚至在第 90 行写 `AC-22`、第 111 行写 `AC-16` 指同一条约束。

## 2. 关于「PRD 与 specs 的关系」（用户直接提问的回答）

**按 `project-conventions` 的定义，PRD 是 `docs/specs/` 里的一类文档，不是与 specs 并列的概念。** `references/directory-layout.md:158` 写明 `docs/specs/` 收纳 "Product requirement documents (PRD), architecture designs, technical design docs, interface definitions"。

本项目把 "spec" 重载成了两个意思，这是混乱的来源：

| 语义 | 指什么 |
|---|---|
| 目录语义（规范） | `docs/specs/` = 所有规格类文档的家 |
| 文档语义（本项目自创） | `SPEC-v1.0.md` = 一份具体的"开发期唯一契约" |

**裁定**：废除第二个语义。`SPEC-v1.0.md` 不再作为独立权威文档存在，其有价值的内容（§4 技术锚定、§11 已实证的坑、§12 端到端验证步骤）并入 `docs/specs/execution/`，原文归档。

## 3. 结构裁定

### 3.1 两桶文档树

用户明确要求"整合到一块统一管理，不要东一块西一块"。裁定采用**两桶**结构：

```
docs/specs/
├── PRD.md                    # v2.0 主文件：定位 / 权威映射 / 导航 / MVP边界 / 交付基线 / 风险
├── prd/                      # 【PRD 范畴】产品口径（What / Why）
│   ├── 01-product-scope.md      02-user-flow.md         03-notation-keyboard.md
│   ├── 04-scoring-judging.md    05-dust-observation.md  06-result-replay.md
│   ├── 07-agent-api.md          08-data-model.md        09-contract-nfr.md
│   ├── 10-acceptance.md         11-appendix.md          CHANGELOG.md
└── execution/                # 【执行范畴】实现契约（How）
    ├── CONTRACT.md  UIUX.md                          # 两份总纲（架构侧 / 设计侧）
    ├── engine.md  notation.md  puzzle.md  agent-api.md  render.md  persistence.md  verification.md
    └── ui-visual.md  ui-shell.md  ui-gate.md
```

### 3.2 防漂移机制：主题权威映射表

**这是本轮最重要的裁定。** 问题不是"文档太多"，而是"同一主题在多处重述"。因此 v2.0 规定：`docs/specs/PRD.md` §1.2 列出 31 个主题，每个主题**只有一个权威文件**，其他文件**不得重述、只能链接**。

配套的两条硬规则：

- **冲突裁定优先级**：`prd/11-appendix.md` 附录 C（AC 冻结索引）→ `prd/*` → `execution/CONTRACT.md` → `execution/UIUX.md` → `src/ob-cube/src/contracts.ts`。上层定义"应该是什么"，下层定义"怎么做到"。
- **②③④⑤ 之间的事实冲突不是"谁优先级高谁赢"，而是一个待修缺陷**：要么改文档要么改代码，必须在本目录留裁定，不得就地各说各话。

### 3.3 废除两处平行 AC 权威

| 被废除的声明 | 原文 | 裁定 |
|---|---|---|
| `SPEC-v1.0.md:8` | "本文件是开发期的**唯一契约**。与上游文档冲突时，以本文件为准" | 整份文档归档，声明作废 |
| `ARCHITECTURE.md:2147` | "本文不再把编号当作唯一标识，而是**以本表为唯一权威映射**……若 PRD 的 AC 索引表与本表冲突，**以内容为准**" | 该表降级为"本文引用了哪些 AC"的**只读索引**，编号与内容一律以 PRD 附录 C 为准 |

理由：**两个权威等于没有权威。** SPEC 就是在这个空隙里用了一套冻结前编号，并把它带进了 8 处代码注释。

### 3.4 冻结规则与内容修订的关系

附录 C 的冻结规则是"编号不可变更、作废保号标注、不得删行"。v2.0 需要在不改编号的前提下修正若干条文，采用两条手段：

1. **全局阅读规则 G1–G12**（`prd/10-acceptance.md` §14.0）：系统性变化（失败形状、状态名、枚举名、字段名）用统一解释规则覆盖，**条文原文保留**，以免破坏与四轮历史评审的可对照性。
2. **逐条 `[v2.0 修订]` 标注**：仅 6 条实质性修订（AC-03 / AC-12 / AC-26 / AC-38 / AC-42 / AC-75）直接改条文并写明修订理由。
3. **交付状态独立成表**（附录 C-bis）：把"会变的事实"从"冻结的编号与内容"里解耦，避免状态过期污染冻结表。

## 4. 产品定级裁定（用户逐条确认）

| # | 议题 | 裁定 | 理由 |
|---|---|---|---|
| **P1** | 回放 F09：PRD 定 P0/MVP 且 AC-47/48 已冻结，但代码只有"结果页定时器重放"；memory 又记为 P1 | **拆为 F09a（P0，已交付）/ F09b（P1，未实现）**；AC-47/48/50 保号标 `[已降级至 P1]`；新增 **AC-78** 描述 F09a | 按能力边界切开。F09a（事件流完整记录 + 原地重放）是已交付且构成产品定义地基的部分；F09b（独立回放页 + 进度条 + 调速 + 单步 + 三视角 + 版本提示）未实现。代价是承认 MVP 回放能力比 v1.10 声称的弱，收益是验收不再对着一个不存在的进度条打钩 |
| **P2** | 观察模式 F14：v1.10 单方面从 P1 升 P0（MVP 12→13 项），但 SPEC 锁定清单里没有、代码无配置入口 | **降回 P1**，MVP 回到 **12 项**；AC-19/20/65 保号标 `[已降级至 P1]`；"补配置入口 + 补 `after_move` 门控"列为 P1 首要项 | 升级只改了 PRD 一处，形成三角空洞。九条裁决的配置面板范围（时限/步数/蒙尘/参与者/题目）本不含观察模式。引擎侧已实现的三档**保留不删**（有测试覆盖），降级只是不再作 MVP 门槛。**同时承认产品叙事代价**：三大差异点之一"观察权限作为一等难度维度"在 MVP 里不可被用户配置，对外不得声称"支持五档观察模式" |
| **P3** | `auto_submit_on_solved`：PRD 说"人类默认 true 自动提交"，代码里该字段定义了但**全库无消费者** | **改 PRD 默认为 `false`**（人机一致，都需显式提交）；AC-75 修订；新增 **AC-79** 钉死"默认 `false` 且不得按参与者类型差异化" | 零代码改动即消除背离。且人机一致更符合"同一套引擎、同一份计步规则"的产品定义——给人类一条自动结算捷径本身就是对 Agent 的差异化对待。**该字段保留为 P1 配置项，不删除**；但 `settings.ts` 的 `DEFAULT_SETTINGS.autoSubmitOnSolved` 仍是 `true`，需改为 `false` 或删除，否则设置面板会显示一个不生效的开关（缺陷 D2） |
| **P4** | 自由层 tab：UIUX 附 C#6 裁定"删除，改轴+起层+止层选择器"，但从未执行，代码里 2 阶（6 控件）/4 阶（8 控件）各有一组 | **追认代码现状**，改写 PRD §3.4 的 tab 组成；**作废 UIUX 附 C#6 与附 C#11**；新增 **AC-80** | 现形态（轴 + 层槽任意多选，非连续组合由"将提交"预览串 `—` 拦截）已能表达全部连续区间，满足 AC-40。改选择器需重构 `turn-matrix-data.ts` / `turn-matrix-free.ts` 并重验 AC-40 / AC-72 的全部可点击路径，收益不覆盖回归成本 |

## 5. 技术口径裁定（Agent 按"最新裁定 + 代码现实"判定）

| # | 议题 | 各方说法 | 裁定 | 依据 |
|---|---|---|---|---|
| T1 | 记法版本 | ARCHITECTURE `ss-1`；SPEC / memory / 代码 `ss-2` | **`ss-2`** | `conversation/04`（2026-10-26 升版）；`contracts.ts:203` 是字面量类型 `notation_version: 'ss-2'` |
| T2 | 宽转规范形式 | ARCHITECTURE §5.2/§5.6 `2Rw`；PRD §5.7 与 ARCHITECTURE 自己的 §5.7 `Rw` | **`Rw`**（`2Rw` 是别名，可解析、归一化后不输出） | `notation.ts:151`；memory 记录"`Rw` 短形式" |
| T3 | 中间两层区间记法 | ARCHITECTURE `2-3Rw`；PRD / UIUX 附 E#3 / 代码 `2-3R` | **`2-3R`（无 `w`）** | `notation.ts:64/198` |
| T4 | AC-40 计数口径 | ARCHITECTURE §5.6 面口径 `18/90/162`；PRD v1.5 起轴口径 `18/45/81 = 144` | **轴口径 144**。`move_catalog` = `18/99/162` 是另一维度，两者**永不互验** | PRD v1.5 #20；`notation.test.ts:248-249`、`catalog.ts:121` |
| T5 | API 失败形状 | PRD `{ok:false,error_code}`；ARCHITECTURE `{ok:false,error:{code,hint,retryable}}`；SPEC "抛" | **抛 `CubeError{code,hint}`**；成功返回平铺、无 `ok` 键 | 已交付且被 `tests/` 与四轮评审覆盖；改回返回值形状需重写全部调用方且无产品收益；调用方无法"忽略"异常，契合"校验全部前置" |
| T6 | `applyMove` 返回字段数 | PRD v1.10 #55 "统一为 8 字段"；代码 `MoveResult` 13 字段 | **13 字段**，AC-42 标 `[v2.0 修订]` | `contracts.ts:134-156`。代码无 `ok` 键（失败走异常）、无根级 `observation_id`（在 `next_observation` 内） |
| T7 | 终止判定顺序 | PRD "还原→超时→步数→放弃"；ARCHITECTURE "还原→步数→超时" | **还原 → 步数耗尽 → 超时 → 放弃** | 步数耗尽是**确定性事件**（第 N 步执行完即知），超时是**轮询事件**（取决于 tick 时机）。让确定性事件优先，同一 run 重放必然得到同一结局；反之同一操作序列在不同帧率下可能得到不同结局，对评测平台不可接受。"还原优先于一切"不变 |
| T8 | 观察模式枚举名 | PRD `three_face`/`one_face`；ARCHITECTURE `three_face`/`single_face`/`limited`；代码 `three_faces`/`single_face` | **代码口径**：`full`/`three_faces`/`single_face`/`after_move`/`restricted` | `contracts.ts:96`。改代码枚举名会连带改 `session.ts` + 测试，改文档零成本 |
| T9 | 观察被拒的错误码 | PRD 一个笼统的 `OBSERVATION_DENIED`；代码三个独立码 | **三码**：`E_OBSERVATION_BUDGET_EXHAUSTED` / `E_OBSERVATION_REQUIRES_MOVE` / `E_STALE_OBSERVATION`。`OBSERVATION_DENIED` 自 v2.0 起不再使用 | 分码让 Agent 知道下一步该做什么（无预算则停、需先转动则 `applyMove`、过期则重新 `observe`），诊断价值高于一个笼统码 |
| T10 | 蒙尘解锁转场时长 | PRD §2.2 200ms；UIUX §6.4 600ms | **600ms**，受 `prefers-reduced-motion` 约束 | 解锁转场属视觉专项，设计契约是权威；PRD 的 200ms 无对应论证 |
| T11 | 动画时长 | PRD/UIUX 150ms；ARCHITECTURE 默认 180、可配 [0,400] | **150ms，且是设计常量而非用户配置项**（`settings.ts` 无 `animationMs`、配置面板无此控件） | PRD + UIUX 二比一，且代码无该配置项 |
| T12 | seed 长度 | PRD 1–32；ARCHITECTURE 1–128 | **1–32** | `settings.ts:61` 的 `SEED_MAX_LEN = 32`。注：引擎 `seed.ts:11` 宽松接受 1–128，边界校验在 settings/URL 层——这是有意的分层，不是矛盾 |
| T13 | `rotateView` 入参 | PRD `{axis,direction,steps}`；ARCHITECTURE / 代码 `{up,front}` 绝对 + `quarter_turns` 相对 | **ARCHITECTURE / 代码口径**。但 `RunEvent` 仍记 `axis`/`direction`/`steps`（相对旋转有值、绝对旋转为 `null`）——两者不是一回事，不可混用 | `contracts.ts:98-101`、`222-234` |
| T14 | 状态机 | PRD `idle`/`configuring`/`ready`/`running`/`paused`/`solved_pending`/`finished`/`review`；代码 11 态含 6 个 `ended_*` | **代码口径**。删除三个从未存在的状态：`configuring`（页面加载即 `ready`，配置面板是左栏常驻）、`finished`（用 6 个 `ended_*` 区分结局）、`review`（是 UI 投影不是状态） | `contracts.ts:66-90`；四轮评审实测 |
| T15 | `internal_error` 是否设为第 7 个终态 | PRD v1.10 #58 把它加进 `result` 枚举 | **不设**。由 `ended_reason` 承载 | 它是"为什么结束"，不是"结束成什么样"。为它扩终态枚举会让 `isEnded()` 与全部 UI 分支多一条路径，收益为零 |
| T16 | 字段名 `paused_ms` / `solve_ms` vs `paused_total_ms` / `solved_at_ms` | ARCHITECTURE 用前者；PRD 用后者 | **PRD 口径**（`paused_total_ms`），因为代码就是这么写的 | `contracts.ts:250` |
| T17 | 生成方式字段 | PRD `gen_mode`（`random_moves`/`preset`/`imported`/`random_state`）；ARCHITECTURE `random-walk`/`imported`；代码 `scramble_method`（`random_moves`/`seeded_moves`）+ `preset_id` | **代码口径**。`gen_mode` 这个字段名在代码里**根本不存在**；"预设题"不是 `scramble_method` 的取值，而是 `preset_id !== null` + `seeded_moves` | `contracts.ts:184-191` |
| T18 | 难度字段 | PRD `gen_version`；ARCHITECTURE `algorithm_version` | **`gen_version`** | `contracts.ts:194`；memory 记录 `rules.gen_version` |
| T19 | 引擎版本显示 | UIUX "引擎 v1.0.0"；代码 `ENGINE_VERSION = 'ob-cube 0.1.0'` | **以 `contracts.ts` / `package.json` 的 `0.1.0` 为真源**。结果页读 `view.engineVersion`，不硬编码 | `contracts.ts:57` |
| T20 | 持久化命名空间与上限 | ARCHITECTURE §10.1 `cube.v1.*`、runs ≤ 100、puzzles ≤ 500；代码 `ob-cube:v1:*`、`MAX_RECORDS = 50`、题目记录不落盘 | **代码口径** | `services/storage.ts`、`services/history.ts:15` |
| T21 | 时限 / 步数预设清单 | PRD 含 60s 与 200；九条裁决 #2/#3b 无这两项；代码也无 | **按九条裁决收敛**：时限 = 不限时(默认)/2min/5min/20min/自定义(10s–180min)；步数 = 不限(默认)/20/50/100/自定义 | `docs/decisions/2026-10-26-nine-issues-ruling-decision.md` #2/#3b |
| T22 | `ended_*` 态 `Space` 行为 | PRD §5.3.4 "`finished` 态 = 返回配置"；代码无动作 | **无动作**（仅 `preventDefault()`），并把 `ended_*` 显式纳入 AC-38 覆盖范围 | v1.9 把配置面板改为左栏常驻后，"返回配置"已无落点。**留作 Q9 待复议**：若要恢复语义，需先定义"返回配置"到底是什么操作 |
| T23 | AC-03 数学错误 | 冻结条文"`R`、`R'`、`R2` 依次执行后指纹回初始" | **修订**为「`R` 后 `R'` 闭环」+「`R2` 两次闭环」 | 原文净效果 = `R2`，**恒假、永远无法通过**。第四轮评审已坐实。按冻结规则保留编号，只改内容 |
| T24 | AC-26 要求的 `INVALID_STATE` | 冻结条文要求返回该码 | **判据改为"必须判未还原且原因可区分"**（已满足：`mismatch.reason === 'invalid-scheme'`）；补对外 `E_INVALID_STATE` 列为 P1 | `ERROR_CODES` 里没有该码。真实流程中镜像配色不可能出现（合法转动无法达成，只有物理拆装或未来的非法导入路径会触发），为它现在扩错误码表不划算 |
| T25 | 动作总数 | PRD §5.6 "≈87 个动作" | **96** | v1.10 漏计 G6（单内层近对面侧）的 9 个，与它自己表里"G5(9)+G6(9)=18"的说法自相矛盾 |
| T26 | §11.1 埋点定级 | PRD "MVP 必须埋点" | **整体降为 P1** | 全库零实现。降级不影响产品定义——埋点是运营侧能力，不属于"人机同台可比"的四项地基 |
| T27 | DESIGN-GATE-A.md | 自称"UIUX §9.1 的可执行版本，Phase 4 直接按本文件逐条勾选验收" | **作废归档**，由 `execution/ui-gate.md` 取代 | 整份基于 v1.2 旧暂停语义（A20「计时仍在进行」、A23「超时发生于暂停中」、B7「暂停时时间是否真的在跑」）与"8 个方法"口径。**按它验收会把正确实现判为失败、把旧口径实现判为通过** |

## 6. 未修的代码缺陷（本次不改码，需单独授权）

本仓库**未初始化 Git**（`.project-conventions/project.json` 的 `repository_root: null`，用户未授权建仓），worktree-first 策略下无法为代码改动开任务分支与 linked worktree。因此 v2.0 **只做文档裁定，不改代码逻辑**（仅改注释，已获用户逐项授权）。

| # | 缺陷 | 违反 | 严重度 | 修复量 |
|---|---|---|---|---|
| **D1** | `session.tick()` 只豁免 `paused` / `ended_*`，**未豁免 `solved_pending`** → 已还原未提交的运行会被超时覆盖为 `ended_timeout` | AC-28、AC-75 | **高（唯一功能性 bug，无测试覆盖）** | 一行 guard + 一条测试 |
| D2 | `DEFAULT_SETTINGS.autoSubmitOnSolved` 仍是 `true`，与 v2.0 裁定的默认 `false` 不符；且该字段全库无消费者 | AC-79 | 高 | 改默认值或删除字段 |
| D3 | `stickerLabels` / `monoMode` 死配置，`setMono()` 无调用者；"面中心字母默认开、不可关"完全未实现 | 色盲无障碍三级 | 中 | 接线或删除 |
| D4 | `measureFrameBudget()` 导出但无调用者，无 draw call / 帧间隔采样 | `execution/render.md` §8.5 帧预算降级 | 中 | 接线 |
| D5 | `LayerOutline.show()` 全库无调用者，`shell.ts` 的 `onLayerHover` 是 `() => undefined` | AC-81（v2.0 新立）、`verification.md` 断言 E | 中 | 接线 |
| D6 | `tests/_scratch.test.ts` 是无断言遗留物（只往 stdout 打印 seed / 指纹） | 测试卫生 | 低 | 删除 |
| D7 | 8 个 TS 文件 + 3 个 CSS 文件超"单文件 ≤ 300 行"红线 | `execution/CONTRACT.md` §9.2 | 中（技术债） | 拆分，`wiring/index.ts`(848) 与 `challenge/session.ts`(772) 优先 |
| D8 | TypeScript 从 `~7.0.2` 回退到 `~5.9.3` 时，SPEC §4 要求的 ADR 从未写 | 活规格纪律 | 低 | 本次已补 `ADR-006.md` |

## 7. 后果与后续

**立即生效**：v1.x 四份文档 + `DESIGN-GATE-A.md` 全部归档至 `docs/archive/2026-10-26-docs-v1/`（不删除）；`docs/specs/` 改为两桶结构；代码与 `design/` 里的 9 处陈旧 AC 引用已修正并通过 typecheck（零错误）+ test（18 文件 232 用例全绿）。

**需要后续授权的工作**（按优先级）：

1. 修 D1（高危 bug）+ D2 —— 需要先授权 `git init` 或明确允许无 worktree 直接改码
2. P1 首要项：观察模式配置入口 + `after_move` 门控（F14）；AC-16 探针自动化断言
3. P1：AC-53 的 2D 展开图降级；F09b 独立回放页；接线 D3/D4/D5
4. 技术债：D7 文件拆分；构建产物代码分割（719 KB 单 chunk）
5. 补 ADR-006 后的下一件事：把覆盖率门禁（`engine/ >= 95%`、`challenge/ >= 85%`）纳入实际执行的命令，目前 `npm run coverage` 存在但不在门禁流程里、无覆盖率数据
