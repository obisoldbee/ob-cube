# Project Memory

Project-wide durable facts belong here after substantive work. Harness-private memory does not replace this file.

## ob-cube 魔方挑战台（2026-10-25 起）

纯前端「人机同题面还原评测」平台。工程目录 `src/ob-cube/`（Vite + TS + Three.js）。**未初始化 Git**（用户未授权建仓）——因此 worktree-first 策略下无法为代码改动开任务分支，改码需单独授权。

## 权威文档链（2026-10-26 v2.0 重构后）

**两桶结构**，`docs/specs/PRD.md` §1.2 的**主题权威映射表**是防漂移的核心：31 个主题各只有一个权威文件，**其他文件不得重述、只能链接**。

- **PRD 范畴**（What/Why）：`docs/specs/PRD.md`（主文件）+ `docs/specs/prd/01~11-*.md` + `CHANGELOG.md`
- **执行范畴**（How）：`docs/specs/execution/`，`CONTRACT.md`（架构总纲）+ `UIUX.md`（设计总纲）+ 10 个模块文件
- **优先级**：`prd/11-appendix.md` 附录C（AC 冻结索引，唯一真源）→ `prd/*` → `execution/CONTRACT.md` → `execution/UIUX.md` → `src/ob-cube/src/contracts.ts`（数据/错误码字面真源）
- **规则**：下层不得反向改写上层的产品口径；②③④⑤ 之间的事实冲突**不是「谁优先级高谁赢」，而是待修缺陷**，必须在 `docs/decisions/` 留裁定
- **`SPEC-v1.0.md` 层已废除**（归档）。它基于 PRD v1.3、用冻结前 AC 编号、还自称「冲突时以本文件为准」，是历史矛盾的最大单一来源。`ARCHITECTURE` 附录C 的平行 AC 权威声明同时废除
- v1.x 全系列归档在 `docs/archive/2026-10-26-docs-v1/`（PRD v1.10 / ARCHITECTURE v1.4 / UIUX v1.5 / SPEC v1.0 / DESIGN-GATE-A，**DESIGN-GATE-A 已作废**：它基于 v1.2 旧暂停语义与「8 方法」口径，按它验收会判反）

## 不可推翻的技术契约

- 状态模型 facelet（`Uint8Array(6N²)`）；置换由几何算法程序化生成，代码中零手写置换数组（唯一手写表是 `geometry.ts` 的 6 行几何基向量，ADR-002 允许）
- 渲染用 cubie mesh，但贴纸颜色由 facelet 状态逐面派生——渲染层不持有第二份状态
- 整体旋转只转相机，不进 state、不计步；`applyMove` 对 `x/y/z` 抛 `E_NOTATION_ORIENTATION_NOT_MOVABLE`
- 记法版本 **`ss-2`**（`contracts.ts` 里是字面量类型）：`canonicalNotation` 是唯一命名真源（就近命名、3 阶 M/E/S 族、**`Rw` 短形式**、区间 **`2-3R` 无 w**）；别名（`2Rw`/`3R`/`2-3Rw`/3 阶 `2X`）可解析但归一化后不输出；指纹 = FNV-1a 双通道（payload 去 `obl1:` 前缀）
- **失败一律抛 `CubeError{code,hint}`**，成功返回平铺无 `ok` 键（v2.0 裁定，三种形状曾并存）
- `applyMove` 返回 **13 字段**（不是 v1.10 写的 8）；`layer_set` 用**记法层号**（1 基，从规范化后的被命名面算起，`3R→2L'` 要用 `spec.normalized` 重解析；`L` 的裸外层是 `[1]` 不是 `[4]`）
- 状态机 11 态：`idle`/`ready`/`running`/`paused`/`solved_pending` + 6 个 `ended_*`。**`configuring`/`finished`/`review` 从未存在**（`review` 是 UI 投影）
- 观察模式枚举取代码口径：`full`/`three_faces`/`single_face`/`after_move`/`restricted`
- 归并是**输入整形不是计步规则**；暂停冻结计时且**暂停期间观察面板一并锁定**；**暂停仅人类可用**（AC-58）
- **只读 API（`getProgress`/`observe`）内部会 tick 结算超时**：翻转必须即调 `onMutate()` 同帧同步 UI，wiring 另有 `lastSyncedStatus` 兜底（AC-28；回归守护 `tests/agent/read-flip-sync.test.ts`）
- 验收基数：**AC-40 = 144**（轴口径 18/45/81）；`move_catalog` = 18/99/162（2 阶拒绝层前缀）。**两者永不互验**
- 终止判定顺序：**还原 → 步数耗尽 → 超时 → 放弃**（确定性事件优先于轮询事件）
- `auto_submit_on_solved` 默认 **`false`**，人机一致都需显式提交（AC-79）
- tab 组成（AC-80，追认实现）：2 阶 = 单层(18)+自由层(6)；3 阶 = 单层+中层(9)+宽转(18)；4 阶 = 单层+宽转2+宽转3+内层(10)+自由层(8)。**视角控件不是 tab**（在舞台区 HUD）。自由层的非连续组合由预览串 `—` 拦截

