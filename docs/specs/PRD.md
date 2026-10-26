# 魔方挑战与 AI Agent 评测平台 PRD

| 字段 | 值 |
|---|---|
| 文档版本 | **v2.0** |
| 定稿日期 | 2026-10-26 |
| 产品形态 | 纯前端单页 Web 应用，无后端、无账号 |
| 产品定位 | 2×2 / 3×3 / 4×4 魔方交互式挑战 + AI Agent 还原能力评测平台 |
| 目标用户 | 普通玩家、AI Agent 开发者、模型评测人员 |
| 工程目录 | `src/ob-cube/`（Vite + TypeScript + Three.js） |
| 文档状态 | 现行唯一验收依据。v1.x 全系列已归档至 `docs/archive/2026-10-26-docs-v1/` |
| 上一版 | v1.10（1835 行单文件），归档原文见 `docs/archive/2026-10-26-docs-v1/PRD.md` |

**v2.0 是一次结构重构 + 口径收敛，不是需求变更。** 它做了三件事：

1. **拆分**：1835 行单文件拆为主文件 + 11 个子章节（按功能模块），本文只保留定位、导航、权威映射、交付基线与风险。
2. **收敛矛盾**：v1.x 时期 PRD / ARCHITECTURE / UIUX / SPEC 四份文档互相漂移，v2.0 逐条裁定并写死（裁定全文见 `docs/decisions/2026-10-26-prd-v2-rulings-decision.md`）。
3. **对齐现实**：把「文档声称」与「代码交付」的落差显式化——每个功能点标注交付状态，未达成项不再伪装成已达成。

完整变更历史（v1.2 → v1.10 → v2.0）见 [`prd/CHANGELOG.md`](prd/CHANGELOG.md)。

---

## 1. 文档体系与权威映射（v2.0 新增，防漂移的核心机制）

### 1.1 为什么需要这张表

v1.x 时期存在四份"权威"文档，同一主题在多处重述，导致系统性漂移。实测发现的三类矛盾主源：

| 矛盾主源 | 具体表现 | 后果 |
|---|---|---|
| **SPEC 停留在旧编号体系** | `SPEC-v1.0.md` 基于 PRD **v1.3** 生成，而 AC 索引在 PRD **v1.6** 才冻结。它用冻结前编号（蒙尘像素 = `AC-22`），却自称"与上游冲突时以本文件为准" | 代码注释里留下 8 处 `AC-22` + 1 处 `AC-25` 陈旧引用，指向完全不相关的验收条目 |
| **ARCHITECTURE 记法章未随裁决更新** | 仍写 `ss-1`、规范形式 `2Rw`、区间 `2-3Rw`、面口径 `18/90/162`、`E_PAUSED`、seed 1–128、`random-walk` | 与 `ss-2` 实现和 PRD 全部冲突 |
| **PRD 单方面升 P0 但从未落地** | F14 观察模式、§11.1 埋点在 PRD 里是 P0/MVP 必须，SPEC 锁定清单里没有，代码里也没有 | 形成"验收依据说要、契约说不在列表、代码没有"的三角空洞 |

**v2.0 的解法不是"再写一份更权威的文档"，而是规定每个主题只有一个家。** 下表是唯一权威的分配表；**任何文件不得重述表中主题的内容，只能链接到它。**

### 1.2 主题权威映射表

