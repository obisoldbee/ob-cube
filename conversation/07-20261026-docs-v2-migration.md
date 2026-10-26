# 07 · 2026-10-26 目录治理迁移 + PRD v2.0 重构

> 范围：整个 Project Root 的文档布局，以及 PRD / ARCHITECTURE / UIUX / SPEC 四份文档的关系重组。
> 触发：用户「用 project-conventions 这个 skill 重新整理一下当前项目目录，我觉得文档位置都没有放对，PRD 和 specs 的关系是啥？然后 PRD 可能太长了，拆分成主文件+多个子章节小文件。拆分之前先 review 当前代码，重点核查开发进度以及 PRD 和 spec 里自相矛盾的内容。然后整理出新的 v2.0 版本 PRD，把旧的 1.x 系列放到归档里」。
> 治理层：Project Root（Code 类型）。生命周期：Governance maintenance。

## 结论

- **回答「PRD 和 specs 的关系」**：按 `project-conventions` 的 `directory-layout.md:158`，PRD 是 `docs/specs/` 里的一类文档（该目录收纳 PRD / 架构设计 / 技术设计 / 接口定义），**不是与 specs 并列的概念**。本项目把 "spec" 重载成了两个意思——目录语义 vs 一份叫 `SPEC-v1.0.md` 的具体文档——这是混乱的根源。裁定：废除第二个语义，SPEC 层不再作为独立权威文档存在。
- **矛盾排查发现三类结构性问题**（两个只读调研 agent 交叉核对，共 28 组实质矛盾）：
  1. `SPEC-v1.0.md` 基于 PRD **v1.3** 生成，而 AC 索引在 PRD **v1.6** 才冻结 → 它整套 AC/F 编号是冻结前的旧体系，**却自称「与上游冲突时以本文件为准」**；
  2. `ARCHITECTURE.md` 记法章未随 `ss-2` 与九条裁决更新（`ss-1` / `2Rw` / `2-3Rw` / 面口径 `18/90/162` / `E_PAUSED` / seed 1–128 / `random-walk`），且附录 C 自建了第二套「唯一权威 AC 映射表」；
  3. PRD 单方面升 P0 的两项（F14 观察模式、§11.1 埋点）从未落到 SPEC 与代码 → 「验收依据说要、契约说不在列表、代码没有」的三角空洞。
- **旧编号已渗进代码**：`src/ob-cube/src/` 里 8 处 `AC-22` + 1 处 `AC-25` 指向完全不相关的验收条目；`render/cube-view.ts` 第 90 行写 `AC-22`、第 111 行写 `AC-16`，指同一条约束。已全部修正（纯注释）。
- **代码 review 发现 1 个真 bug（D1）**：`session.tick()` 只豁免 `paused`/`ended_*`，**未豁免 `solved_pending`** → 已还原未提交的运行会被超时覆盖为 `ended_timeout`，违反 AC-28/AC-75，无测试覆盖。**本次未修**（无 Git 无法开 worktree，且未获改码授权）。
- 门禁：typecheck 零错误、18 文件 232 用例全绿、`design-tokens.json` 解析通过——与迁移前基线逐项一致。

## 用户裁决（4 条产品定级，逐条确认）

| # | 议题 | 裁决 |
|---|---|---|
| P1 | 回放 F09：PRD 定 P0/MVP 且 AC-47/48 已冻结，代码只有「结果页定时器重放」，memory 又记为 P1 | **拆为 F09a（P0，已交付）/ F09b（P1）**；AC-47/48/50 保号标 `[已降级至 P1]`；新增 AC-78 |
| P2 | 观察模式 F14：v1.10 单方面升 P0（MVP 12→13），SPEC 锁定清单无它、代码无配置入口 | **降回 P1**，MVP 回到 12 项；AC-19/20/65 同步降级；「补配置入口 + 补 `after_move` 门控」列为 P1 首要项 |
| P3 | `auto_submit_on_solved` 是死配置（定义了但全库无消费者） | **改 PRD 默认为 `false`**（人机一致，都需显式提交）；AC-75 修订；新增 AC-79 |
| P4 | 自由层 tab：UIUX 附 C#6 裁定删除改「轴+起层+止层」选择器，但从未执行、代码里还在 | **追认代码现状**，改写 PRD §3.4 的 tab 组成；**作废 UIUX 附 C#6 与附 C#11**；新增 AC-80 |

