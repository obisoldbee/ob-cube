# 08 · DeepSeek 分支开发（2026-10-26）

## 用户请求

1. 给项目代码创建 Git，并开设 DeepSeek 分支。
2. 根据 PRD 内容全量推进开发。

## 执行前置

- 用户明确授权 `git init`（此前 AGENTS.md 记录「未初始化 Git、不得擅自建仓」）。
- 初始提交 `909aa73`，分支 `main` → `DeepSeek`。
- 根 `.gitignore` 排除 `node_modules/`、`dist/`、`coverage/`、`.ego/`、`.workbuddy/`、`.screenshots/`、`.project-conventions/runtime/`、`*.sqlite3`。
- 不新增 remote、不 push。

## 基线核验

- `npm run typecheck` 零错误，`npm test` 18 文件 / 232 用例全绿。
- 以 `docs/reports/2026-10-26-implementation-status-report.md` 的 D1–D10 与 P1 清单作为推进顺序。

## 交付摘要

按提交粒度推进：

1. **缺陷**：D1（`solved_pending` 超时豁免）、D2（`autoSubmitOnSolved=false`）、D6（删除无断言测试）。
2. **F14 观察模式**：配置模型 + 面板 + `?observe=` 入口；`after_move` 门控与 `E_OBSERVATION_REQUIRES_MOVE`。
3. **F17/F13/§7.2**：难度启发式估计、同题面中位耗时、四个派生计时字段。
4. **§10.4/§11**：2000 条事件截断 + 4MB 清理提示。
5. **F16**：`F2` 聚焦记法输入框。
6. **AC-16/AC-53/D4/D5**：ΔE 自动断言、2D 展开图降级、帧预算可见降级、层描边 hover。
7. **F09b**：独立回放控制条（播放/单步/进度/速度/三视角/版本确认）。
8. **§11.1 埋点**：本地环形缓冲 + 开关 + 主要事件。
9. **D10/D9**：覆盖率门禁、three vendor chunk 拆分。
10. **D3 部分**：单色高对比配色接线（3D + 2D）。

## 验证结果

- `npm run typecheck` 零错误。
- `npm test`：23 文件 / 274 用例全绿。
- `npm run coverage`：engine 行覆盖 96.55%（门禁 95%），challenge 86.88%（门禁 85%）。
- `npm run build`：通过；应用主包 161.51KB（gzip 50.16KB），three vendor 577.98KB。
- 浏览器实测：3D 渲染、配置面板、开始挑战、按钮/键盘/记法输入、`window.cubeAgent`、难度显示、F09b 回放全流程通过；控制台零错误。

## 未完成与边界

- `stickerLabels`（面中心字母）仍为 P2 未实现。
- `wiring/index.ts` 与 `challenge/session.ts` 仍超 300 行红线（D7），未拆分。
- `agent_think_ms` 无法从现有七值事件流派生。
- 详细矩阵见 `docs/reports/2026-10-26-deepseek-branch-progress.md`；契约增补见 `docs/specs/prd/CHANGELOG.md` v2.1-dev。