| 主题 | 唯一权威文件 | 其他文件必须怎么做 |
|---|---|---|
| 产品定位 / 用户画像 / 功能清单 / RICE / MVP 边界 / Out-of-Scope | [`prd/01-product-scope.md`](prd/01-product-scope.md) | 只链接 |
| 状态机 / 用户流程 / 配置项与边界值 | [`prd/02-user-flow.md`](prd/02-user-flow.md) | 只链接 |
| 键盘映射（产品行为要求）/ 记法命名口径 | [`prd/03-notation-keyboard.md`](prd/03-notation-keyboard.md) | 只链接 |
| 记法 EBNF / 归一化规则 / `describeMove` 实现 / `move_catalog` 规模 | [`execution/notation.md`](execution/notation.md) | PRD 只声明行为要求，不给算法 |
| 难度公式 / 计步三公理 / 计时口径 / 终止判定顺序 / 还原判定标准 | [`prd/04-scoring-judging.md`](prd/04-scoring-judging.md) | 只链接 |
| 状态模型 / 置换生成 / 还原判定算法（24 朝向、手性 det） | [`execution/engine.md`](execution/engine.md) | PRD 只给判定标准，不给实现要点 |
| 题面生成 / PRNG / seed 格式 / 可复现四件套 / 指纹参数 | [`execution/puzzle.md`](execution/puzzle.md) | PRD 只给可复现要求 |
| 蒙尘 C1–C6 / N1–N5 / 受限观察屏蔽指纹 / ΔE 探针口径 | [`prd/05-dust-observation.md`](prd/05-dust-observation.md) | 只链接 |
| 蒙尘材质实现（unlit / `NoToneMapping` / `getProbePoints`）/ 2D 降级 | [`execution/render.md`](execution/render.md) | PRD 只给验收判据 |
| 遮蔽色实测数据（ΔE 矩阵、L\* 阶梯） | [`execution/ui-visual.md`](execution/ui-visual.md) | 色值本身只在 `design/design-tokens.{css,json}` |
| 结果面板五区块 / 回放能力（产品要求） | [`prd/06-result-replay.md`](prd/06-result-replay.md) | 只链接 |
| 三栏布局 / tab 矩阵 / 层选择器 / 键盘可视化 / 回放界面 UI 规格 | [`execution/ui-shell.md`](execution/ui-shell.md) | PRD 不给像素级规格 |
| Agent API 对外契约（九方法 / 返回形状 / 失败形状 / 前置条件） | [`prd/07-agent-api.md`](prd/07-agent-api.md) | 只链接 |
| API TS 类型定义 / snake_case 转换 / 幂等 / 限流实现 | [`execution/agent-api.md`](execution/agent-api.md) | PRD 只给契约，不给类型代码 |
| 数据模型字段的**产品语义** | [`prd/08-data-model.md`](prd/08-data-model.md) | 只链接 |
| 数据模型字段的**字面真源** | `src/ob-cube/src/contracts.ts`（冻结文件） | 文档与它冲突即为缺陷，须按裁定记录修正一侧 |
| **错误码全名 ↔ PRD 短名映射** | [`execution/agent-api.md`](execution/agent-api.md) | PRD 正文只用短名叙述，不得自建第二张码表 |
| 非功能需求 / 埋点方案 | [`prd/09-contract-nfr.md`](prd/09-contract-nfr.md) | 只链接 |
| **AC 编号与内容（冻结）** | [`prd/11-appendix.md`](prd/11-appendix.md) **附录 C** | 全项目只引用此处编号；**禁止任何文档自建平行 AC 映射表** |
| Singmaster 记法对照表 | [`prd/11-appendix.md`](prd/11-appendix.md) 附录 A | 只链接 |
| 色值 | `design/design-tokens.{css,json}` → `src/ob-cube/src/ui/tokens.css` | 任何 `.md` 里出现的 hex 都只是只读镜像，不得被复制进组件代码 |
| 技术选型与版本锚定 / 分层依赖铁律 / 目录树 / 文件规模红线 | [`execution/CONTRACT.md`](execution/CONTRACT.md) | 只链接 |
| 测试策略 / 端到端验证步骤 / 已实证的坑 | [`execution/verification.md`](execution/verification.md) | 只链接 |
| 设计验收门禁（A 组截图可判定 / B 组真机交互） | [`execution/ui-gate.md`](execution/ui-gate.md) | 只链接 |
| 竞品分析 | `docs/research/2026-10-25-competitor-analysis-research.md` | PRD 只保留差异化结论 |
| 实现进度与已知偏差 | `docs/reports/2026-10-26-implementation-status-report.md` | 本文 §4 只给汇总 |

### 1.3 冲突裁定优先级（v2.0 写死）

```
① prd/11-appendix.md 附录 C        AC 编号与内容的唯一真源（冻结）
② docs/specs/prd/*.md              产品口径与验收要求
③ docs/specs/execution/CONTRACT.md 架构实现契约
④ docs/specs/execution/UIUX.md     设计契约
⑤ src/ob-cube/src/contracts.ts     数据/错误码的字面真源
```

规则：

