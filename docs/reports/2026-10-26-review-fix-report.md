# 评审修复轮实现报告（2026-10-26）

> 输入：`docs/reviews/ob-cube-code-prd-review-full.md`（代码基线 `c6236e2`，与仓库 HEAD 一致）
> 范围：报告第一部分的 7 个高严重度缺陷 + 6 个接口/统计问题 + 第三部分 13 条回归用例
> 裁定：`docs/decisions/2026-10-26-review-fixes-ruling.md`（R-1 ~ R-6）
> 未决：`docs/decisions/OPEN-DECISIONS.md`（8 项，需产品裁定，本轮未单方面落地）

---

## 一、修复状态总览

报告第一部分 8 个条目全部修复，每条都有可执行断言。

| 报告条目 | 结论 | 关键改动 | 回归用例 |
|---|---|---|---|
| 1. 挑战开始后返回 seed | 已修 | `getChallengeInfo()` 在 `!isEnded` 全程隐藏 `seed` / `scramble` / `facelet_string` / `state_fingerprint`；缩略序列只在 `getChallengeResult()` 出现 | R01 |
| 2. API 操作不同步 3D 画面 | 已修 | 装配层新增 `syncVisual()`：API 变更后同帧对齐贴纸、授权面遮罩与相机；相机只在会话朝向真的变了时才跟随 | R02 |
| 3. 双击归并在提交之后 | 已修 | 归并前移到 `applyIntent → commitMerged`：回到转前局面原子执行 180°，计步与终止判定只做一次；键盘 90° 撞上限时把判负推迟一个窗口 | R03 / R04 |
| 4. 受限观察只限制了 `observe()` | 已修 | 唯一交付口 `deliverObservation()`；面板在 restricted 档只读已交付快照；3D 画面按 `visible_faces` 加遮罩 | R05 |
| 5. 新观察无新编号、依据未写入事件 | 已修 | 每次交付递增 `obsSeq`；`RunEvent.based_on_observation_id` 落库 | R06 |
| 6. `solved_pending` 刷新丢结果 | 已修 | `interrupt()` 与 `beforeunload` 接受 `solved_pending`，结算为 `ended_solved` 且 `submit_ms = null` | R08 |
| 7. 历史缺打乱序列、回放用结束视角 | 已修 | `ChallengeResult` 带 `scramble` / `scramble_fingerprint` / `gen_algorithm_version`；view 事件带 `view_after`，回放按步恢复视野 | R10 / R11 |
| 8. 契约漂移 / runId / 幂等 / 统计 | 已修 | 13 字段；runId 校验；幂等前置到终态守卫之前；按 run 清零统计；成功中位数只算同规则成功运行 | R07 / R09 / R12 |

报告第三部分第 13 条（事件超限）同样处理：非 view 事件本身超限时保留尾部（`end` 不丢），并落 `events_dropped`。

---

## 二、验证结果

