# workbuddy1024 · ob-cube

**魔方挑战与 AI Agent 评测平台** —— 一个网页，人和 AI Agent 用同一套魔方引擎、同一份计步规则、同一条回放记录，在同一个可复现题面上比谁还原得更好。

纯前端单页应用，无后端、无账号、可静态部署、可离线运行。支持 2×2 / 3×3 / 4×4。

差异化不在于"又一个网页魔方"，而在于把速拧计时器的**题面复现与键盘手感**，和 AI 评测平台的**同题多轮可比与逐帧 trace**，压进同一个零部署的页面。人按下的是 `D` 键（R 面），Agent 调用的是 `applyMove('R')`——两者在引擎里是同一条指令、在回放里是同一条事件。

## 技术栈

| 层 | 选型 | 锚定版本 | 说明 |
|---|---|---|---|
| 构建 | Vite | `~8.3.5` | 零配置 TS 直出、`?raw` 导入；不装任何 Vite 插件 |
| 语言 | TypeScript | `~5.9.3` | 原锚定 `~7.0.2`，因 `@types/three` 声明 `typeScriptVersion: 5.6` 而回退，见 `docs/decisions/ADR-006.md` |
| 3D | three | `~0.186.1` | 只需盒体 + 相机 + 矩阵 |
| 3D 类型 | @types/three | `~0.186.0` | three 自身不带类型 |
| 单测 | vitest | `~5.0.5` | `environment: node` 跑引擎与动画；jsdom 仅 UI |
| DOM | jsdom | `~30.1.3` | 仅 UI 组件测试 |
| 覆盖率 | @vitest/coverage-v8 | `~5.0.5` | 与 vitest 同版本线 |
| 图标 | lucide-static | `~1.61.0` | **全项目唯一图标源**，`?raw` 导入，`stroke=currentColor` |

运行时基线：Node `>=22.12.0`（本机 v24.18.0）。包管理：npm（有 `package-lock.json`）。

**明确不引入**：后端运行时、数据库、ORM、鉴权、状态管理库、UI 组件框架、CSS-in-JS、图标字体、emoji 图标。

## 快速开始

```bash
cd src/ob-cube
npm install

npm run dev         # 开发服务器（默认 5173）
npm run typecheck   # tsc --noEmit，须零错误
npm test            # vitest run，18 文件 / 232 用例
npm run build       # tsc --noEmit && vite build，产出 dist/
npm run preview     # 静态预览（4173）
npm run coverage    # 覆盖率（当前未纳入门禁流程）
```

**改动引擎前必做的基线验证**（`src/ob-cube/src/engine/` 下任何文件）：

```bash
# 在项目根目录执行。注意本机用 python，不是 python3
python -B docs/research/permutation-proof.py        # 须退出码 0
python -B docs/research/verify-spec-vs-proof.py     # 须退出码 0
```

这两个脚本是引擎正确性的机器证据：前者证明"程序化几何生成置换表"在数学上可靠，后者把架构文档里的算法逐字实现后与已验证实现**逐张贴纸比对**，专门捕捉"某一面的颜色矩阵镜像"这类静默错误。说明见 `docs/research/2026-10-25-engine-verification-baseline-research.md`。

完整的端到端验证步骤（含 7 条浏览器冒烟断言与各自的当前状态）见 `docs/specs/execution/verification.md` §12。

## 目录导航

| 路径 | 内容 |
|---|---|
| `AGENTS.md` | Agent 入口与路由规则（含主题权威映射的强制约束） |
| `.project-conventions/ACCESS.md` | Worktree-first 协作策略 |
| `docs/specs/PRD.md` | **产品需求主文件 v2.0**。§1.2 的主题权威映射表是全项目防漂移的核心 |
| `docs/specs/prd/` | PRD 子章节 `01`~`11` + `CHANGELOG.md`。`11-appendix.md` 附录 C 是 **AC 编号唯一真源（冻结）** |
| `docs/specs/execution/` | 执行契约：`CONTRACT.md`（架构总纲）、`UIUX.md`（设计总纲）+ 10 个模块文件 |
| `docs/decisions/` | ADR-001~006 与逐次口径裁定 |
| `docs/reviews/` | 评审记录，附件在 `artifacts/` |
| `docs/research/` | 竞品分析、引擎验证基线说明、三个 Python 验证脚本 |
| `docs/reports/` | 实现现状报告（进度矩阵、缺陷与技术债登记） |
| `docs/migrations/` | 目录迁移记录 |
| `docs/archive/` | 被取代的历史文档（只归档不删除） |
| `design/` | 设计系统资产，**色值唯一源头** |
| `material/` | 用户提供的源素材（录屏、抽帧、工具 manifest） |
| `conversation/` | 决策与协作历史 |
| `memory/` | 项目连续性（`MEMORY.md` + 每日日志） |
| `src/ob-cube/` | 工程本体：`src/`（9 个分层目录）、`tests/`、配置文件 |