另有目录结构的三项选择：① 三份规格文档全部移入 `docs/specs/`；② `SPEC-v1.0.md` 归档、重生成为派生检查单（后并入 `execution/`）；③ 附带清理全做（src 杂散文件归位 + 删缓存、修正陈旧 AC 注释、`design-tokens` 移到 `design/`、reviews/decisions 改名 + `media`→`material`）。

**文档结构选了「方案 A：两桶文档树」**，用户的原话是「我认为是应该一起拆，如果这是属于 PRD 或执行目标范畴的话，应该只整合到一块进行统一管理，而不是分开东一块西一块」。这条比"拆不拆"更重要——它把问题从「文件太长」重新定义为「同一主题在多处重述」。

## 落地

| 动作 | 结果 |
|---|---|
| v1.x 归档 | `PRD.md`(v1.10) / `ARCHITECTURE.md`(v1.4) / `UIUX.md`(v1.5) / `SPEC-v1.0.md` / `DESIGN-GATE-A.md` → `docs/archive/2026-10-26-docs-v1/`，原名保留，**未删除任何文件** |
| PRD v2.0 | `docs/specs/PRD.md`（主文件 276 行）+ `prd/01~11-*.md` + `prd/CHANGELOG.md`，共 13 文件。原 §15 竞品分析移出为 `docs/research/2026-10-25-competitor-analysis-research.md` |
| 执行侧文档树 | `docs/specs/execution/` 12 文件：`CONTRACT.md` + `UIUX.md` 两份总纲，`engine` / `notation` / `puzzle` / `agent-api` / `render` / `persistence` / `verification` / `ui-visual` / `ui-shell` / `ui-gate` 十个模块 |
| 归位 | `design/design-tokens.{css,json}`（原在 `docs/` 根）、`material/`（原 `media/`，72 文件原样保留）、5 个评审证据 → `docs/reviews/artifacts/` |
| 改名 | 5 份评审 → `YYYY-MM-DD-<reviewer>-<scope>-000000[-N].md`（开始时间未记录，按规范用 `000000` 占位）；`nine-issues-ruling.md` → 补 `-decision` 后缀 |
| 删除 | 仅可再生缓存：`.playwright-cli/`（87 文件）、`docs/research/__pycache__/`（1）、空目录 `src/ob-cube/scripts/` |
| 新增记录 | 迁移记录、v2.0 裁定记录、实现现状报告、引擎验证基线研究说明、`ADR-006`（补记 TypeScript 版本回退）、本文件、`memory/2026-10-26.md` |

## 关键决定与理由

### 防漂移机制：主题权威映射表（`docs/specs/PRD.md` §1.2）

这是本轮最重要的产出，比拆分本身更重要。**问题不是"文档太多"，而是"同一主题在多处重述"**——`SPEC-v1.0.md` 就是一份 251 行的派生文档，它复述了 PRD §1/§3/§4/§13/§14 与 ARCHITECTURE §4/§5 与 UIUX §8 的结论，然后漂移了。

因此 v2.0 规定 31 个主题各只有一个权威文件，**其他文件不得重述、只能链接**。配套两条硬规则：优先级链（附录C → prd/ → execution/CONTRACT → execution/UIUX → `contracts.ts`）；以及"②③④⑤ 之间的事实冲突不是『谁优先级高谁赢』，而是一个待修缺陷，必须留裁定"。

### 冻结规则 vs 内容修订：用「解释规则」而不是「改写条文」

附录 C 的冻结规则是"编号不可变更、作废保号、不得删行"。但 v2.0 需要修正系统性口径（失败形状、状态名、枚举名、字段名）。逐条改写 77 条 AC 会破坏与四轮历史评审的可对照性。

采用的办法是**三层**：① 全局阅读规则 G1–G12（`prd/10-acceptance.md` §14.0）覆盖系统性变化，条文原文保留；② 仅 6 条实质性修订（AC-03/12/26/38/42/75）直接改条文并写修订理由；③ 交付状态独立成表（附录 C-bis），把"会变的事实"从"冻结的编号"里解耦。

其中 **AC-03 是数学错误**：原文"`R`、`R'`、`R2` 依次执行后指纹回初始"的净效果是 `R2`，恒假、永远无法通过，第四轮评审已坐实。冻结条文本身可以是错的——这是"冻结"这个机制必须配一条纠错通道的理由。

### 内容保真：用 `sed` 行范围抽取，不让模型重述