| 检查 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npx tsc --noEmit` | 通过（0 错误） |
| 单元/集成测试 | `npx vitest run` | **25 个文件 / 292 条全部通过**（基线 274 + 新增 18） |
| 生产构建 | `npx vite build` | 通过（主包 166 kB / three 578 kB） |
| 浏览器运行期异常 | playwright 打开 `?size=3&autostart=1` 后连续调用 API | 0 个 pageerror |

### 浏览器实测（真实 Chromium，非 jsdom）

| 断言 | 观测值 |
|---|---|
| 运行中 `getChallengeInfo().seed` | `null` |
| API `applyMove('R')` 后画布像素 | 变化（`pixelChangedAfterMove: true`）——修复前为 `false` |
| API `rotateView({up:'U',front:'R'})` 后画布像素 | 变化（`pixelChangedAfterRotate: true`） |
| 返回的 `next_observation.observation_id` | `run-…:o1`（按交付递增） |
| `?observe=restricted` 连续 25 次 `observe()` | 24 次成功，第 25 次 `E_OBSERVATION_BUDGET_EXHAUSTED` |
| 预算用尽后 `applyMove` | 执行成功（`moveCount: 1`），`next_observation: null` |

---

## 三、未验证边界（如实声明）

1. **R02 只验到「画面确实重绘」，未做像素级对齐**。报告建议的「五源对齐」需要把设计稿与渲染结果做像素比对，本轮没有设计稿基线，只断言了「API 转动 → 画布像素变化」和「观察数据 == 内部状态」。像素级一致性仍属设计验收项。
2. **观察者回放的完整交互未走浏览器端**。`viewAtStep` 有单测（R10 逐步比对三个授权面），但回放面板的播放/拖动/三视角组合未在真实浏览器里端到端跑一遍。
3. **`solved_pending` 刷新只做单元级验证**（R08）。浏览器端的 `beforeunload` → `localStorage` 落盘路径依赖真实刷新动作，本轮未实测（需要先解出一道题）。
4. **事件截断的分块持久化未做**。本轮只修正了「丢尾导致结局丢失」，容量上限仍会丢中间事件，已登记 OD-07。

---

## 四、对 PRD 的影响

- **AC 编号与条文未改动**。本轮只增加契约字段与修正行为。
- **唯一对外语义变更**：`MoveResult.next_observation` 允许 `null`（理由见 R-2）。已在 `CHANGELOG.md` v2.2-dev 条目 84 记录。
- **文档更正**（代码为准，修正已过期的「未实现」陈述）：
  - `prd/10-acceptance.md` AC-75：D1「超时不得覆盖 solved」已实现且有测试
  - `prd/11-appendix.md`：AC-19/20/65 交付状态、AC-28、AC-75 三行
  - `prd/04-scoring-judging.md`：`solved_pending` 超时豁免
  - `prd/05-dust-observation.md`：C6 观察模式的交付现状与三条绕过路径
  - `prd/09-contract-nfr.md`：AC-53 的 2D 降级已实现

---

## 五、下一步（需产品裁定）

报告第二部分 8 条全部登记为 `OPEN`，**没有一条在本轮被单方面实现**——它们会改变评测口径或难度分层，属于产品决策，不是缺陷修复。

最影响后续开发的两条：

1. **OD-05 双击归并是否留在正式评测**。本轮已把它做对（归并前移 + 原子化），但它仍是缺陷高发区。若正式评测只认显式 180° 入口，可以删掉整条时序依赖。
2. **OD-06 主成绩用 `solved_at_ms` 还是 `elapsed_ms`**。当前结果页主指标仍是 `elapsed_ms`（含等待提交），`solved_at_ms` 已在记录里。改主指标只动展示层，但会改变历史对比的可读性，建议一次性定。

其余六项（难度公式、最短解下限、题集口径、`control_mode`、实验记录存储、契约正文清理）在 `OPEN-DECISIONS.md` 中给了倾向与解除条件。

---

## 六、改动的文件

```
src/ob-cube/src/contracts.ts            契约字段（+4 字段、+2 类型放宽、+1 常量）
src/ob-cube/src/challenge/session.ts    归并前移、观察交付口、刷新结算、截断策略、viewAtStep
src/ob-cube/src/challenge/index.ts      导出 viewAtStep
src/ob-cube/src/agent/index.ts          题面门控、13 字段、runId 校验
src/ob-cube/src/ui/keyboard.ts          双击保留层集合
src/ob-cube/src/ui/view-model.ts        ObservationView.lockReason 增 'no-observation'
src/ob-cube/src/ui/panels/observation-panel.ts  锁定文案
src/ob-cube/src/services/history.ts     medianSolvedElapsed
src/ob-cube/src/services/index.ts       导出统计函数
src/ob-cube/src/wiring/index.ts         画面/相机同步、授权面遮罩、刷新保存、统计口径、回放视野
src/ob-cube/tests/regression/           新增 R01-R13 共 18 条
src/ob-cube/tests/agent/read-flip-sync.test.ts  改为断言 13 字段
docs/decisions/2026-10-26-review-fixes-ruling.md
docs/decisions/OPEN-DECISIONS.md
docs/reports/2026-10-26-review-fix-report.md
docs/specs/prd/CHANGELOG.md             v2.2-dev（条目 83-100）
docs/specs/prd/10-acceptance.md         交付状态更正
docs/specs/prd/11-appendix.md           交付状态更正
docs/specs/prd/04-scoring-judging.md    交付状态更正
docs/specs/prd/05-dust-observation.md   交付状态更正
docs/specs/prd/09-contract-nfr.md       交付状态更正
```

引擎目录（`src/ob-cube/src/engine/`）**未改动**，因此不需要重跑 `permutation-proof.py` 与 `verify-spec-vs-proof.py`。
