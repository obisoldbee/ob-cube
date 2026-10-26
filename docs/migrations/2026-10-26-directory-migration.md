# 目录迁移记录 — 2026-10-26

| 字段 | 值 |
|---|---|
| 迁移日期 | 2026-10-26 |
| 治理层 | Project Root（`workbuddy1024`，Code 类型） |
| 生命周期 | **Governance maintenance**（重组既有路径），由用户显式授权："用这个 skill 重新整理一下当前项目目录，我觉得文档位置都没有放对" |
| 依据 | `project-conventions` skill 的 `references/directory-layout.md`（完整布局规范）、`references/migration-guide.md`（迁移程序）、`references/review-naming.md`（评审命名）、`references/agents-md-template.md`（AGENTS.md 模板） |
| Git 状态 | **本仓库未初始化 Git**（`.project-conventions/project.json` 的 `repository_root: null`）。无 `.git` 需要保护，无 commit/stash 风险；但也因此无法为代码改动开 worktree，见 §7 |
| 关联 | `docs/decisions/2026-10-26-prd-v2-rulings-decision.md`（口径裁定）、`docs/specs/prd/CHANGELOG.md`（变更条目 62–68）、`conversation/07-20261026-docs-v2-migration.md`（协作过程） |

---

## 1. 背景：为什么需要这次迁移

用户提出的三个问题，勘察后确认都成立：

1. **文档位置没放对。** `project-conventions` 的 `directory-layout.md:158` 明确规定 `docs/specs/` 收纳 "Product requirement documents (PRD), architecture designs, technical design docs, interface definitions"。但本项目把 `PRD.md` / `ARCHITECTURE.md` / `UIUX.md` 三份规格文档全放在 `docs/` 根下，`docs/specs/` 里只有一份 `SPEC-v1.0.md`；`design-tokens.{css,json}` 这两个设计系统资产也放在 `docs/` 根下（规范里属 `design/`）。
2. **"PRD 和 specs 的关系"含混。** 项目把 "spec" 重载成了两个意思——目录语义（`docs/specs/` = 所有规格文档的家）与文档语义（`SPEC-v1.0.md` = 一份具体的"开发期唯一契约"）。裁定见决策记录 §2。
3. **PRD 太长且自相矛盾。** 1835 行单文件，含 61 条变更记录；与 SPEC / ARCHITECTURE 存在 28 组实质矛盾，其中 SPEC 用的是 PRD v1.3 时代的**冻结前 AC 编号**，并已渗入 9 处代码注释。

## 2. 迁移前 → 迁移后目录树

### 迁移前

```
workbuddy1024/
├── AGENTS.md                        # 目录索引缺 docs 子目录、media/、design/
├── README.md                        # 初始化模板残留，未描述真实项目
├── conversation/  (00–06)
├── memory/MEMORY.md                 # 无每日日志
├── media/202610251133/              # 21MB，72 文件（录屏 + 59 帧 + 工具 manifest）
├── docs/
│   ├── PRD.md                 1835 行  ← 位置错误
│   ├── ARCHITECTURE.md        2183 行  ← 位置错误
│   ├── UIUX.md                1722 行  ← 位置错误
│   ├── design-tokens.css       602 行  ← 位置错误（属 design/）
│   ├── design-tokens.json     1623 行  ← 位置错误（属 design/）
│   ├── specs/SPEC-v1.0.md      251 行  ← 基于 PRD v1.3，编号体系已废
│   ├── decisions/  ADR-001~005 + 2026-10-26-nine-issues-ruling.md  ← 缺 -decision 后缀
│   ├── reviews/    5 份评审（命名不符规范）+ DESIGN-GATE-A.md      ← 命名/内容双问题
│   ├── research/   3 个 .py + __pycache__/                        ← 无 .md 说明，含缓存
│   └── plans/      (空)
└── src/ob-cube/
    ├── final-ended.png  final-result.png  final-running.png  shot-01-dust.png  ← 评审证据散落源码根
    ├── s1.yaml                                    ← 无障碍树 dump，零引用
    ├── .playwright-cli/  (87 个浏览器测试临时产物)  ← 工具缓存污染源码
    ├── scripts/          (空目录)
    ├── dist/  node_modules/  src/  tests/  package.json  tsconfig.json  vite.config.ts  index.html
```