- 上层定义**应该是什么**，下层定义**怎么做到**。下层的实现细节不得反过来改写上层的产品口径。
- ②③④⑤ 之间出现事实冲突时，**不是"谁优先级高谁赢"，而是一个待修缺陷**：要么改文档要么改代码，必须在 `docs/decisions/` 留下裁定，不得就地各说各话。
- **v1.x 的 `SPEC-v1.0.md` 层已废除。** 它是派生文档却自称最高权威（原文第 8 行"与上游文档冲突时，以本文件为准"），是本轮矛盾的最大单一来源。其有价值的内容（技术锚定、已实证的坑、端到端验证步骤）已并入 `execution/`，原文归档。
- **`ARCHITECTURE.md` 附录 C 的"唯一权威 AC 映射表"声明同时废除。** 它降级为 `execution/CONTRACT.md` 里的一张"本文引用了哪些 AC"的索引表，编号与内容一律以 PRD 附录 C 为准。

### 1.4 全局阅读规则（适用于全部子章节）

附录 C 的冻结规则规定"编号一经发布即不可变更、不得删行"。为了让 v2.0 的裁定生效、同时不破坏已发布条文与四轮历史评审的可对照性，v2.0 采用**「条文原文保留 + 统一解释规则」**：`prd/10-acceptance.md` §14.0 定义了 G1–G12 十二条解释规则，**它们的优先级高于任何子章节里 v1.10 条文的字面写法**。阅读任何子章节遇到下列写法时，按 G 规则换算：

| 你在旧条文里看到 | 一律读作 | 规则 |
|---|---|---|
| `返回 {ok:false, error_code:"X"}` | 抛出 `CubeError`，`code` 为 `X` 的 `E_` 全名 | G1 |
| 状态 `finished` / `result:"solved"` 等 | 对应的 `ended_*` 终态 | G3 / G4 |
| 状态 `configuring` / `review` | 不存在 / 不是状态（是 UI 投影） | G5 / G6 |
| `one_face` / `three_face` | `single_face` / `three_faces` | G7 |
| `OBSERVATION_DENIED` | 按原因分三码 | G8 |
| `INVALID_STATE` | 该对外码不存在（P1 待补） | G9 |
| PRD 错误码短名 | 对应 `E_` 全名 | G10 |
| `MoveEvent` / `ViewEvent` / `SessionEvent` | 单一 `RunEvent` + `type` 七值 | G11 |
| `applyMove` 返回 8 字段 | 13 字段 | G12 |

完整规则表见 [`prd/10-acceptance.md`](prd/10-acceptance.md) §14.0；数据模型字段名对照见 [`prd/08-data-model.md`](prd/08-data-model.md) §13.0。

---

## 2. 子章节导航

| # | 文件 | 内容 | v1.10 对应 | 行数级别 |
|---|---|---|---|---|
| 01 | [`prd/01-product-scope.md`](prd/01-product-scope.md) | 结论先行、产品定义、用户画像、设计原则、功能清单与 RICE、MVP 范围、tab 组数、Out-of-Scope | §0 §1 §3 §4 | 中 |
| 02 | [`prd/02-user-flow.md`](prd/02-user-flow.md) | 状态机总览、六步流程、配置项与默认值、边界校验 | §2 | 中 |
| 03 | [`prd/03-notation-keyboard.md`](prd/03-notation-keyboard.md) | 键盘映射方案、面键对照、层深前缀、180° 双击归并、学习曲线、交付表、记法规范化契约 | §5 | **大** |
| 04 | [`prd/04-scoring-judging.md`](prd/04-scoring-judging.md) | 难度分级四维度、HTM 计步三公理、计时口径、真暂停细则、终止判定、2/3/4 阶还原判定 | §6 §7 | 大 |
| 05 | [`prd/05-dust-observation.md`](prd/05-dust-observation.md) | 蒙尘诚实边界 C1–C6 / N1–N5、ΔE 探针口径、受限观察屏蔽指纹 | §8 | 中 |
| 06 | [`prd/06-result-replay.md`](prd/06-result-replay.md) | 结果面板五区块、诚实标注、空/错误状态、回放数据基础与边界 | §9 §10 | 小 |
| 07 | [`prd/07-agent-api.md`](prd/07-agent-api.md) | `window.cubeAgent` 九方法、返回形状、失败形状、前置条件、幂等与限流 | v2.0 新编（原散在 §2.2/§8.6/§12/§13） | 中 |
| 08 | [`prd/08-data-model.md`](prd/08-data-model.md) | 题面 / 配置 / 运行 / 事件流的字段语义 | §13 | 中 |
| 09 | [`prd/09-contract-nfr.md`](prd/09-contract-nfr.md) | 非功能需求、埋点方案、错误处理原则 | §11 §12 | 小 |
| 10 | [`prd/10-acceptance.md`](prd/10-acceptance.md) | 验收标准 AC-01~AC-80 全文（EARS 格式） | §14 | 大 |
| 11 | [`prd/11-appendix.md`](prd/11-appendix.md) | 附录 A 记法对照表、附录 B 一致性自查、**附录 C AC 冻结索引** | 附录 A/B/C | 中 |
| — | [`prd/CHANGELOG.md`](prd/CHANGELOG.md) | v1.2 → v1.10 → v2.0 完整变更历史 | 文档头变更记录 | 中 |

