# 实现现状报告 — ob-cube（2026-10-26）

| 字段 | 值 |
|---|---|
| 报告日期 | 2026-10-26 |
| 范围 | `src/ob-cube/` 全量代码对照 `docs/specs/PRD.md` v2.0 与其子章节 |
| 方法 | 只读代码审查 + 实际运行验证命令；两个独立调研（开发进度矩阵、四文档矛盾全清单）交叉核对 |
| 用途 | PRD v2.0 §4「交付基线」与 `prd/11-appendix.md` 附录 C-bis「交付状态覆盖表」的证据来源 |
| 关联 | `docs/decisions/2026-10-26-prd-v2-rulings-decision.md`（裁定）、`docs/specs/execution/verification.md` §12.1（验证命令） |

> 本文件是**状态报告**，不是需求文档。它记录"代码现在做到哪一步"，会随实现推进而过期；需求口径一律以 `docs/specs/prd/` 为准。
>
> **2026-10-26 后续更新**：D1 / D2 / D6 已修复，F14 / F16 / F17 / F13 / F09b / §11.1 等 P1 项已推进；最新状态以 [`2026-10-26-deepseek-branch-progress.md`](2026-10-26-deepseek-branch-progress.md) 为准。本文件保留为 v2.0 定稿时的历史快照。

---

## 1. 验证命令结果

| 命令 | 结果 |
|---|---|
| `npm run typecheck`（`tsc --noEmit`） | **零错误** |
| `npm test`（`vitest run`） | **18 个测试文件 / 232 用例全绿**。分布：engine 5、challenge 2、agent 1、render 1、ui 8、`_scratch` 1。耗时 3.08s |
| `npm run build`（`tsc --noEmit && vite build`） | **通过**。`dist/assets/index-*.js` = **719.15 KB**（gzip 188.23 KB），CSS 39.95 KB。**1 条警告**：chunk > 500KB 建议代码分割 |
| `npm run coverage` | **未纳入门禁流程**。脚本存在但不在任何验证步骤里，当前无覆盖率数据；`execution/verification.md` §11.1 要求的 `engine/ >= 95%`、`challenge/ >= 85%` 无法核对 |
| 引擎算法基线（`docs/research/permutation-proof.py`、`verify-spec-vs-proof.py`） | 迁移前基线为退出码 0。**本次未重跑**（未改动引擎代码） |

> `tests/_scratch.test.ts` 是**无断言的遗留物**（只往 stdout 打印 seed 与指纹），被计入上面的"18 个测试文件"。删除后为 17 文件 / 232 用例（它本身不含用例）。

## 2. 模块实现矩阵

| 模块 | 职责 | 状态 | 证据 | 备注 |
|---|---|---|---|---|
| `engine/` | facelet 状态 / 置换 / 记法 / 还原判定 | **已实现** | `state.ts:14-19`、`permutation.ts`、`notation.ts:72`、`solved.ts:84-101` | 测试覆盖 T-01~T-16 级 |
| `puzzle/` | 题面生成 / 复现 / 预设题库 | **已实现** | `puzzle.ts:104-157`、`scramble.ts:48-70`、`presets.ts:19-26` | F15 题库提前落地（6 条，2/3/4 阶各 2） |
| `challenge/` | 状态机 / 计时 / 观察 / 事件流 | **已实现，含 1 个高危 bug** | `session.ts:303-309` | `tick()` 缺 `solved_pending` 超时豁免 → 缺陷 **D1** |
| `agent/` | `window.cubeAgent` 九方法 | **已实现** | `agent/index.ts:28-108` | `Object.freeze`、`op_id` 幂等、60/帧限流、read-flip 同步均有专测 |
| `render/` | three 场景 / 动画 / 描边 | **主体实现** | `scene.ts:31-107`、`cube-view.ts:107-123` | `LayerOutline` 已建但 `show()` 无调用者（D5）；`measureFrameBudget` 导出未接线（D4）；**无 2D 降级路径** |
| `services/` | storage / settings / history | **已实现** | `storage.ts:71-83`、`history.ts:99-115` | 命名空间 `ob-cube:v1:*`、`MAX_RECORDS = 50` |
| `ui/` | shell / panels / 键盘 / 转动矩阵 | **已实现** | `shell.ts`(507行)、`keyboard.ts:25-26`、`turn-matrix-data.ts:28-46` | 自由层 tab 已由 v2.0 追认（AC-80） |
| `wiring/` | 装配与投影 | **已实现** | `wiring/index.ts:101-848` | 回放为 260ms `setInterval`（`543-576`）；单文件 848 行，超红线最多 |
| `contracts.ts` | 跨组冻结契约 | **已实现** | `contracts.ts:263-295` | `ERROR_CODES` 30 码，**无 `E_INVALID_STATE`** |
| `shared/` | emitter / fnv1a / result / assert | **已实现** | `shared/*` | — |