### 迁移后

```
workbuddy1024/
├── AGENTS.md                        # 目录索引已更新（含 docs 子目录、design/、material/）
├── README.md                        # 已重写：真实项目描述 + 技术栈 + 快速开始
├── conversation/  (00–07)           # 新增 07 本次迁移与 v2.0 重构记录
├── memory/
│   ├── MEMORY.md                    # 权威文档链已改为 v2.0 两桶结构
│   └── 2026-10-26.md                # 新增每日日志
├── material/202610251133/           # ← media/ 改名（规范的素材边界名），72 文件原样保留
├── design/
│   ├── design-tokens.css            # ← docs/ 移入，色值唯一源头
│   └── design-tokens.json           # ← docs/ 移入，$executable 口径已改为确定性探针
├── docs/
│   ├── specs/
│   │   ├── PRD.md                   # ★ v2.0 主文件（276 行）
│   │   ├── prd/                     # ★ PRD 范畴：01–11 子章节 + CHANGELOG（12 文件）
│   │   └── execution/               # ★ 执行范畴：CONTRACT/UIUX + 10 模块（12 文件）
│   ├── decisions/
│   │   ├── ADR-001~005.md
│   │   ├── ADR-006.md                              # ★ 新增：TypeScript 版本回退
│   │   ├── 2026-10-26-nine-issues-ruling-decision.md   # ← 补 -decision 后缀
│   │   └── 2026-10-26-prd-v2-rulings-decision.md       # ★ 新增：v2.0 全部口径裁定
│   ├── reviews/
│   │   ├── 2026-10-26-engineer-code-000000{,-1,-2,-3}.md   # ← 4 份实现评审改名
│   │   ├── 2026-10-26-qa-code-000000.md                    # ← 浏览器测试评审改名
│   │   └── artifacts/  (5 个文件)                          # ★ 新增：评审证据归位
│   ├── research/
│   │   ├── 2026-10-25-competitor-analysis-research.md      # ★ 新增：原 PRD §15
│   │   ├── 2026-10-25-engine-verification-baseline-research.md  # ★ 新增：3 个 .py 的说明
│   │   └── _color-math.py  permutation-proof.py  verify-spec-vs-proof.py
│   ├── reports/
│   │   └── 2026-10-26-implementation-status-report.md      # ★ 新增：开发进度矩阵
│   ├── migrations/
│   │   └── 2026-10-26-directory-migration.md               # ★ 本文件
│   ├── archive/2026-10-26-docs-v1/
│   │   ├── PRD.md  ARCHITECTURE.md  UIUX.md  SPEC-v1.0.md  DESIGN-GATE-A.md   # v1.x 归档，原名保留
│   └── plans/                     (空，Code 类型项目的必需目录，按需填充)
└── src/ob-cube/
    ├── dist/  node_modules/  src/  tests/  package.json  package-lock.json
    ├── tsconfig.json  vite.config.ts  index.html
    # 已移除：4 张 PNG + s1.yaml（→ docs/reviews/artifacts/）、.playwright-cli/（87 文件，可再生）、scripts/（空）
```

## 3. 文件映射表

### 3.1 归档（不删除，原名保留）