**阅读路径建议**

- 产品/评审：本文 → `01` → `10` → `11` 附录 C
- 前端实现：本文 §1.2 找到自己模块的权威文件 → `execution/CONTRACT.md` → 对应 `execution/*.md`
- QA 验收：`11` 附录 C（查编号与交付状态）→ `10`（查 EARS 全文）→ `execution/ui-gate.md`（查截图/真机分组）
- Agent 开发者：`07` → `execution/agent-api.md`

### 2.1 v1.10 章节号 → v2.0 文件映射

子章节内部**保留 v1.10 的 `§N.M` 编号**（如 `§7.2.1`、`§8.2 C3`），这样历史评审、`conversation/`、ADR 与代码注释里的既有引用仍然可解读，不必全量重写。查号用下表：

| v1.10 章节 | v2.0 文件 |
|---|---|
| §0 结论先行、§1 产品定义、§3 功能清单/RICE/MVP/tab、§4 Out-of-Scope | `prd/01-product-scope.md` |
| §2 用户流程 | `prd/02-user-flow.md` |
| §5 键盘映射方案（含 §5.7 记法规范化契约） | `prd/03-notation-keyboard.md` |
| §6 难度分级、§7 计分与判定 | `prd/04-scoring-judging.md` |
| §8 蒙尘模式的诚实边界 | `prd/05-dust-observation.md` |
| §9 结果展示、§10 过程回放 | `prd/06-result-replay.md` |
| （v1.10 散在 §2.2/§8.6/§12/§13 的 API 内容） | `prd/07-agent-api.md`（v2.0 新编） |
| §13 数据模型 | `prd/08-data-model.md` |
| §11 非功能需求、§12 错误处理 | `prd/09-contract-nfr.md` |
| §14 验收标准 | `prd/10-acceptance.md` |
| 附录 A / B / C | `prd/11-appendix.md` |
| §15 竞品分析 | `docs/research/2026-10-25-competitor-analysis-research.md` |
| §16 风险与未决项 | 本文 §5 |
| 文档头变更记录 v1.2~v1.10 | `prd/CHANGELOG.md` |

> 引用规则：**跨文件引用必须写成 `文件名 §编号`**（如 `04-scoring-judging.md §7.2.1`），只写 `§7.2.1` 仅在同一个文件内部有效。

---

## 3. MVP 边界（v2.0 定稿）

**MVP = 12 项 P0**：F01–F11 + F18。

相对 v1.10 的变化：

| 变化 | v1.10 | v2.0 | 理由 |
|---|---|---|---|
| F14 观察模式细分 | P0（MVP 13 项） | **P1**（MVP 12 项） | v1.10 #54 单方面升 P0，但 SPEC 锁定清单从未收录、代码无配置入口、`after_move` 无门控逻辑。降回 P1 并把"补配置入口 + 补 `after_move` 门控"列为 P1 首要项。AC-19/20/65 同步降级 |
| F09 回放 | P0 单项 | **拆为 F09a（P0）/ F09b（P1）** | F09a =「结果页原地重放」已交付；F09b =「独立回放页 + 进度条 + 调速 + 单步 + 三视角 + 版本提示」未实现。AC-47/48/50 降级至 P1，新增 AC-78 描述 F09a |
| F15 最小题库 | P1（v1.1 落地） | **P1，已提前交付** | 6 条预设题（2/3/4 阶各 2 条）已实现，据实标注 |

