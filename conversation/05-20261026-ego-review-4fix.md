# 2026-10-26 PRD 复审 + ego-browser 自有用例测试 + 四项缺陷修复

> 范围：`src/ob-cube` 对照 `docs/archive/2026-10-26-docs-v1/PRD.md`（v1.10 归档；现行为 `docs/specs/PRD.md` v2.0） v1.9 复审。本轮不复用前两轮用例，
> 自行设计 11 轮浏览器用例（脚本存于 `C:/Users/34538/ego/obcube-review-20261026-2/round-01..11.mjs`，
> ego space 8 / "obcube prd review 20261026 b"，dev server 复用 5199 端口）。
> 门禁：vitest 205→213 全绿（新增 8 条回归）、`tsc --noEmit` 0 错、`vite build` 通过。

## 一、本轮自有用例通过项（此前未覆盖或仅目检的口径）

| 用例 | 验证点 | 结果 |
|---|---|---|
| R2 三组同题面对比 | AC-45/70/63：`applyMove('R2')`、`applyMove('R')×2`、键盘双击 D 三者——前两组与第三组终态指纹完全一致；事件数 1/2/1、步数 1/2/1、`merged_from:["R","R"]`；API 不按通道合并 | 通过 |
| R3 逆打乱闭环 | AC-27：`moves=20` 时第 20 步（=上限）恰好还原 → `solved_pending` → `ended_solved`，非 move_limit（Node 侧 vite-node 复现 seed=ac27 打乱序列，浏览器逆序执行） | 通过 |
| R4 暂停细节 | AC-55/56：暂停 2.5s 期间 elapsed 增量 0（毫秒级精确）、remaining 不变；暂停中方向键/API rotateView 均 `E_CHALLENGE_PAUSED`；恢复后从冻结点续走；+4s 后按活跃时长判 timeout | 通过 |
| R5 蒙尘探针（自动化升级） | AC-16：rAF 内 `gl.readPixels` 采样魔方区域 49 点，43 点=遮蔽色 `#2B323C`、6 点=背景色 `#0B0E14`（轮廓外），0 点接近 6 贴纸色——替代前轮截图目检 | 通过 |
| R7 小项 | running 中 Space 零事件；Esc 弹放弃确认层、取消后仍在 running、确认后 ended_abandoned；`?`（Shift+/）浮层开/关/toggle；retryNew 在 URL seed 下确实换题面 | 通过 |
| R10/R11 | AC-54 字符零命中（含本轮新增文案）；历史面板渲染"未完成"badge | 通过 |

## 二、坐实并修复的 4 个缺陷

| # | 缺陷 | 依据 | 修复 |
|---|---|---|---|
| D1 | **interrupted 链路完全缺失**：running/paused 中刷新/关闭页面无 beforeunload 处理，记录丢失且无重进提示（前 22 轮评审未覆盖此项） | PRD §7.3 终止判定、§11 P0、UIUX §7.4.2/§7.5 | `ChallengeStatus` 增 `ended_interrupted`（isEnded 同步）；session 增 `interrupt()`（paused 段照记 paused_total_ms，elapsed 冻结）；wiring 增 beforeunload 同步结算+尽力落盘；启动时检测最近一条 interrupted → appbar 提示条"有一次未完成的运行（3×3 · 约 N 分钟前）"+查看记录（滚动高亮历史面板）/知道了；结果页结论"未完成"、历史 badge、`resultLabelOf` 全链路 |
| D2 | 结果页"复制指纹"按钮恒 toast"指纹尚不可用"：shell 宿主回调恒传空串 | PRD §9.1 操作区"复制题面指纹" | `ResultView` 增 `fingerprint`（=initial_fingerprint）；result-panel 把它传给宿主；shell 转 `ports.copy(text,'题面指纹')`。实测复制 `fc93c5d0c12c72e2`、toast"题面指纹已复制" |
| D3 | 首次运行引导条缺失（UIUX §5.2 三级 + B12 验收） | PRD §5.5 首次引导 | shell 增 `.first-run-hint`（pointer-events:none，文案照抄 UIUX：'按 W A S D X Q 转面 · ⇧ 反向 · 连按两下转 180°'）；wiring 在 `sync()` 挂钩（挂 `tickAndSync` 检测不到 guard 内发生的状态迁移——已踩坑修正）；仅人类参与者、仅 running 态显示；首个有效转动后同帧消失并写 `ob-cube:v1:guide-seen`（刷新后不再出现，B12 全链路实测） |
| D4 | **AC-22 四字段不全**：`applyMove` 返回值缺 `axis`/`layer_set`；事件流 `RunEvent` 四字段（axis/layer_set/layer_count/turn_amount）全缺 | AC-22、PRD §13.4 | `MoveResult` 增 `axis: MoveAxis`、`layer_set`；`RunEvent` 增四字段（非 move 事件为 null，旧记录缺键兼容）；commit 与归并路径同源填充（归并事件 turn_amount=180，与直接 X2 五字段一致 AC-63） |

## 三、回归确认（修复未破坏既有行为）

- vitest 213/213（新增：interrupted 状态机 3 条、AC-22 事件字段 3 条、复制指纹 1 条、未完成结果页 1 条）
- R2/R3/R4 复跑全过；事件流 keys 现含 axis/layer_count/layer_set/turn_amount 且入 localStorage 记录
- `tsc --noEmit` 0 错；`vite build` 通过；AC-54 仍零命中

## 四、测试方法备注（供后续轮次复用）

- localStorage 键前缀是 `ob-cube:v1:`（不是 `obcube:`），历史索引 `run-index`、单条 `run:<id>`。
- 页面有两个 `.popover-backdrop`（矩阵帮助 + 快捷键说明），定位后者须用 `aria-label="快捷键说明"`。
- ego 的 `keyboard.press("Shift+Slash")` 在该环境不产生到达页面的 key 事件；`?` 浮层用合成 `KeyboardEvent` 验证（真实浏览器无此问题，控制器逻辑本身正确）。
- fixed 定位元素（modal/backdrop）不能用 `offsetParent` 判可见，须查 `hidden` 属性。
- WebGL 像素探针在 rAF 回调内 `readPixels` 可行（同帧 buffer 未清除），无需 preserveDrawingBuffer。
- Node 侧 `npx vite-node scripts/xxx.ts` 可 import TS 源码复现 seed→scramble，用于构造"最后一步恰好还原"等确定性用例（临时脚本已删，可按 `createPuzzle({size,seed,createdAt})` 重建）。

## 五、遗留（记录在案，未改动）

- 观察模式（三面/单面/受限）仍无页面配置入口（F14 P1，前轮已记录）。
- `autoSubmitOnSolved` 死设置（前轮已记录，PRD/SPEC 口径分歧）。
- 埋点体系（PRD §11.1）未实现（前轮已记录）。
- UIUX §7.4.4 第 6 条"超时发生于暂停中"已随 v1.9 冻结语义作废，实现无此文案，正确。
- B12"引导条区域点击穿透"由 `pointer-events:none` 满足；"300ms 内消失"实现为同帧消失（更严格）。