| 旧路径 | 新路径 | 原因 |
|---|---|---|
| `docs/PRD.md` | `docs/archive/2026-10-26-docs-v1/PRD.md` | v1.10 被 v2.0 取代。规范：`docs/archive/YYYY-MM-DD-<topic>/`，文件内保留原名 |
| `docs/ARCHITECTURE.md` | `docs/archive/2026-10-26-docs-v1/ARCHITECTURE.md` | v1.4 拆分为 `execution/` 7 个文件后归档 |
| `docs/UIUX.md` | `docs/archive/2026-10-26-docs-v1/UIUX.md` | v1.5 拆分为 `execution/` 4 个文件后归档 |
| `docs/specs/SPEC-v1.0.md` | `docs/archive/2026-10-26-docs-v1/SPEC-v1.0.md` | **SPEC 层废除**。基于 PRD v1.3 的冻结前编号体系，且自称"冲突时以本文件为准"。§4/§11/§12 有价值内容已并入 `execution/` |
| `docs/reviews/DESIGN-GATE-A.md` | `docs/archive/2026-10-26-docs-v1/DESIGN-GATE-A.md` | **作废**。整份基于 v1.2 旧暂停语义（A20/A23/B7）与"8 个方法"口径，按它验收会判反。由 `execution/ui-gate.md` 取代 |

### 3.2 归位（位置错误 → 规范位置）

| 旧路径 | 新路径 | 依据 |
|---|---|---|
| `docs/design-tokens.css` | `design/design-tokens.css` | `directory-layout.md` §`design/`：设计系统文件属 `design/`，与 `docs/specs/`（书面设计规范）区分 |
| `docs/design-tokens.json` | `design/design-tokens.json` | 同上 |
| `media/` | `material/` | `directory-layout.md` §`material/`：用户提供的源素材边界。**72 个文件原样保留，内部 manifest 未改写**（那是工具生成的过往运行证据，改写等于伪造） |
| `src/ob-cube/final-ended.png` | `docs/reviews/artifacts/2026-10-25-final-ended.png` | `directory-layout.md` §`docs/reviews/artifacts/`：评审附件（截图、日志、测试证据）。零代码引用，已核实 |
| `src/ob-cube/final-result.png` | `docs/reviews/artifacts/2026-10-25-final-result.png` | 同上 |
| `src/ob-cube/final-running.png` | `docs/reviews/artifacts/2026-10-25-final-running.png` | 同上 |
| `src/ob-cube/shot-01-dust.png` | `docs/reviews/artifacts/2026-10-25-shot-01-dust.png` | 同上 |
| `src/ob-cube/s1.yaml` | `docs/reviews/artifacts/2026-10-25-a11y-tree-s1.yaml` | 无障碍树 dump，零引用。改名以说明内容 |
| PRD §15 竞品分析（61 行） | `docs/research/2026-10-25-competitor-analysis-research.md` | `directory-layout.md` §`docs/research/`：竞品分析属 research，不属 PRD |

### 3.3 评审文件改名（`review-naming.md` 规范：`YYYY-MM-DD-<reviewer>-<scope>-HHMMSS.md`）

`reviewer` / `scope` 从文件内容判定；**开始时间未记录，按规范用 `000000` 占位**（`review-naming.md` §"Handling Unknown Timestamps"：`000000` 表示"时间未记录"，不得解读为午夜）。同日同 reviewer+scope 的碰撞按规范加 `-N` 后缀。

| 旧名 | 新名 | reviewer / scope 判定依据 |
|---|---|---|
| `2026-10-26-prd-implementation-review.md` | `2026-10-26-engineer-code-000000.md` | 头部"审查对象：`src/ob-cube`" → engineer / code |
| `2026-10-26-prd-implementation-review-2.md` | `2026-10-26-engineer-code-000000-1.md` | 同上；碰撞后缀 `-1` |
| `2026-10-26-prd-implementation-review-3.md` | `2026-10-26-engineer-code-000000-2.md` | 同上；碰撞后缀 `-2` |
| `2026-10-26-prd-implementation-review-4.md` | `2026-10-26-engineer-code-000000-3.md` | 同上；碰撞后缀 `-3` |
| `2026-10-26-prd-browser-test-review-4.md` | `2026-10-26-qa-code-000000.md` | 头部"测试对象：`src/ob-cube`"，浏览器实测 → qa / code |
| `docs/decisions/2026-10-26-nine-issues-ruling.md` | `2026-10-26-nine-issues-ruling-decision.md` | `directory-layout.md` §`docs/decisions/`：`YYYY-MM-DD-<topic>-decision.md` |