4000+ 行技术契约一旦被转写就可能丢失或篡改具体数值（ΔE 阈值、draw call 预算、slot 公式、错误码全名）。做法是 `sed -n 'START,ENDp'` 按章节行范围抽取 → 注入 v2.0 头部 → 逐条 Edit 套用裁定。

覆盖校验：PRD **1834/1835 行**（唯一未覆盖的是第 128 行的 `---` 分隔符）、UIUX **1722/1722**、ARCHITECTURE **2170/2183**（缺的 13 行是原文件头，已由重写的 `CONTRACT.md` 头部取代）。

### 错误码做了一次集合差分，而不是逐条比对

`grep -oE '\bE_[A-Z_]+'` 抽全部 v2.0 文档提到的码，与 `contracts.ts` 的 `ERROR_CODES` 做 `comm` 差分。结果：**30 个真实码全部有文档**（无遗漏），另查出 **8 个幽灵码**（`E_PAUSED` / `E_INVALID_MOVE` / `E_OBSERVATION_DENIED` / `E_INVALID_STATE` / `E_INVALID_SUBMISSION` / `E_IMPORT_TOO_LARGE` / `E_IMPORT_UNSAFE_KEY` / `E_SCHEMA_AHEAD`），已在 `execution/agent-api.md` §7.6 建立登记表。

顺带发现 v1.10 §12.1 举例的两个全名 `E_INVALID_MOVE` 与 `E_PAUSED` **在代码里都不存在**（实为 `E_NOTATION_MALFORMED` 与 `E_CHALLENGE_PAUSED`）——一份"错误码表"里举的例子是错的，说明这张表从来没跟代码对过账。

## 未做与后续

| 项 | 状态 |
|---|---|
| **D1 `solved_pending` 超时豁免**（高危 bug） | **未修**。需先授权 `git init` 或明确允许无 worktree 改码 |
| D2 `autoSubmitOnSolved` 默认值仍是 `true` | 未改（同上） |
| D3–D7 死配置 / 未接线 / 遗留测试 / 文件超红线 | 未改，已登记在实现现状报告 §5 |
| P1 首要项：观察模式配置入口 + `after_move` 门控、AC-16 探针自动化断言 | 未做 |
| `docs/plans/` | 仍为空。本次任务不产出实现计划 |
| `.ego/` / `.screenshots/` / `.workbuddy/` | **未触碰**（隐藏的 Agent 工具/平台目录，规范明令不由 project-conventions 管理） |
| `material/` 内的 `manifest.json` | **未改写**。那是工具生成的过往运行证据，其中记录的 `docs/PRD.md` 是当时的真实路径，改写等于伪造证据 |
| 覆盖率门禁 | `npm run coverage` 存在但不在任何验证流程里，无覆盖率数据；`execution/verification.md` §11.1 要求的 `engine/ >= 95%`、`challenge/ >= 85%` 无法核对 |

## 一处策略偏离（透明登记）

`worktree-first` 要求代码改动使用任务专属分支 + linked worktree。**本次无法遵守，因为本仓库没有 Git**（`repository_root: null`，用户未授权建仓，`AGENTS.md` 也明令不得擅自 `git init`）。

实际措施：只改了 9 处**注释**（8 处陈旧 AC 编号 + 1 处路径引用），用户在授权勾选里逐项确认了范围与验证方式；单写者无并发冲突；改后立即跑 typecheck（零错误）+ test（232 全绿），与迁移前基线一致。需要真实改码的 D1–D8 全部留待单独授权。

**这也是建议尽快授权建仓的理由之一**：本次迁移没有提交点可回退，回滚只能按迁移记录 §8 手工反向操作。

## 产出索引

| 文件 | 内容 |
|---|---|
| `docs/migrations/2026-10-26-directory-migration.md` | 迁移记录：前后目录树、完整文件映射表、引用同步清单、验证结果、回滚边界 |
| `docs/decisions/2026-10-26-prd-v2-rulings-decision.md` | v2.0 全部口径裁定（4 条产品定级 + 27 条技术口径 + 8 项未修缺陷） |
| `docs/reports/2026-10-26-implementation-status-report.md` | 开发进度矩阵、不变量核查、缺陷与技术债登记 |
| `docs/decisions/ADR-006.md` | 补记 TypeScript `~7.0.2` → `~5.9.3` 回退 |
| `docs/research/2026-10-25-engine-verification-baseline-research.md` | 三个验证脚本的用途、运行方式与门禁地位 |
| `docs/specs/prd/CHANGELOG.md` | v2.0 变更条目 62–102 + v1.x 历史 |