## 验证基线

- `docs/research/permutation-proof.py` 与 `verify-spec-vs-proof.py` 是引擎正确性的机器证据，**改动 `src/engine/` 后必须重跑**（退出码须为 0）。说明见 `docs/research/2026-10-25-engine-verification-baseline-research.md`
- 门禁：typecheck 0 错、**18 文件 / 232 测试全绿**、build 通过（单 chunk 719 KB，有体积警告）
- Windows 下用 `python`，**不是 `python3`**（后者触发 Microsoft Store 安装提示而不执行）
- 改遮蔽色或任一夜纸色前必须重跑 `_color-math.py`：`--cube-masked #2B323C` vs 6 色最小 ΔE = 63.85（阈值 20 的 3.2 倍），最危险的一对是「蓝调遮蔽色 vs 蓝贴纸」

## 已知未闭环（2026-10-26 复核）

- **D1 高危 bug**：`session.tick()` 未豁免 `solved_pending` → 已还原未提交会被超时覆盖为 `ended_timeout`，违反 AC-28/AC-75，**无测试覆盖**。修复需一行 guard + 一条测试，待授权改码
- **D2**：`DEFAULT_SETTINGS.autoSubmitOnSolved` 仍是 `true`，与 v2.0 裁定的 `false` 不符，且该字段全库无消费者
- AC-16 蒙尘 ΔE 探针**无自动化断言**（接口 `getProbePoints()` 已暴露，只有一次性人工采样）
- AC-53 的 2D 展开图降级**未实现**（WebGL 失败只给终止页）
- AC-81 层轮廓描边**未接线**（`LayerOutline` 已建，`shell.ts` 的 `onLayerHover` 是空实现、`show()` 无调用者）→ `verification.md` 断言 E 必然失败
- F14 观察模式**降为 P1**：`after_move` 无门控逻辑、无配置入口（生产恒 `full`）
- F09b 独立回放页**未实现**（现状是结果页 260ms 定时器重放）；AC-47/48/50 已降级 P1
- 埋点体系（`prd/09` §11.1）**零实现**，v2.0 整体降 P1
- `stickerLabels`/`monoMode` 死配置、`measureFrameBudget()` 无调用者、`tests/_scratch.test.ts` 是无断言遗留物
- 8 个 TS 文件超「≤300 行」红线（`wiring/index.ts` 848、`challenge/session.ts` 772 最严重）
- 覆盖率门禁未纳入实际命令，无覆盖率数据

## 记录索引

- 迁移全过程：`docs/migrations/2026-10-26-directory-migration.md`
- v2.0 全部裁定（4 条产品定级 + 27 条技术口径 + 8 项缺陷）：`docs/decisions/2026-10-26-prd-v2-rulings-decision.md`
- 开发进度矩阵：`docs/reports/2026-10-26-implementation-status-report.md`
- 协作过程：`conversation/07-20261026-docs-v2-migration.md`
