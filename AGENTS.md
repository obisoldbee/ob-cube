# AGENTS.md

> Portable Agent entry point for this Project Root.

## Project

workbuddy1024 — Code Project Root。当前唯一工程是 **ob-cube**（`src/ob-cube/`）：纯前端「人机同题面还原评测」魔方挑战台，2/3/4 阶，Vite + TypeScript + Three.js，无后端、无账号，localStorage 持久化。人类与 AI Agent 走同一个引擎入口、同一份计步规则、同一条回放记录。

<!-- project-conventions:access:start -->
## Worktree-first collaboration

- Coordination policy: `worktree-first`. Read `.project-conventions/ACCESS.md` for the complete workflow.
- Read-only work needs no admission or runtime writes. Use a fixed revision or recheck changed inputs.
- Code changes use one task-specific branch and linked Git worktree per concurrent writer. Bind the actual repository, base commit, unique branch, and absent destination first. Existing dirty work stays in place; a new worktree starts from committed content only.
- Reports use distinct exact output files or task-owned directories, with no-clobber creation. Different files in one folder may coexist. For existing shared files, use separate worktrees or one agreed integrator; do not overwrite concurrent edits.
- Merge validated commits through one integrator after checking the destination and preserving unrelated work. Shared build outputs, databases and ports require their own isolation. A different chat is not an isolated filesystem.
- Do not run `enter/check/finish/recover` or request claim cleanup for ordinary work. Legacy SQLite claims are historical metadata, not admission authority under this policy. Do not delete the old database or infer that old processes have stopped.
- Record meaningful work in a unique task record; the integrator updates canonical logs and indexes. Do not hold a project-wide claim for records or number allocation.
- A copied directory is not automatically a linked worktree. Verify its Git root/common directory before using Git; preserve existing content and copied runtime metadata.

<!-- project-conventions:access:end -->

## Directory Index

| Path | Purpose |
|---|---|
| `README.md` | Human overview：技术栈、快速开始、目录导航 |
| `docs/specs/PRD.md` | **产品需求主文件（v2.0）**。§1.2 的「主题权威映射表」是全项目防漂移的核心：31 个主题各只有一个权威文件，其他文件不得重述、只能链接 |
| `docs/specs/prd/` | PRD 范畴（What/Why）：`01`~`11` 子章节 + `CHANGELOG.md`。`11-appendix.md` 附录 C 是 **AC 编号的唯一真源（冻结）** |
| `docs/specs/execution/` | 执行范畴（How）：`CONTRACT.md`（架构总纲）、`UIUX.md`（设计总纲）+ `engine`/`notation`/`puzzle`/`agent-api`/`render`/`persistence`/`verification`/`ui-visual`/`ui-shell`/`ui-gate` |
| `docs/plans/` | 实现计划（当前为空，按需填充） |
| `docs/reviews/` | 评审记录，命名 `YYYY-MM-DD-<reviewer>-<scope>-HHMMSS.md`；附件在 `docs/reviews/artifacts/` |
| `docs/decisions/` | ADR-001~006 + 逐次口径裁定记录 |
| `docs/research/` | 竞品分析 + 引擎验证基线说明 + 三个 Python 验证脚本（改引擎后必须重跑） |
| `docs/reports/` | 实现现状报告（开发进度矩阵、缺陷与技术债登记） |
| `docs/migrations/` | 目录迁移记录（前后树、文件映射、引用同步、回滚边界） |
| `docs/archive/` | 被取代的历史文档，**只归档不删除**。`2026-10-26-docs-v1/` = PRD v1.10 / ARCHITECTURE v1.4 / UIUX v1.5 / SPEC v1.0 / DESIGN-GATE-A（已作废） |
| `design/` | 设计系统资产：`design-tokens.css` / `.json`，**色值唯一源头**（代码 `src/ob-cube/src/ui/tokens.css` 的输入） |
| `material/` | 用户提供的源素材（录屏、抽帧、工具 manifest）。**原样保留，不改写内部 manifest**——那是过往运行的证据 |
| `conversation/` | 决策与协作历史，`NN-kebab-topic.md` |
| `memory/` | 项目连续性：`MEMORY.md`（长期事实）+ `YYYY-MM-DD.md`（每日日志） |
| `src/` | 源码入口。`src/ob-cube/` 是唯一工程；`dist/` 与 `node_modules/` 按规范留在 `src/` 下 |
| `.project-conventions/` | Worktree-first collaboration entry；legacy runtime 保持本地且被忽略 |

## Source Mapping

| Field | Value |
|---|---|
| Project Root | `.` |
| Repository Root | **not configured — 本项目未初始化 Git**（用户未授权建仓） |
| Clone URL / remote | local only |
| Default ref | unknown |
| Managed scope | `src/ob-cube/`（工程目录，非 Git 管理范围） |

> **无 Git 的直接后果**：worktree-first 策略要求的「任务专属分支 + linked worktree」**无法执行**。代码改动需用户单独授权，且没有提交点可回退。不得擅自 `git init`。


## Routing Rules

- Use Project-Root-relative paths in active files; never copy a source machine's absolute path into current routing.
- Preserve existing user material. Runnable implementation goes to `src/`; design-system assets to `design/`; user-provided source material stays in `material/` (never rewrite its internal manifests — they are evidence of a past run).
- **Documents are split into two buckets, and every topic has exactly one authoritative file.** Before writing any specification content, look it up in `docs/specs/PRD.md` §1.2 (主题权威映射表) and write it there — or link to it. **Do not restate a topic that another file owns**; restatement is what produced the v1.x four-way drift (a 251-line derivative doc that contradicted the PRD it was derived from, and declared itself authoritative on conflict).
  - Product requirements (What / Why) → `docs/specs/prd/`
  - Implementation & design contracts (How) → `docs/specs/execution/`
  - Research → `docs/research/`; status/progress reports → `docs/reports/`; rulings → `docs/decisions/`; restructuring → `docs/migrations/`
- AC numbers are frozen. `docs/specs/prd/11-appendix.md` 附录 C is the **only** authority. Never create a parallel AC mapping table in another document, and never invent an alias. Delivery status lives in the separate 附录 C-bis table, not in the frozen index.
- Field names and error codes have a literal source of truth: `src/ob-cube/src/contracts.ts` (frozen file). When a document disagrees with it, that is a **defect to be ruled on**, not a matter of precedence — record the ruling in `docs/decisions/` and fix one side.
- Changing anything under `src/ob-cube/src/engine/` requires re-running `python -B docs/research/permutation-proof.py` and `verify-spec-vs-proof.py` (both must exit 0). Use `python`, not `python3`, on this machine.
- Harness-owned hidden directories are opaque and never replace project `conversation/` or `memory/`.
- Read the instructions and materials needed for the selected task; reuse complete current readings. Run checks for the changed contract or behavior and preserve required acceptance gates, without unrelated suites or repeated passing checks.
- Record significant decisions and substantive work that adds useful continuity; update indexes only when their represented facts change. Response-only tasks create no project records. Use separate task records and one integrator for canonical logs and sequence numbers.
- Complete the authorized deliverable, inspect it, fix failures caused by the change, and rerun affected checks without per-step approval. Report any unresolved blocker and the actual completion boundary.
- Do not initialize Git, move material, or publish without task authorization. A temporary task-specific worktree can support authorized code changes; choose its exact repository, base, branch and path before creating it. Initialization itself creates no worktree. **This project has no Git repository, so no worktree can be created — code changes need explicit per-task authorization and have no commit point to roll back to.**