> **轮次身份的保留**：旧名的 `-2/-3/-4` 编码的是评审轮次，新名的 `-1/-2/-3` 是规范要求的碰撞后缀，两者不一一对应（`-4` → `-3`）。轮次信息在每份文件头部本来就有（"本轮为独立复审，用例不与前 N 轮重复"），且 §3.3 本表是权威的旧→新映射。`ADR-001`~`ADR-005` **未改名**——`directory-layout.md` 明确允许 ADR 式命名。

### 3.4 拆分（内容保真搬运，非重写）

| 源 | 目标 | 抽取方式 | 覆盖校验 |
|---|---|---|---|
| `PRD.md` v1.10（1835 行） | `docs/specs/PRD.md`（主文件，新写）+ `prd/01~11-*.md` + `prd/CHANGELOG.md` + `docs/research/2026-10-25-competitor-analysis-research.md` | `sed -n 'START,ENDp'` 按章节行范围抽取，再注入 v2.0 头部，再逐条套用裁定修正 | **1834 / 1835 行**（唯一未覆盖的是第 128 行的 `---` 分隔符） |
| `ARCHITECTURE.md` v1.4（2183 行） | `execution/CONTRACT.md` + `engine.md` + `notation.md` + `puzzle.md` + `agent-api.md` + `render.md` + `persistence.md` + `verification.md` | 同上 | **2170 / 2183 行**（缺的 13 行是原文件头，`CONTRACT.md` 已重写头部取代） |
| `UIUX.md` v1.5（1722 行） | `execution/UIUX.md` + `ui-visual.md` + `ui-shell.md` + `ui-gate.md` | 同上 | **1722 / 1722 行** |
| `SPEC-v1.0.md` §11/§12（47 行） | `execution/verification.md` 尾部 | 同上 | 47 / 47 行 |

> **为什么用 `sed` 行范围抽取而不是让模型重述**：4000+ 行的技术契约一旦被转写就可能丢失或篡改具体数值（ΔE 阈值、draw call 预算、slot 公式、错误码全名）。行范围抽取保证字节级保真，模型的改动集中在**显式的 v2.0 修订说明块**与逐条 Edit 上，每一处都可追溯。

### 3.5 删除（仅可再生缓存与空目录）

| 路径 | 文件数 | 理由 |
|---|---|---|
| `src/ob-cube/.playwright-cli/` | 87 | 浏览器测试工具的临时产物（`.yml` 快照 / `.png` / `.log`），可再生。用户已在授权勾选里明确"删缓存" |
| `docs/research/__pycache__/` | 1 | Python 字节码缓存，可再生 |
| `src/ob-cube/scripts/` | 0（空目录） | 空目录。`migration-guide.md` §5.5 允许"移除已验证为空的旧目录" |

**未删除任何东西**：全部 v1.x 文档、评审、素材、录屏与帧图均保留（归档或归位）。

## 4. 引用同步（`migration-guide.md` Phase 4）

### 4.1 已更新的引用

