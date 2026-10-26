# Spec — ob-cube v1.0

> 生成日期：2026-10-25
> 基于：PRD v1.3 + ARCHITECTURE v1.0 + UIUX v1.2
> 状态：已锁定，进入 Phase 2
> 项目代号 `ob-cube` 为暂定名，用户确认后可改名（改名只影响目录名与页脚，不影响任何契约）

本文件是开发期的**唯一契约**。与上游文档冲突时，以本文件为准；本文件未覆盖处，回查上游文档。

---

## 1. 产品定义

一个网页，人和 AI Agent 用**同一套引擎、同一套计步规则、同一条回放记录**，在**同一个可复现题面**上比谁还原得更好。

目标用户三类：普通玩家（主）、AI Agent 开发者（主）、模型评测人员（次）。

核心问题不是"缺一个魔方"，是**缺"同题面 + 同引擎 + 同计步 + 可回放"的横向可比性**。

## 2. MVP 范围（锁定——不在此列表一律不做）

| # | 功能 | 优先级 | 验收编号 |
|---|---|---|---|
| F01 | 3D 渲染 + 6 面视角（拖拽 + 方向键 + 面视按钮 + 复位） | P0 | AC-01~05 |
| F02 | 魔方引擎（2/3/4 阶状态、置换、记法、还原判定） | P0 | AC-06~14 |
| F03 | 键盘映射 + 按钮矩阵 + 层选择器 | P0 | AC-15~20, AC-40 |
| F04 | 随机打乱 + seed 可复现题面 | P0 | AC-21~26 |
| F05 | 蒙尘门控（API 层 + 视觉层） | P0 | AC-22, AC-64, AC-65 |
| F06 | 计时 + HTM 计步 | P0 | AC-27~33 |
| F07 | 还原判定（2/3/4 阶差异化） | P0 | AC-34~39 |
| F08 | `window.cubeAgent` API | P0 | AC-41~48 |
| F09 | 操作记录 + 逐步回放 | P0 | AC-49~54 |
| F10 | 结果展示（右栏五区块） | P0 | AC-49~54 |
| F11 | localStorage 历史记录 | P0 | AC-51 |
| F12 | 暂停/继续（**真暂停**：冻结计时 + 屏蔽输入 + 画面遮罩） | P0 | AC-57~60 / AC-73~74 |
| F13 | 构建与类型门禁 | P0 | AC-61 |
| F14 | P0 字符扫描 | P0 | AC-62 |
| F15 | 归并动画无回退（逐帧验证） | P0 | AC-63 |
| P1 | 记法输入框（`F2` 聚焦）、贴纸字母标记、单色模式 | P1 | — |
| P2 | 自由层非连续组合、批量多步提交 | P2 | — |

**RICE 只用于排序，不用于砍 P0。** 砍掉 F08 或 F09，"人机同台可比"的产品定义即不成立。

## 3. 明确不做（Out-of-Scope，锁定）

| 不做 | 原因 | 何时考虑 |
|---|---|---|
| 后端 / 账号 / 云端题库 | 单机评测工具，无多租户隔离需求；引入后端会丢失静态托管形态 | 需要对外背书评测结论时 |
| 真·防作弊（服务端强制观察权限） | 纯前端无法阻止 DevTools 读内存、hook PRNG | 同上；这是 F05 的诚实边界 |
| 均匀随机状态生成 | 需要求解器级别的状态空间采样；v1 只做随机操作打乱并如实标注 | v2 |
| 自动难度分级 | 需要求解器估算最优解长度 | v2 |
| 求解器提示 | 会让"人机对比"失去意义 | 不做 |
| drag-to-turn（拖拽转层） | 需要与 OrbitControls 做手势仲裁，触控板上尤难调 | v2，且必须先补手势仲裁设计 |
| 移动端深度适配 | 桌面优先；移动端只保证"能看能转" | 有真实需求时 |
| 非连续层组合（如 4 阶同时转第 1、3 层） | 记法无法序列化 → 记不下来、回放不了、Agent 读不懂 | 不做 |
| 多人比赛房间 | 无后端 | 不做 |
| 整体旋转进入 state（`x/y/z` 计步） | 与"视角旋转不计步"冲突；`apply_move` 拒绝并返回 `E_NOTATION_ORIENTATION_NOT_MOVABLE` | 不做 |

