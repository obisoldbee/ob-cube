# R2 复审修复报告（2026-10-27）

> 输入：`docs/reviews/ob-cube-code-prd-review-r2.md` + `ob-cube-review-r2-evidence.zip`
> 基线：`2e03f8a`（`DeepSeek`）/ 修复提交 `02ace80` 之上的第二轮
> 裁定：`docs/decisions/2026-10-27-review-r2-rulings.md`（R-7 ~ R-9，Q01 转 OD-09）
> 变更记录：`docs/specs/prd/CHANGELOG.md` v2.3-dev（条目 101–120）

---

## 一、核查结论

R2 的 8 项实现问题**全部复现成立**，证据包里的 8 个隔离探针（P01–P08）与源码一致，没有误报。
另核对第 5 节浏览器记录的 8 条：4 条是源码可确认的真实缺陷（重复按钮、toast 无播报、计时器无标签、性能文案夸大），4 条属于条件性观测（键位图遮挡、5173 自动刷新、题库默认二阶、小视口滚动），本轮不当作缺陷处理。

| R2 条目 | 核实方式 | 结论 |
|---|---|---|
| R2-01 人类换视角遮罩不更新 | 读 `applyView` / `viewStep` / `guard` 调用链 | 成立：只改会话与相机，`setReveal` 未调用 |
| R2-02 面板绕过交付、观察不刷新界面 | 读 `peekObservation` / `agent.observe` / `interface` | 成立：`after_move` 走实时投影；回调只在状态迁移时触发 |
| R2-03 双击间插入视角 | 读 `canMerge` / `commitMerged` / `pushEvent` | 成立：`stepView` 不清窗口，序号取数组长度 |
| R2-04 别名重试判冲突 | 读缓存分支 | 成立：`cached.move !== raw` |
| R2-05 当前与历史口径混用 | 读 `medianSolvedElapsed` 与结果面板 | 成立：一处取 `solved_at_ms`，一处显示 `elapsed_ms` |
| R2-06 回放第 0 步丢初始视角 | 读 `viewAtStep` | 成立：`moves >= step` 在读取任何事件前就退出 |
| R2-07 预算耗尽仍报可观察 | 读 `getProgress` | 成立：未含预算条件 |
| R2-08 返回值可反向改坏缓存 | 读 `commit` / `getLastActionResult` | 成立：缓存与返回值同一对象，仅冻结了 API 容器 |

---

## 二、修复与证据

| R2 条目 | 修法 | 用例 |
|---|---|---|
| R2-01 | 新增 `refreshAuthorizedFaces()`：`applyView` / `viewStep` / `faceView` / `viewReset` 全部走同一出口，遮罩与贴纸同帧刷新 | 浏览器实测（single_face 连按两次方向键切到 B，正面显示彩色、其余遮蔽） |
| R2-02 | ①`peekObservation()` 对 `after_move` 也只返回 `lastDelivered`；②`observe()` 无条件通知宿主；③面板新增「获取观察」按钮与剩余预算；④人类三通道统一 `deliver=false` | T03 / T04 / T05；浏览器实测 |
| R2-03 | ①`closeMergeWindow()` 在 view / observe / pause / resume / submit / abandon 前关闭窗口并结算推迟中的步数耗尽；②`pushEvent` 改独立 `eventSeq`；③`commitMerged` 增加「要撤的事件必须是最后一条」的防御；④键盘任何非面键清空上一按 | T06（4 条）/ T07 |
| R2-04 | 缓存比较改用 `parseMove(raw).normalized`：`2Rw` 与 `Rw` 视为同一请求 | T08（含真正的冲突用例） |
| R2-05 | 当前值与历史中位数统一用 `elapsed_ms`，标签改「中位总耗时」；`SCORE_METRIC` 为 OD-06 的唯一切换点 | R12（期望值同步更新） |
| R2-06 | `viewAtStep` 先吃「第一步之前的视角事件」，第 0 步不再固定 `U/F`；观察者回放按步设置相机 | T11 / R10 |
| R2-07 | `observation_allowed` 追加 `canDeliverObservation()` | T05 |
| R2-08 | `deepFreeze` 覆盖 `MoveResult` / `Observation` / `SubmitResult` / `ChallengeResult`（含嵌套 `face_colors`、`layer_set`、`events`） | T09（3 条） |

第 5 节的 4 条直接缺陷：结果页重复按钮已删、toast 补 `role=status`/`aria-live`、大计时器补「剩余」标签与 `aria-label`、性能提示改为「帧时间偏高」（原「已降级」描述的是没发生的事）。
**OD-01** 的两个矛盾算例已按公式更正，并写成 `tests/puzzle/difficulty.test.ts` 的可执行断言（2.8 / 5.2 / 8.3）。

