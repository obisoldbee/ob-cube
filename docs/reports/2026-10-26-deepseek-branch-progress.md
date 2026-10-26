# DeepSeek 分支开发进度报告（2026-10-26）

| 字段 | 值 |
|---|---|
| 范围 | `src/ob-cube/` 对照 PRD v2.0 的 P0/P1 缺口推进 |
| 基线 | Git 初始提交 `909aa73`（`main`），开发分支 `DeepSeek` |
| 验证命令 | `npm run typecheck` / `npm test` / `npm run coverage` / `npm run build` 全通过 |
| 测试规模 | 23 文件 / 274 用例；覆盖率门禁 `engine/**` 行 ≥95%（实测 96.55%）、`challenge/**` 行 ≥85%（实测 86.88%） |
| 浏览器验证 | 3D 渲染、配置面板、开始挑战、键盘/按钮/记法输入、`window.cubeAgent`、难度显示、F09b 回放全流程均实测通过 |
| 用途 | 取代 `2026-10-26-implementation-status-report.md` §5/§6 中已被本次推进消除的条目；未消除项仍以原报告为准 |

---

## 1. 缺陷修复

| # | 项 | 结果 | 证据 |
|---|---|---|---|
| D1 | `solved_pending` 被超时覆盖 | **已修复**：`tick()` 对 `solved_pending` 提前返回 | `challenge/session.ts`；`tests/challenge/session.test.ts` 新增 2 例（超时豁免 + `E_CUBE_ALREADY_SOLVED`） |
| D2 | `autoSubmitOnSolved` 默认 `true` | **已修复**：默认改为 `false`，人机一致（AC-79） | `services/settings.ts` |
| D6 | `tests/_scratch.test.ts` 无断言 | **已删除** | — |

## 2. P0/P1 功能推进

| 编号 | 项 | 状态 | 关键实现 |
|---|---|---|---|
| F14 | 观察模式入口 + `after_move` 门控 | **已交付** | `ChallengeConfig.observationMode`、配置面板「观察模式」、URL `?observe=`；`observe()` 在 `after_move` 下按步数解锁，抛 `E_OBSERVATION_REQUIRES_MOVE`；`Progress.observation_allowed` 同步 |
| F16 | 记法输入框 | **已交付** | `F2` 聚焦、输入框提交，复用 `applyMoveNotation` 提交点；输入框内按键放行给控件 |
| F17 | 难度标签 | **已交付** | 新增 `puzzle/difficulty.ts`：`S + K + O + C`、入门/常规/高难度、五个正交标签、`distanceIsEstimated: true`；结果页与左栏显示 |
| F13 | 多轮同题面对比 | **已交付** | 结果页 `compareElapsedMs` = 同 `challenge_id` 历史中位耗时（排除当前 run） |
| F09b | 独立回放 | **已交付** | 回放控制条：播放/暂停、单步、进度条跳转、0.5/1/2/4×、三视角（上帝/观察者/校验）、AC-50 旧版引擎确认；2D 降级下同样可用 |
| §11.1 | 埋点 | **已交付（P1）** | `services/telemetry.ts`（内存队列 + 500 条环形缓冲 + 开关），接线 `page_view` / `challenge_config_submitted` / `challenge_started` / `first_move_made` / `move_made` / `view_rotated` / 暂停恢复 / 归并 / `run_again_clicked` / `replay_opened` / `api_error` / `storage_unavailable` |
| §7.2 | 派生计时指标 | **部分交付** | `wall_elapsed_ms` / `first_move_ms` / `solved_at_ms` / `submit_ms` 已进 `ChallengeResult`；`agent_think_ms` 因事件流不含观察事件无法派生 |
| §10.4 | 2000 条事件上限 | **已交付** | 超限时先丢 `view` 事件，`events_truncated: true`，最终指纹不受影响 |
| §11 | 4MB 清理提示 | **已交付** | `LocalStore.usageBytes()` + 保存后阈值提示 |

## 3. 渲染与验收

| 编号 | 项 | 状态 | 关键实现 |
|---|---|---|---|
| AC-16 | 蒙尘确定性探针 | **自动化断言已补** | `shared/color.ts`（Lab/ΔE76）+ `tests/render/ac16-probe.test.ts`：6 色 ΔE ≥20、遮蔽材质 unlit/`toneMapped=false`、L\* 阶梯核对 |
| AC-53 | WebGL 失败 2D 降级 | **已交付** | `ui/cube-net.ts` 六面展开图；WebGL 失败不再终止页面；观察模式裁剪与蒙尘遮蔽在 2D 路径同口径；回放同样可用 |
| AC-81 | 层轮廓描边 | **已接线** | `TurnMatrix` hover/focus 携带 `face + LayerSpec`，wiring 求 `axis/layerSet` 后 `outline.show(..., 0.3)` |
| D4 | 帧预算降级 | **已接线** | rAF 帧间隔 60 帧窗口 → `measureFrameBudget`，降级时显示「性能已降级 · p95 Xms」可见标记 |
| D3 | 死配置 | **部分** | `monoMode` 已接线（3D + 2D）；`stickerLabels`（面中心字母）仍为 P2 未实现 |

## 4. 工程与门禁

| 项 | 结果 |
|---|---|
| 覆盖率门禁（D10） | `vite.config.ts` 新增 `thresholds`；`npm run coverage` 低于阈值即失败 |
| 代码分割（D9） | `three` 拆为独立 vendor chunk：应用主包 736KB → 161.51KB（gzip 50.16KB），three 577.98KB（gzip 143.92KB） |
| 统一验证命令 | `npm run verify` = typecheck + coverage + build |
| 浏览器实测 | 3D 舞台正常渲染；配置/难度/记法输入/回放全流程通过；控制台零错误 |

## 5. 仍未完成（明确边界）

| 项 | 原因 / 说明 |
|---|---|
| D3 `stickerLabels` | 面中心字母需要 3D 投影标签或贴纸级文字，属 P2 可访问性增强，本次未做 |
| D7 文件规模拆分 | `wiring/index.ts`（>1100 行）与 `challenge/session.ts` 仍超 300 行红线；拆分风险高，未在本次一并处理 |
| `agent_think_ms` | 事件流只有 move/view/start/pause/resume/submit/end 七值，没有 observation 事件，无法按 PRD 定义派生「观察→操作」间隔 |
| `stickerLabels` 默认值 | 保持 `false`；旧 SPEC「默认开、不可关」未被 v2.0 PRD 收复，按现行 PRD 的 P2 定级处理 |

## 6. Git 提交序列（DeepSeek 分支）

| 提交 | 内容 |
|---|---|
| `909aa73` | 初始化仓库（PRD v2.0 基线） |
| `5a5c8db` | D1/D2/F14 |
| `a4d92eb` | F17/F13/§7.2 派生计时 |
| `6e6643e` | §10.4 事件上限 + 4MB 提示 |
| `bf46b1b` | F16 记法输入 |
| `5ddb183` | D4/D5/AC-53/AC-16 |
| `e36af0d` | F09b 回放 |
| `2df1c27` | §11.1 埋点 |
| `25c2edc` | D10/D9 |
| `df87cc4` | D3 `monoMode` |