## 4. 技术架构（锁定 — 版本锚定）

| 层 | 技术 | 锚定版本 | 锁定原因 |
|---|---|---|---|
| 构建 | vite | `~8.3.5` | 零配置 TS 直出、`?raw` 导入；不装任何 Vite 插件 |
| 语言 | typescript | `~7.0.2` | 若 `tsc --noEmit` 报编译器级不兼容，回退 `~5.9.3` 并记 ADR |
| 3D | three | `~0.186.1` | 只需盒体 + 相机 + 矩阵 |
| 3D 类型 | @types/three | `~0.186.0` | three 自身不带类型 |
| 单测 | vitest | `~5.0.5` | `environment: node` 跑引擎与动画；jsdom 仅 UI |
| DOM | jsdom | `~30.1.3` | 仅 UI 组件测试 |
| 覆盖率 | @vitest/coverage-v8 | `~5.0.5` | 与 vitest 同版本线 |
| 图标 | lucide-static | `~1.61.0` | **全项目唯一图标源**，`?raw` 导入，`stroke=currentColor` |

运行时基线：Node `>=22.12.0`（本机 v22.22.2 满足）。

**明确不引入**：后端运行时、数据库、ORM、鉴权、状态管理库、UI 组件框架、CSS-in-JS、图标字体、emoji 图标。

### 分层与依赖方向（违反即退回）

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

铁律：`engine/` 的 import 中不得出现 `three` / `document` / `window` / `localStorage` / `performance`。计时只允许出现在 `challenge/clock.ts` 一处。

### 目录

```
src/ob-cube/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src/
│   ├── shared/
│   ├── engine/          # 零依赖，node 环境 100% 可测
│   ├── puzzle/
│   ├── challenge/
│   ├── render/
│   ├── agent/
│   ├── services/
│   ├── ui/
│   └── main.ts          # 只装配，零业务
└── tests/
```

单文件 ≤ 300 行。入口文件只装配零业务。

## 5. 状态模型与引擎（锁定）

- 状态：`Uint8Array(6·N²)`，`slot = faceIndex·N² + row·N + col`，`faceIndex` 按 `[U,R,F,D,L,B]`
- 颜色 id 用面名：`0=U, 1=R, 2=F, 3=D, 4=L, 5=B`
- 引擎原语：`(axis, layerSet, amount)` — `layerSet` 为**任意**轴索引集合，连续约束只在记法/UI 层
- 置换：几何算法程序化生成，**代码中零手写置换数组**。几何基向量表是唯一允许手写的 6 行
- 整体旋转：只转相机，`apply_move` 拒绝

**记住判定**：六个面各自单色即还原。4 阶整体朝向不唯一是**定义**，不是妥协。

**层语义**：层号从被命名面算起、1-based、`l=1` 恒为外层。`Rw` 恒为 2 层，不随 N 变化。覆盖全 N 层的转动一律拒绝（`E_MOVE_COVERS_ALL_LAYERS`）。

## 6. Agent API 契约

传输形态：`window.cubeAgent`。公开字段 **snake_case**，内部 camelCase，转换集中在一个纯函数模块。