| 文件类型 | 处数 | 说明 |
|---|---|---|
| `docs/specs/execution/*.md`（活跃文档） | 6 | 活跃引用改指新位置（`design/design-tokens.css`、`../prd/03-notation-keyboard.md`、`../prd/05-dust-observation.md`）；历史叙述补归档路径指针 |
| `docs/reviews/*.md`（历史记录） | 5 | 只改路径串，**不改叙述**（`migration-guide.md` §4.5）。旧文档名指向归档路径并标注现行为 |
| `conversation/02,03,05,06` | 4 | 同上 |
| `docs/decisions/2026-10-26-nine-issues-ruling-decision.md` | 1 | `media/` → `material/` |
| `docs/specs/prd/CHANGELOG.md` | 1 | decisions 改名同步 |
| `src/ob-cube/src/contracts.ts` | 1 | 头部注释里 `docs/specs/SPEC-v1.0.md` → v2.0 的契约变更流程；另修正一处错误章节引用（`PRD §6.2` 实为难度分级章，命名约定的权威是 `prd/07-agent-api.md` §7.1） |
| `src/ob-cube/src/` 其余代码注释 | 8 | **陈旧 AC 编号修正**：`AC-22` → `AC-16`（`render/mask-material.ts` ×2、`render/cube-view.ts`、`render/palette.ts`、`render/scene.ts`、`ui/stage.ts`、`ui/tokens.css` ×2），`AC-25` → `AC-17`（`ui/stage.ts`）。**纯注释改动，不动逻辑**，用户已逐项授权 |
| `design/design-tokens.css` / `.json` | 3 | 已废止的"画布中心 80% 区域内颜色种类 ≤2"口径改为 AC-16 的确定性探针 ΔE 口径 |
| `memory/MEMORY.md` | 全文重写 | 权威文档链改为 v2.0 两桶结构 |
| `AGENTS.md` / `README.md` | 全文更新 | 目录索引与项目描述 |

### 4.2 有意**未**更新的引用（`migration-guide.md` §4.4 例外）

| 路径 | 原因 |
|---|---|
| `.workbuddy/memory/2026-10-25.md` | Agent 平台系统目录，规范明令"NEVER write to the agent platform's system memory directory" |
| `.ego/`、`.screenshots/` | 隐藏的 Agent 工具目录，不由本 skill 管理 |
| `material/202610251133/*/manifest.json` | 工具生成的过往运行证据，其中记录的 `docs/PRD.md` 是**当时**的真实路径。改写等于伪造证据 |
| `docs/archive/2026-10-26-docs-v1/*` | 归档原文按定义保留旧路径 |
| 本文件（`docs/migrations/`） | 迁移记录**有意**包含旧路径以做前后对比 |
| `docs/specs/prd/CHANGELOG.md` 第 19 行 | 变更条目在叙述"1835 行 `docs/PRD.md` → `docs/specs/PRD.md`"，旧路径是内容本身 |

## 5. 验证结果

| 检查 | 命令 | 结果 |
|---|---|---|
| 类型门禁 | `npm run typecheck` | **零错误**（与迁移前一致） |
| 单元测试 | `npm test` | **18 文件 / 232 用例全绿**（与迁移前基线一致） |
| `design-tokens.json` 合法性 | `node -e "JSON.parse(...)"` | **解析通过** |
| 陈旧 AC 引用清零 | `grep -rn "AC-25" src/ob-cube/src/` | **零命中** |
| 陈旧 AC 引用清零 | `grep -rn "AC-22" src/ob-cube/src/` | 4 处命中，**全部是正确用法**（`AC-22` = MoveEvent 四字段，见 `challenge/session.ts:525`、`contracts.ts:140/144/225`） |
| 旧口径清零 | `grep -rn "颜色种类 ≤ *2\|中心 80%" design/` | **零命中**（除标注为"已废止"的说明文字） |
| 旧路径引用清零 | `grep -rn "docs/PRD\.md\|docs/ARCHITECTURE\.md\|..."` 排除 archive/隐藏/material | 3 处命中，**全部有意保留**（见 §4.2） |
| 错误码集合差分 | `grep -oE '\bE_[A-Z_]+'` 全部 v2.0 文档 vs `contracts.ts` 的 `ERROR_CODES` | **30 个真实码全部有文档**，无遗漏；查出 **8 个幽灵码**，已在 `execution/agent-api.md` §7.6 建立登记表 |
| 构建 | `npm run build` | 迁移前基线：通过，719.15 KB（gzip 188.23 KB），1 条 chunk 体积警告。**本次未重跑**（改动仅涉及 `.md` / 注释 / CSS 注释，无逻辑与产物变化） |