## 3. 功能点覆盖表

| 编号 | v2.0 定级 | 代码实况 | 判定 | 证据 |
|---|---|---|---|---|
| F01 3D + 视角 | P0 | 3D / 拖拽 / 步进 / `Home` / 6 面视全有；**无 2D 展开图降级**，WebGL 失败仅给终止提示页 | **部分** | `camera-rig.ts:49`、`stage.ts:237-247` |
| F02 引擎 | P0 | 完整 | **已交付** | 见 §2 |
| F03 键盘 + 按钮 | P0 | 完整：300ms 归并、前缀 3s 超时、`event.repeat` 忽略、`Ctrl`/`Cmd` 不拦截、`W`=U `A`=L `S`=F `D`=R `X`=D `Q`=B | **已交付** | `keyboard.ts:25-26,168-169`、`keymap.ts:5` |
| F04 打乱 + seed 复现 | P0 | mulberry32 + fnv1a、no-same-axis 过滤、重放 + 指纹校验、`E_REPRODUCTION_MISMATCH` | **已交付** | `puzzle.ts:146-157` |
| F05 蒙尘门控 | P0 | API 门控 + seed/scramble 在 `ready` 隐藏 + 视觉遮蔽 + 诚实文案齐；**ΔE 探针无自动化断言** | **部分** | `agent/index.ts:33-40`、`stage.ts:33` |
| F06 计时 + HTM 计步 | P0 | 真暂停、`clock.ts` 唯一计时点、10Hz 面板刷新 | **已交付** | `clock.ts:11-13`、`wiring:757-763` |
| F07 还原判定 | P0 | 单色 + 双射 + 手性 `det` 齐；镜像配色仅内部 `reason='invalid-scheme'`，**无对外错误码** | **部分** | `solved.ts:70-101` |
| F08 `cubeAgent` API | P0 | 九方法穷举、`freeze`、限流 60/帧 | **已交付** | `agent/index.ts` |
| F09a 结果页原地重放 | P0 | 260ms 定时器驱动，从已还原态重放、每步用回放态上色、重置同时复位相机 | **已交付** | `wiring:543-576` |
| F09b 独立回放页 | P1 | 无进度条 / 调速 / 单步 / 三视角 / 版本提示 | **未实现** | — |
| F10 结果展示 | P0 | 五区块 + 诚实标注 + 三口径（HTM / HTM-layer / QTM 同源投影） | **已交付** | `result-panel.ts:280-284`、`wiring:322-326` |
| F11 localStorage 历史 | P0 | 结束即存、损坏记录照实显示、50 条上限 | **已交付** | `wiring:332-343`、`history.ts:15` |
| F12 同题面重跑 | P1 | 同题重跑 + 再挑战一次均已实现 | **已交付**（超出定级） | `wiring:577-599` |
| F13 多轮对比表 | P1 | `compareElapsedMs` 恒 `null` | **未实现** | `wiring:318` |
| F14 观察模式细分 | **P1**（v2.0 降级） | session 支持 `three_faces` / `single_face` / `restricted`（预算 24）；**`after_move` 无门控逻辑**；**无 UI / URL 配置入口，生产恒 `full`** | **部分** | `session.ts:337-351`；`wiring:117-123` 未传 `observationMode` |
| F15 固定题库 | P1 | 6 条预设（2/3/4 阶各 2） | **已交付** | `presets.ts` |
| F16 记法输入框 | P1 | 无（`F2` 键未注册） | **未实现** | — |
| F17 难度标签体系 | P1 | 记录字段 `difficulty` 已存在，UI `difficultyLabel` 恒 `null` | **未实现** | `wiring:235-236` |
| F18 真暂停 | P0 | 完整：冻结计时 + 输入屏蔽 + 画面遮罩 + 观察面板锁定 + 仅人类可用 + `pause_count`/`paused_total_ms` 进结果 | **已交付** | `session.ts:263-279`、`wiring:180-189` |
| F19–F24 | P2 | 未做 | 符合 Out-of-Scope | — |
| §11.1 埋点体系 | **P1**（v2.0 降级） | **零实现**：全库无 `page_view` / `move_made` 等任何埋点代码，无内存队列，无落盘 | **未实现** | — |