一句话验收（不变）：打开页面 → 选 3×3 + 指定 seed → 创建 → 看到题面 → 点开始 → 键盘转到底 → 看到"已还原 / 用时 / 步数" → 点回放在 3D 上重演；同时控制台能 `window.cubeAgent.observe()` 拿到同样的题面。

---

## 4. 交付基线（v2.0 定稿时的实现现状）

> 完整矩阵见 `docs/reports/2026-10-26-implementation-status-report.md`。本节只给决策者需要知道的汇总。
> 验证时间：2026-10-26。验证命令结果：`npm run typecheck` 零错误 / `npm test` 18 文件 232 用例全绿 / `npm run build` 通过（719.15 KB，gzip 188.23 KB，1 条 chunk 体积警告）。

### 4.1 P0 功能交付状态

| 功能 | 状态 | 缺口 |
|---|---|---|
| F01 3D 渲染 + 视角 | **部分** | AC-53 的 2D 展开图降级未实现；WebGL 失败只给终止页，"全部功能照常可用"不成立 |
| F02 引擎 | **已交付** | — |
| F03 键盘 + 按钮 | **已交付** | 层轮廓描边（AC 未编号，UIUX §10.3）接口已建但 `show()` 无调用者 |
| F04 打乱 + seed 复现 | **已交付** | — |
| F05 蒙尘门控 | **部分** | AC-16 的 ΔE 确定性探针**无自动化断言**（仅人工目检 + 一次性评审脚本） |
| F06 计时 + HTM 计步 | **已交付** | §7.2 的 7 项计时指标只实现 3 项（`elapsed_ms` / `paused_total_ms` / `tps`） |
| F07 还原判定 | **部分** | 镜像配色只在内部 `reason='invalid-scheme'` 区分，AC-26 要求的对外 `INVALID_STATE` 错误码不存在 |
| F08 `cubeAgent` API | **已交付** | — |
| F09a 结果页原地重放 | **已交付** | 260ms 定时器驱动，非独立回放页 |
| F10 结果展示 | **已交付** | — |
| F11 localStorage 历史 | **已交付** | 上限 50 条（ARCHITECTURE 曾写 100，以代码为准）；PRD §11 的"4MB 触发清理提示"未实现 |
| F18 真暂停 | **已交付** | — |

### 4.2 必须在 v2.0 之后立即处理的缺陷

| # | 缺陷 | 违反 | 严重度 |
|---|---|---|---|
| **D1** | `session.tick()` 只豁免 `paused` / `ended`，**未豁免 `solved_pending`** → 已还原但未提交的运行可被超时覆盖为 `timeout` | AC-28、AC-75 | **高（真 bug，无测试覆盖）** |
| D2 | `autoSubmitOnSolved` 是死配置：`settings.ts` 定义并默认 `true`，全库无消费者 | v1.10 §2.1 / AC-75 | 高（v2.0 已把默认改为 `false` 对齐现实，但该字段仍需接线或删除） |
| D3 | `stickerLabels` / `monoMode` 死配置；`setMono()` 无调用者。SPEC §9 声称"面中心字母默认开、不可关"**完全未实现** | 色盲无障碍三级 | 中 |
| D4 | `measureFrameBudget()` 导出但无调用者；无 draw call 采样 | `execution/render.md` 帧预算降级 | 中 |
| D5 | `tests/_scratch.test.ts` 是无断言的遗留物（只打印 seed / 指纹到 stdout） | 测试卫生 | 低 |

> **D1 是本次 review 发现的唯一功能性 bug**，其余是文档-代码背离或未接线。修 D1 需要一行 guard + 一条测试，但**本仓库未初始化 Git**（`repository_root: null`，用户未授权建仓），worktree-first 策略下无法为代码改动开任务分支。因此 v2.0 只做文档裁定，**不改代码**；D1 的修复需单独授权。

### 4.3 P1 / P2 未实现清单（据实标注，不伪装成已交付）

- **P1**：F09b 独立回放页（进度条 / 调速 / 单步 / 三视角 / AC-50 版本提示）、F12 同题面重跑（已实现，可升级为 P0 追认）、F13 多轮对比表（`compareElapsedMs` 恒 `null`）、F14 观察模式配置入口 + `after_move` 门控、F16 记法输入框（`F2` 未注册）、F17 难度标签（`difficultyLabel` 恒 `null`）、§11.1 埋点体系（**零实现**）、AC-16 探针自动化、AC-53 2D 降级、4MB 存储清理提示
- **P2**：F19–F24（自动难度分级 / 批量提交 / 移动端 / 云端题库 / 求解器提示 / 多人房间），全部符合 Out-of-Scope，未做