### 文档从哪里读起

| 你是谁 | 路径 |
|---|---|
| 产品 / 评审 | `docs/specs/PRD.md` → `prd/01-product-scope.md` → `prd/10-acceptance.md` → `prd/11-appendix.md` 附录 C |
| 前端实现 | `docs/specs/PRD.md` §1.2 找到自己模块的权威文件 → `execution/CONTRACT.md` → 对应 `execution/*.md` |
| QA 验收 | `prd/11-appendix.md` 附录 C（编号与交付状态）→ `prd/10-acceptance.md`（EARS 全文）→ `execution/ui-gate.md`（截图/真机分组） |
| Agent 开发者 | `prd/07-agent-api.md` → `execution/agent-api.md` |

### 源码分层（依赖方向，违反即退回）

```
ui/        表现层    → 依赖 engine/render/challenge 公共出口；不持有状态
agent/     契约层    → 依赖 engine+challenge；禁止依赖 ui/render/storage
render/    渲染层    → 只依赖 engine 类型 + shared
services/  应用服务  → 依赖 storage + puzzle/challenge
challenge/ 规则层    → 依赖 engine+puzzle；禁止任何浏览器 API
puzzle/    题目层    → 依赖 engine
engine/    引擎层    → 只依赖 shared；零 DOM、零浏览器 API
shared/    基础工具  → 不依赖任何其他目录
```

铁律：`engine/` 的 import 中不得出现 `three` / `document` / `window` / `localStorage` / `performance`。计时只允许出现在 `challenge/clock.ts` 一处。色值只允许出现在 `ui/tokens.css`，且 `render/palette.ts` 是全项目唯一允许调 `getPropertyValue` 的文件。

## 已知限制

**产品层面的诚实边界**（这些不是缺陷，是纯前端形态的固有约束，PRD 要求必须在 UI 上明说）：

- **蒙尘模式是"防误看"，不是"防逆向"。** 它能保证正常使用路径下开始前不泄露题面、API 不主动交出颜色；它不能阻止有动机、有 JS 能力的人通过 DevTools 读内存。因此蒙尘场景下的任何运行结果**都不构成"模型能力"的强证据**。
- **计时与成绩不可对外背书。** 纯前端计时无法防篡改，结果页恒显示"本机测量，未经服务端校验"。
- **难度分级是启发式估计，不是最短解距离。** 无求解器，`distance_is_estimated` 恒为 `true`。
- **题面分布不是状态空间上的均匀分布。** v1 只做随机操作打乱，不做均匀随机状态生成，因此不能宣称"标准化能力测试"。

**实现层面的当前缺口**（完整矩阵见 `docs/reports/2026-10-26-implementation-status-report.md`）：

- **D1 高危 bug**：`solved_pending` 未豁免超时判定，已还原未提交的运行会被覆盖为 `ended_timeout`（违反 AC-28/AC-75），无测试覆盖
- AC-16 的蒙尘 ΔE 探针无自动化断言；AC-53 的 2D 展开图降级未实现；AC-81 的层轮廓描边未接线
- F14 观察模式无配置入口（生产恒 `full`），`after_move` 无门控逻辑；F09b 独立回放页未实现；埋点体系零实现
- `autoSubmitOnSolved` / `stickerLabels` / `monoMode` 是死配置；`measureFrameBudget()` 无调用者
- 8 个 TS 文件超"单文件 ≤ 300 行"红线（`wiring/index.ts` 848 行最严重）；构建产物 719 KB 单 chunk 有体积警告
- 覆盖率门禁未纳入实际执行的命令，无覆盖率数据

**工程约束**：本项目**未初始化 Git**（未获授权建仓）。因此 worktree-first 策略要求的任务分支与 linked worktree 无法创建，代码改动需单独授权，且没有提交点可回退。

## 后续方向

按优先级：① 修 D1 + D2（需先授权建仓或允许无 worktree 改码）；② P1 首要项——观察模式配置入口 + `after_move` 门控、AC-16 探针自动化断言；③ 把覆盖率门禁纳入实际命令；④ AC-53 2D 降级、F09b 独立回放页、接线各死配置；⑤ 技术债——文件拆分与构建产物代码分割。

Out-of-Scope 的 10 项（后端账号、云端题库、自动难度分级、批量多步提交、移动端深度适配、求解器提示、多人房间、纯前端防作弊强制、排行榜、魔方类型扩展）各自带"为什么不做"与"何时考虑"，见 `docs/specs/prd/01-product-scope.md` §4。