## 4. 核心不变量核查（全部成立）

| # | 不变量 | 结论 | 证据 |
|---|---|---|---|
| 1 | 状态模型 facelet `Uint8Array(6N²)`，`slot = faceIndex·N² + row·N + col` | **成立** | `state.ts:2-17` |
| 2 | 置换由几何算法程序化生成，代码中零手写置换数组 | **成立** | `permutation.ts` 全程序化；唯一手写表是 `FACE_GEOMETRY` 的 6 行几何基向量（`geometry.ts:38-45`），这正是 ADR-002 允许的那一张 |
| 3 | 渲染层不持有第二份状态 | **成立** | `cube-view.ts:107-123` 只持纯几何 lattice / orientation，颜色每次由 `stateView` 经 resolver 派生 |
| 4 | 整体旋转只转相机、不进 state、不计步 | **成立** | `session.ts:469-477` 对 rotation 抛 `E_NOTATION_ORIENTATION_NOT_MOVABLE`；`state.ts:60` invariant 拒入 state；`session.ts:196` `moveCount` 只数 `type === 'move'` |
| 5 | 记法版本 `ss-2`，`canonicalNotation` 是唯一命名真源 | **成立** | `notation.ts:72` → `parseMove().normalized` 与 `describeMove` 同源（`notation-normalize.ts:65`）；UI 侧 `move-preview.ts:17` 直接调引擎，不自行拼接 |
| 6 | 暂停仅人类可用 + 暂停期间观察面板锁定 + 画面遮罩 | **成立** | agent 方法白名单无 `pause`/`resume`；`wiring:466-470` 双保险门控；`wiring:261-263` 观察面板锁定；`wiring:184-187` 遮罩 |
| 7 | 只读 API 内部 tick 结算超时，翻转即调 `onMutate()` 同帧同步 | **成立** | `agent/index.ts:44-51,79-85`；专测 `tests/agent/read-flip-sync.test.ts`（5 用例） |
| 8 | AC-40 = 144（轴口径 18/45/81） | **成立** | `notation.test.ts:248-249` 穷举断言 |
| 9 | `move_catalog` = 18 / 99 / 162 | **成立** | `catalog.ts:121` + `catalog` 测试 `186-188` |
| 10 | `describeMove` ↔ `parse` 往返恒等（AC-71，144 组穷举） | **成立** | `tests/engine/notation.test.ts` |

## 5. 缺陷与技术债登记