---

## 三、验证结果

| 检查 | 结果 |
|---|---|
| `npx tsc --noEmit` | 通过（0 错误） |
| `npx vitest run` | **26 文件 / 309 条全部通过**（上一轮 292 + 新增 17） |
| `npx vite build` | 通过 |
| 浏览器（Chromium，`vite preview`） | 0 pageerror |

### 浏览器实测（真实渲染，非 jsdom）

| 场景 | 观测 |
|---|---|
| `single_face`，连按两次方向键 → front=B | 观察返回 `{view:{up:'U',front:'B'},faces:['B']}`；画布上正对镜头的面显示贴纸色，其余为遮蔽色（遮罩跟随视角） |
| `restricted`，点击「获取观察」 | 面板由「观察预算 24 + 观察已锁定」变为「观察预算 23 + `run-…:o1` + 3 面」——**没有状态迁移也会刷新** |
| `after_move`，观察后再按 D | 面板仍停在 `o1` 与旧布局；再点一次「获取观察」才变 `o2`——旧实现在这里会「旧编号 + 新布局」 |

---

## 四、未验证边界

1. **T01 / T02 只验了数据层与单点视觉**：授权面集合、遮罩跟随用「切到 B 面后正面有色」判定，没有做像素级的逐面采样。
2. **T12 回放相机**：代码已接线（观察者模式按步 `setCamera`），但没有跑完整的播放/拖拽组合。
3. **T15 真实刷新落盘**：仍只有单元级覆盖（R08），浏览器端 `beforeunload` → `localStorage` 未实测。
4. **T16 截断后的回放可恢复范围**：结果已带 `events_dropped`，界面还没有按缺口提示「回放不完整」的文案。
5. **Q01 / OD-09 未定**：本轮选择「结构化观察配额」，画面通道不冻结。若改判为「全渠道信息受限」，需要新增渲染冻结分支。

---

## 五、与上一轮报告的关系

- 上一轮 `2026-10-26-review-fix-report.md` 的结论仍然有效，但**其中两条已被本轮修正**：
  - 「R12 用 `solved_at_ms`」→ 改为与卡片一致的总耗时（R2-05）；
  - 「R10 每步恢复三个面」→ 补齐了第 0 步的初始视角与相机（R2-06）。
- 未决项从 8 条增至 9 条（新增 OD-09），OD-01 / OD-05 / OD-06 / OD-07 / OD-08 只补进展、不关闭。

---

## 六、改动的文件

```
src/ob-cube/src/challenge/session.ts       归并窗口、事件序号、状态版本、观察门控、深冻结
src/ob-cube/src/agent/index.ts             observe 无条件通知
src/ob-cube/src/ui/keyboard.ts             非面键清空双击语境
src/ob-cube/src/ui/view-model.ts           ObservationView.canObserve / budgetLeft
src/ob-cube/src/ui/panels/observation-panel.ts  获取观察按钮与预算显示
src/ob-cube/src/ui/panels/challenge-panel.ts    大计时器「剩余」标签
src/ob-cube/src/ui/panels/result-panel.ts       去重「同题面重跑」、标签口径
src/ob-cube/src/ui/shell.ts                observe 端口、toast 播报属性
src/ob-cube/src/ui/icons.ts                注册 eye 图标
src/ob-cube/src/ui/components.css          .timer__label
src/ob-cube/src/services/history.ts        SCORE_METRIC 单点口径
src/ob-cube/src/wiring/index.ts            授权面刷新、回放相机、观察端口、性能文案
src/ob-cube/src/render/scene.ts            帧预算注释更正
src/ob-cube/tests/regression/review-r2.test.ts        新增 14 条
src/ob-cube/tests/regression/keyboard-merge.test.ts    新增 1 条（方向键打断）
src/ob-cube/tests/agent/read-flip-sync.test.ts         拆成「纯读不通知」+「观察必通知」
src/ob-cube/tests/puzzle/difficulty.test.ts            新增算例断言
docs/decisions/2026-10-27-review-r2-rulings.md
docs/decisions/2026-10-26-review-fixes-ruling.md       R-4 补更正注记
docs/decisions/OPEN-DECISIONS.md                       新增 OD-09 + 5 条进展
docs/reports/2026-10-27-review-r2-fix-report.md
docs/specs/prd/CHANGELOG.md                            v2.3-dev（101–120）
docs/specs/prd/04-scoring-judging.md                   §6.3 算例勘误
```

引擎目录（`src/ob-cube/src/engine/`）未改动，无需重跑 `permutation-proof.py`。