| 方法 | 前置条件 | 关键失败码 |
|---|---|---|
| `getChallengeInfo()` | 挑战已创建 | `E_NO_ACTIVE_CHALLENGE` |
| `observe(opts?)` | `status ∈ {running, solved_pending}` | `E_CHALLENGE_NOT_STARTED` / `E_OBSERVATION_BUDGET_EXHAUSTED` |
| `rotateView(req)` | `status ∈ {ready, running, solved_pending}`（v1.1：ready 放开，预观察需要转视角） | `E_VIEW_ORIENTATION_INVALID` / `E_CHALLENGE_PAUSED` |
| `applyMove(move, opts?)` | `status === 'running'` | 记法错误组 / `E_DEADLINE_EXCEEDED` / `E_MOVE_LIMIT_REACHED` |
| `getProgress()` | — | — |
| `getLastActionResult(opId?)` | 已有操作 | `E_OP_ID_NOT_FOUND` |
| `submitSolution(note?)` | `status ∈ {running, solved_pending}`（`running` 下未还原返回 `E_NOT_SOLVED`，累计 3 次才终止；`solved_pending` 下成功结算） | `E_NOT_SOLVED` / `E_CHALLENGE_ENDED` |
| `getChallengeResult(challengeId, runId?)` | 该运行已结束 | `E_RUN_NOT_FINISHED` |
| `abandonChallenge(note?)` | 挑战进行中 | `E_CHALLENGE_ENDED` |

**命名双重口径（不可混用）**：方法名一律 camelCase（AC-41 白名单穷举，恰好 9 个，多一个即违规）；Public 字段名一律 snake_case（PRD 6.2）。成功返回包**平铺在根上**，禁止包 `data`。

**六条不可违反的契约**：

1. `observe()` 在 `status ∈ {idle, configuring, ready}` 时**不得返回任何颜色数据**，必须抛 `E_CHALLENGE_NOT_STARTED`（PRD AC-14）。
2. `deadline` 校验必须在 `observe` / `applyMove` / `rotateView` / `submitSolution` 四个方法的**入口第一行**执行。只依赖 UI 倒计时可被 Agent 用高频 observe 拖住。**例外**：`status === 'solved_pending'` 不判超时（PRD AC-75：还原优先，结果锁定 `solved`）。
3. `applyMove` 带 `op_id` 时幂等：命中且 move 相同 → 返回缓存，`deduplicated: true`，**不执行、不消耗步数**；move 不同 → `E_OP_ID_CONFLICT`。
4. `observation_id` 格式 `<run_id>:o<seq>`，不可被客户端构造。它表示**本次决策所依据的那次观察**——`observe()` 返回 id X，紧接着的 `applyMove` 必须回显 X。`observation_lag` 据此推导。
5. `window.cubeAgent` **不得暴露 pause/resume**，Agent 模式不渲染暂停按钮。真暂停只给人类；Agent 没有等价能力，因此人类的 `pause_count` / `paused_total_ms` 必须进入结果（PRD AC-59）。
6. 所有错误都带 `hint` 字段，且**不修改状态**（校验全部前置）。

**三条派生约束（本轮裁决新增）**：

- **归并是输入整形，不是计步规则**。双击 `R R` 表达的是 `R2` 意图（1 条事件、1 步），与按 `R2` 按钮等价；两次 `applyMove('R')` 表达两次独立转动（2 步）。人机公平性由「同一意图恒得同一 move_count」保证，不由「同一输入序列恒得同一 move_count」保证。
- **`state_fingerprint_after` 在 `observation_mode !== 'full'` 时返回 `null`**。2 阶状态空间约 3.67×10⁶，32 位指纹本地可枚举反推，返回它等于直接返回隐藏状态。挑战结束后 `getChallengeResult` 正常返回最终指纹。
- **「将提交」预览串必须取引擎 `describeMove()` 返回值**，UI 不得自行拼接。`parse(describeMove(axis, layerSet, amount))` 必须往返恒等（穷举 144 组），否则回放会静默失败。

## 7. 数据模型（localStorage）

命名空间 `ob-cube:v1:*`。题目记录必须存：题目 ID / 阶数 / 生成方式（**随机操作打乱，如实标注**）/ seed / scramble 序列 / 记法版本 `ss-2` / 算法版本 / 创建时间 / 难度标签。

复现方式：**重放打乱序列 + 状态指纹校验**。不存最终状态快照。指纹为 facelet 字符串的 FNV-1a（初始值、质数、位宽在架构 §6.6 写死）。