## 6. 未处理项（不扩大范围）

| 项 | 状态 | 说明 |
|---|---|---|
| `docs/plans/` 为空 | 保留 | Code 类型项目的必需目录，按需填充。本次任务不产出实现计划 |
| `.ego/`、`.screenshots/`、`.workbuddy/` | **未触碰** | 隐藏的 Agent 工具/平台目录，规范明令不由本 skill 管理 |
| `src/ob-cube/dist/`、`node_modules/` | **未触碰** | `directory-layout.md`：构建中间产物留在 `src/` 下，只有最终分发物才进 `release/`。本项目无 `release/` 需求 |
| `docs/research/` 下 3 个 `.py` | 保留原位 | 它们是引擎正确性的机器证据（`verification.md` §12 步骤 0 要求改动引擎后必须重跑）。规范里 `docs/research/` 收纳"technology investigations / feasibility studies"，验证脚本属此类；已补 `2026-10-25-engine-verification-baseline-research.md` 说明其用途与运行方式，满足该目录应有研究文档的要求 |
| 代码缺陷 D1–D8 | **未修** | 见决策记录 §6。本仓库未初始化 Git，worktree-first 策略下无法为代码改动开任务分支；本次仅授权了注释级改动 |

## 7. 关于 worktree-first 策略的一处偏离（透明登记）

`.project-conventions/ACCESS.md` 与 `AGENTS.md` 规定的 `worktree-first` 策略要求"代码改动使用一个任务专属分支与 linked Git worktree"。**本次无法遵守，因为本仓库没有 Git**（`repository_root: null`，用户未授权建仓，`AGENTS.md` 也明令"Do not initialize Git without task authorization"）。

实际采取的措施：

- 本次**未改任何代码逻辑**，只改了 9 处注释（8 处陈旧 AC 编号 + 1 处路径引用），且用户在授权勾选里逐项确认了范围与验证方式（"纯注释改动，不动逻辑，改完跑 typecheck + test 验证"）。
- 单写者（本 Agent），无并发写冲突。
- 改后立即跑 `npm run typecheck`（零错误）与 `npm test`（18 文件 232 用例全绿），与迁移前基线逐项一致。
- 决策记录 §6 登记的 D1–D8 需要真实代码改动，**已明确留待单独授权**，未擅自执行。

## 8. 回滚边界

本次迁移的全部动作都是**可逆的路径移动与文本编辑**，无删除用户资料：

- 归档：5 个文件从原位置 `mv` 到 `docs/archive/2026-10-26-docs-v1/`，**原名保留**。回滚 = 反向 `mv`。
- 归位：`design/`（2 个）、`material/`（72 个）、`docs/reviews/artifacts/`（5 个）。回滚 = 反向 `mv`（artifacts 里的 5 个文件改了名，对照 §3.2 表）。
- 改名：6 个文件（5 份评审 + 1 份决策）。回滚 = 按 §3.3 表反向改名。
- 删除：仅 88 个可再生缓存文件 + 1 个空目录（§3.5）。`.playwright-cli/` 会在下次浏览器测试时重新生成；`__pycache__/` 会在下次运行 `.py` 时重新生成。
- 新建：23 个 v2.0 文档 + 5 个治理记录。回滚 = 删除新建文件。
- 文本编辑：`src/ob-cube/src/` 的 9 处注释、`design/` 的 3 处口径说明。无 Git 可 diff，但每处都在本记录 §4.1 与本文件 §3 中列明。

> **注意**：因为无 Git，本次迁移**没有提交点可回退**。若需回滚，只能按上表手工反向操作。这是"未初始化 Git"的直接代价，也是建议尽快授权建仓的理由之一。