### 4.4 技术债：文件规模红线

`execution/CONTRACT.md` 的"单文件 ≤ 300 行"红线当前有 **8 个 TS 文件违约**：

| 文件 | 行数 | 超出 |
|---|---:|---:|
| `src/wiring/index.ts` | 848 | +548 |
| `src/challenge/session.ts` | 772 | +472 |
| `src/ui/shell.ts` | 507 | +207 |
| `src/ui/turn-matrix.ts` | 377 | +77 |
| `src/engine/notation.ts` | 368 | +68 |
| `src/ui/panels/result-panel.ts` | 333 | +33 |
| `src/contracts.ts` | 326 | +26 |
| `src/ui/keyboard.ts` | 302 | +2 |

另有 3 个 CSS 文件超线（`components.css` 1453 / `layout.css` 648 / `tokens.css` 543）。红线本身在 v2.0 保留（它是有效的架构约束），但当前违约状态必须显式登记，不得当作已满足。

---

## 5. 风险与未决项

### 5.1 风险（按"影响 × 概率"排序）

| # | 风险 | 影响 | 概率 | 缓解措施 | 兜底方案 |
|---|---|---|---|---|---|
| R1 | **键盘记忆成本过高**，人类玩家在首分钟流失 | 高（直接打掉画像 A） | 中高 | 常驻键位图 + 按下回显 + 前缀预览 + 首次引导（`prd/03` §5.5） | 鼠标层选择器 + 箭头按钮本身就是完整兜底，纯鼠标也能玩；极端情况下把 P0 的键盘改为"可选"，默认用按钮 |
| R2 | **4 阶层操作复杂度爆炸**（10+ 种层组合），玩家放弃 4 阶 | 中（4 阶是差异化卖点） | 中高 | 前缀分层 + 状态栏实时预览 + 层选择器；按 `prd/01` §3.4 锁定交付 | 若实测学习成本过高，只把"内层快捷键"降级为可选（层选择器仍完整覆盖 AC-40），**不得缩减 tab 组数** |
| R3 | **蒙尘被误当作防作弊**，有用户拿它对外宣称"模型能力认证" | 高（损害产品可信度） | 中 | `prd/05` §8.4 结论同时出现在 PRD / 结果页 / 配置页三处；文案不可关闭 | 若真出现对外背书诉求，直接引导到"需要服务端方案"并明确拒绝以此为依据 |
| R4 | **还原判定的边界错误**（4 阶配色镜像、整体朝向、2 阶无锚点） | 高（判错就是产品事故） | 中 | AC-23~AC-26 四条机器验证；单测覆盖 24 朝向 × 每阶 | 提供"手动校验视图"：结果页可展开 6 面颜色矩阵，让用户自己核对 |
| R5 | **180° 双击归并误判**（用户真想做两次 90°） | 低（可关闭，且语义等价） | 低 | 300ms 窗口 + 状态栏"已合并"提示 + `merged_from` 留痕 | 关闭归并，180° 改走界面按钮。**不设 `Alt` 键盘替代通道** |
| R6 | **难度分级不可信**（无求解器，只是启发式） | 中（评测场景会质疑） | 高（确定发生） | 结果页强制标注"启发式估计，非最短解距离"；`distance_is_estimated: true` 写进元信息 | 引入求解器（F19，P2），2 阶先做 |
| R7 | **localStorage 配额不足**（4 阶 2000 事件 × 多次运行） | 中（丢记录） | 中 | 事件上限 2000 条 + 截断标记 + 颜色矩阵不入库 + 200KB/次压缩目标 | 50 条记录上限（代码现状）；`E_STORAGE_FULL` 时提示清理，不静默删除 |
| R8 | **低端机 4 阶渲染掉帧** | 中（体验） | 中 | 贴纸用实例化渲染、动画 60ms 下限、拖拽时降级为低精度 | 提供"性能模式"开关；WebGL 失败时降级 2D 展开图（AC-53，**当前未实现，见 §4.1**） |
| R9 | **纯前端计时可被篡改**，用户质疑成绩真实性 | 中 | 高（确定发生，但影响有限） | 结果页恒显示"本机测量，未经服务端校验"；不做排行榜 | 需要时上服务端 |
| R10 | **Agent 在 `ready` 态通过内存读取题面**，导致蒙尘评测结论失真 | 高（结论失效） | 中 | `prd/05` §8.3 明确列出 N1–N5；在文档与 UI 中声明蒙尘只防误看 | 评测结论只能作为内部信号；对外需服务端 |
| **R11** | **文档-代码漂移复发**（v2.0 新增） | 高（本轮已付出四份文档互相矛盾的代价） | 中高 | §1.2 权威映射表 + "不得重述、只得链接"硬约束；`contracts.ts` 作为字面真源；每次 PRD 升版必须重跑一致性自查（`prd/11-appendix.md` 附录 B） | 漂移一经发现按 §1.3 记裁定，不得就地双写 |