写入纪律：单次写入失败不得影响已存的运行记录；`E_STORAGE_FULL` 时提示清理历史，不得静默丢弃。

## 8. 页面与组件（锁定）

单页三栏（桌面优先）：

- **左栏** 挑战信息：阶数 / 题目 ID / 剩余与已用时间 / 步数 / 状态 / 开始·暂停·结束 / 复现
- **中栏** 3D 魔方 + 视角 HUD（左上打乱·重置，右上视角 5 键）+ 按钮矩阵（5 个互斥 tab）
- **右栏** 观察数据 / 操作日志 / Agent 状态 / 结果五区块

按钮矩阵 tab 组数：**2 阶 2 组 / 3 阶 3 组 / 4 阶 5 组**。同屏转动按钮峰值 ≤19。

按钮标签一律 Singmaster（`R` / `R'` / `R2` / `Rw` / `2R`），中文只出现在面卡标题。角标显示键盘字符，与标签**故意不同**（`R` 按钮的角标是 `D`）。

## 9. 设计 Token（锁定）

唯一色值定义点：`src/ob-cube/src/ui/tokens.css`。`docs/design-tokens.css` 为源码来源。

- 主 CTA 填充：`--action-bg`（白实心，15.52:1）。**`--accent-primary` 不得用作主按钮填充**——它 L\* 75.6 与 F 面绿 L\* 74.0 只差 1.6
- 魔方六色按 L\* 严格阶梯：U `#F4F7FB` 97.11 / D `#F5C93C` 82.66 / F `#3DCE80` 73.99 / L `#F5821F` 66.12 / B `#5484EC` 56.53 / R `#CB3A36` 46.97
- 色盲三级：亮度阶梯（默认）+ 面中心字母（默认开，不可关）+ 贴纸标记/单色模式（P2 开关）
- 动效：禁止弹跳缓动 `cubic-bezier(0.68,-0.55,0.265,1.55)`
- 图标：lucide-static 一套，16/20/24 三档，stroke-width 2

## 10. 验收标准

以 **PRD v1.3 的 AC-01~AC-65** 为唯一依据，按 EARS 格式逐条机器验证。本 Spec 补充三条实现级约束（并入 AC-61~65 的执行）：

- AC-40 的枚举口径为 **3 轴 × 连续区间 × 3 转向**：2阶 18 / 3阶 45 / 4阶 81，合计 144
- AC-22 的蒙尘态像素约束意味着蒙尘材质必须 **unlit**，光照不得作用于它
- 归并动画（AC-63）必须能逐帧采样角度，禁止只验终态

## 11. 内嵌已知坑（全部来自本项目已发生的实证）

| # | 坑 | 根因 | 修法 |
|---|---|---|---|
| 1 | 180° 双击归并出现「转过去→转回来→再转半圈」闪回 | 按"撤销 + 重放 R2"实现 | 保留两次 90° 动画，只合并计步与日志条目；`move_count` 由事件数派生 |
| 2 | `Rw` 解析失败 | 正则把 `w` 写在面字母前 | 顺序必须是「数字前缀 → 面字母 → `w` → 转向后缀」 |
| 3 | 单面转动受影响贴纸数算错 | 奇数阶面心不动、偶数阶中心块自转 | N 奇：`N²-1+4N`；N 偶：`N²+4N`。2阶 12 / 3阶 20 / 4阶 32 |
| 4 | 偶数阶用 `M/E/S` 得到错误结果 | 切片只对奇数阶有定义 | N 为偶数一律 `E_SLICE_NOT_AVAILABLE` |
| 5 | `three` 导入 addons 后无类型 | `three` 无 `types` 字段 | 装 `@types/three`；addons 必须写完整扩展名 `three/addons/controls/OrbitControls.js` |
| 6 | TS 7 下 `@types/three` 报类型错 | 类型包声明 `typeScriptVersion: 5.6` | 先降 `typescript` 到 `~5.9.3`，再考虑局部 `@ts-expect-error` 并记 ADR |
| 7 | 转几百步后魔方肉眼可见歪掉、散开 | 用 `quaternion.multiply` / `position.add` 累积 | 任何 `Object3D` 变换只从整数格坐标 + 整数朝向矩阵**重算**，禁止累积 |
| 8 | 蒙尘态 AC-22 像素扫描失败 | 光照让六面亮度不同 | 蒙尘材质 unlit，只读 `--cube-masked`，无纹理无噪点 |
| 9 | 验收项永远过不了 | 把"任意层组合"写进 AC-40 | 限连续区间（记法只能序列化连续区间） |
| 10 | 主按钮与 F 面绿混淆 | `--accent-primary` 青绿 L\* 与 F 面绿只差 1.6 | 主 CTA 用 `--action-bg` |