| # | 项 | 违反 | 严重度 | 修复量 |
|---|---|---|---|---|
| **D1** | `session.tick()`（`session.ts:303-309`）只豁免 `paused` / `ended_*`，**未豁免 `solved_pending`** → 已还原未提交的运行会被超时覆盖为 `ended_timeout`。**无测试覆盖此路径** | AC-28、AC-75 | **高（本次 review 发现的唯一功能性 bug）** | 一行 guard + 一条测试 |
| D2 | `DEFAULT_SETTINGS.autoSubmitOnSolved` 仍是 `true`（`settings.ts:37,57`），与 v2.0 裁定的默认 `false` 不符；且该字段**全库无消费者**，实测人类还原后同样停在 `solved_pending` 需手点提交（`session-panel.ts:59`） | AC-79 | 高 | 改默认值或删除字段 |
| D3 | `stickerLabels` / `monoMode` 死配置，`setMono()` 无调用者。原 SPEC §9 声称"面中心字母默认开、不可关"**完全未实现** | 色盲无障碍三级 | 中 | 接线或删除 |
| D4 | `measureFrameBudget()`（`scene.ts:121`）导出但无调用者；无 `renderer.info` draw call 采样；`execution/render.md` §8.5 的"可见的降级标记"未实现 | 帧预算降级 | 中 | 接线 |
| D5 | `LayerOutline`（`layer-outline.ts`）已实现并入场景（`scene.ts:48-51`，预留 1 draw call），但 `shell.ts:183` 的 `onLayerHover` 是 `() => undefined`、`show()` 全库无调用者 → 描边从不出现 | AC-81、`verification.md` §12 断言 E | 中 | 接线 |
| D6 | `tests/_scratch.test.ts` 无断言，只打印 seed / 指纹到 stdout | 测试卫生 | 低 | 删除 |
| D7 | 8 个 TS 文件 + 3 个 CSS 文件超"单文件 ≤ 300 行"红线（详见 `execution/CONTRACT.md` 的违约登记表） | `execution/CONTRACT.md` §9.2 | 中（技术债） | 拆分，`wiring/index.ts`(848) 与 `challenge/session.ts`(772) 优先 |
| D8 | TypeScript 从 `~7.0.2` 回退到 `~5.9.3` 时，原 SPEC §4 要求的 ADR 从未写 | 活规格纪律 | 低 | **本次已补 `docs/decisions/ADR-006.md`** |
| D9 | 构建产物 719.15 KB 单 chunk，Vite 报 >500KB 警告 | `prd/09-contract-nfr.md` §11 性能 | 低 | 代码分割（P1） |
| D10 | 覆盖率门禁未纳入实际执行的命令，无覆盖率数据 | `execution/verification.md` §11.1 | 中 | 把 `npm run coverage` 加进门禁并定阈值 |

## 6. 文档-代码不一致清单（v2.0 已裁定的部分不再重复）

以下项已在 `docs/decisions/2026-10-26-prd-v2-rulings-decision.md` §5 逐条裁定并写进 v2.0 文档，此处只列**尚未消除、需要改代码**的部分：

| # | 项 | 现状 | 需要的动作 |
|---|---|---|---|
| 1 | `solved_pending` 超时豁免 | 未实现 | 改代码（D1） |
| 2 | `autoSubmitOnSolved` 默认值 | `true`，应为 `false` | 改代码（D2） |
| 3 | `E_INVALID_STATE` 对外错误码 | 不存在 | 补码（P1），或维持 `mismatch.reason` 判据 |
| 4 | 观察模式配置入口 + `after_move` 门控 | 无 | 补实现（P1 首要项） |
| 5 | AC-16 ΔE 探针自动化断言 | 无 | 补测试（P1） |
| 6 | AC-53 2D 展开图降级 | 无 | 补实现（P1） |
| 7 | §7.2 五项计时指标（`wall_elapsed_ms` / `agent_think_ms` / `first_move_ms` / `solved_at_ms` / `submit_ms`） | 未落盘，但**全部可由已落盘的事件流派生** | 在 `ChallengeResult` 上补派生 getter，不需改记录格式、不需数据迁移（P1） |
| 8 | §11 "4MB 触发清理最旧记录提示" | 未实现，只有事后抛 `E_STORAGE_FULL` | 补实现（P1） |
| 9 | 2000 条事件上限 + 截断标记 + `view` 事件优先丢弃 | 未验证（无对应测试） | 补测试 |
| 10 | seed 长度双标：`settings.ts:61` 校验 1–32，`engine/seed.ts:11` 接受 1–128 | **有意分层，不是矛盾**（边界校验在 settings/URL 层，引擎宽松） | 无需动作，已在 v2.0 T12 记录 |

## 7. 建议的处理顺序

1. **D1**（高危 bug，一行 guard + 一条测试）→ 需先授权 `git init` 或明确允许无 worktree 直接改码
2. **D2**（改默认值，与 v2.0 裁定对齐）→ 同上
3. **P1 首要项**：观察模式配置入口 + `after_move` 门控（F14）；AC-16 探针自动化断言
4. **D10**：把覆盖率门禁纳入实际命令，让 `engine/ >= 95%`、`challenge/ >= 85%` 变成可核对的事实
5. **P1**：AC-53 2D 降级、F09b 独立回放页、接线 D3/D4/D5、删除 D6
6. **技术债**：D7 文件拆分（`wiring/index.ts`、`challenge/session.ts` 优先）、D9 代码分割