### 5.2 未决项

v1.10 的 Q1 / Q2 / Q3 / Q6 / Q8 已在 v2.0 全部闭环，裁定过程见 `docs/decisions/`。剩余未决：

| # | 未决问题 | 需谁定 | 影响范围 | 建议 |
|---|---|---|---|---|
| Q4 | 难度分公式的权重（`prd/04` §6.2）是否需在真实题面上回归校准 | 设计师 + PM（P1 阶段） | §6、F17 | P1 阶段拿 30 条真实题面人工标级做一次对齐，允许改权重 |
| Q5 | 深色竞技风的具体色板与"高对比配色"的 6 面色是否有冲突风险 | 设计师 | §11 可访问性、配色 | 以"贴纸色可辨"为不可让步项。当前 L\* 阶梯（97.11 / 82.66 / 73.99 / 66.12 / 56.53 / 46.97）已按此设计 |
| Q7 | 结果页"同题面重跑"是否需要同题面历史曲线（不止列表） | 设计师 | F12 / F13 | 先做列表 + 均值/标准差，曲线放 P2 |
| **Q9** | `finished`（现 `ended_*`）态 `Space` 应该做什么 | PM | `prd/03` §5.3.4、AC-38 | **v2.0 临时裁定：无动作**（对齐代码现状）。v1.10 写的"返回配置"在 v1.9 把配置面板改为左栏常驻后已无落点。若要恢复语义，需先定义"返回配置"到底是什么操作 |
| **Q10** | AC-42 的返回形状：文档 8 字段 vs 代码 13 字段 | 架构师 + PM | `prd/07`、`execution/agent-api.md` | **v2.0 裁定：以代码 13 字段为准**（已交付且经四轮评审验证），AC-42 标记 `[v2.0 修订]`。若坚持 8 字段需改代码并回归全部 API 测试 |

---

## 6. 关联文档

| 文档 | 用途 |
|---|---|
| `docs/specs/execution/CONTRACT.md` | 架构实现契约主文件（原 `ARCHITECTURE.md`） |
| `docs/specs/execution/UIUX.md` | 设计契约主文件（原 `UIUX.md`） |
| `docs/specs/execution/verification.md` | 测试策略 + 端到端验证步骤 + 已实证的坑 |
| `docs/specs/execution/ui-gate.md` | 设计验收门禁（取代已作废的 `DESIGN-GATE-A.md`） |
| `docs/decisions/ADR-001`~`ADR-006` | 架构决策记录 |
| `docs/decisions/2026-10-26-nine-issues-ruling-decision.md` | 九条用户反馈裁决（v1.9 的依据） |
| `docs/decisions/2026-10-26-prd-v2-rulings-decision.md` | **v2.0 的全部口径裁定**（本文档的裁定依据） |
| `docs/reports/2026-10-26-implementation-status-report.md` | 开发进度矩阵与偏差清单 |
| `docs/research/2026-10-25-competitor-analysis-research.md` | 竞品分析（原 PRD §15） |
| `docs/archive/2026-10-26-docs-v1/` | v1.x 全系列归档原文（PRD v1.10 / ARCHITECTURE v1.4 / UIUX v1.5 / SPEC v1.0 / DESIGN-GATE-A） |
| `design/design-tokens.{css,json}` | 色值唯一源头 |
| `src/ob-cube/src/contracts.ts` | 数据模型与错误码的字面真源（冻结文件） |