## 12. 端到端验证步骤

```bash
# 0. 引擎算法基线（已通过，改动引擎后必须重跑）
python -B docs/research/permutation-proof.py        # 退出码 0
python -B docs/research/verify-spec-vs-proof.py     # 退出码 0

# 1. 安装
cd src/ob-cube && npm install

# 2. 类型门禁
npm run typecheck        # tsc --noEmit 零错误

# 3. 单元测试
npm test                 # 引擎/题目/计时/归并 全绿

# 4. 构建
npm run build            # 零错误，dist/ 产出

# 5. P0 字符扫描（构建产物也扫）
#    emoji / 紫粉渐变 / 占位文案 全部零命中

# 6. 浏览器冒烟
npm run dev
# 断言 A：ready 态 canvas 像素颜色种类 <= 2（AC-22）
# 断言 B：ready 态 window.cubeAgent.observe() 抛 E_CHALLENGE_NOT_STARTED
# 断言 C：点击开始 -> 3 阶随机题 -> 键盘 W/A/S/D/X/Q 可转面，步数递增
# 断言 D：4 阶切到「内层」tab -> 按 2R 按钮 -> 只转第 2 层
# 断言 E：视角转到背面后按 D，被转动层有 2px 外轮廓描边
# 断言 F：还原后进入 solved_pending，submit_solution 返回成功
# 断言 G：同一 seed 创建两次挑战，初始 facelet 指纹相同
```

## 13. 变更记录

| 日期 | 变更 | 原因 | 影响 |
|---|---|---|---|
| 2026-10-25 | v1.0 初版 | Phase 1.5 锁定 | — |
| 2026-10-26 | v1.1 九条用户反馈裁决（全文见 `docs/decisions/2026-10-26-nine-issues-ruling.md`，PRD v1.9 同步）：① 暂停改真暂停（elapsed=活跃时长，暂停中不可能超时，新增 `E_CHALLENGE_PAUSED`，画面遮罩）；② 预观察模式（dust_mode=false 时 ready 可见题面+可转视角，observe 门控不变）；③ 挑战配置进页面（时限默认不限时/步数/蒙尘/参与者/题目），URL 参数优先；④ 参与者=人类时隐藏 Agent 面板，`window.cubeAgent` 恒挂载不变；⑤ 再挑战一次=新题面回 ready、同题面重跑=同题面回 ready，均不自动开始；⑥ 超时迁移 UI 立即置灰（AC-28 补充）；⑦ 归并第二次按键执行同向 90°（修正实现偏差，规格本意）；⑧ rotateView 前置条件加 ready | 用户 2026-10-26 九条反馈 | session/keyboard/wiring/ui 全链路；F12 语义、F05 条件化、F15 最小题库提前 |
| 2026-10-26 | v1.3 同步 PRD v1.10：① `submitSolution` 允许在 `running`/`solved_pending` 调用；② `solved_pending` 不判超时；③ F12 改用 AC-57~60 / AC-73~74；④ 暂停为真暂停，Agent 不可暂停、人类暂停时长进结果 | PRD v1.10 修复硬矛盾 | agent 契约、暂停语义、测试引用 |
