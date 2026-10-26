# ARCHITECTURE — 魔方挑战与 Agent 评测平台

> 文档性质：团队契约（Phase 1 产出）。本文档中标注「钉死」的条目，Phase 2/3 不得单方面更改；需要更改时先改本文档 + 对应 ADR，再改代码（活规格纪律）。
> 适用范围：纯前端单页应用，Vite + TypeScript + Three.js，无后端、无账号、localStorage 持久化。
> 状态：v1.4（已吸收 PRD v1.4、UIUX v1.2 与主理人 6 项裁决）。
>
> 修订记录（只记会影响实现的）：
> v1.2 按 PRD 全量 AC 修正 9 处契约（方法名 camelCase、返回包平铺、`turn_amount` 用度、`layer_set` 用记法层号、2 阶拒层前缀、`observation_id` 回显、三口径计步、镜像配色手性校验、2D 降级）；
> v1.3 补 `describeMove` 为记法唯一真源、`3R` 归一化为 `2L'`、`A` 为任意子集、快照编码与指纹参数写死；
> v1.4 落主理人裁决：主 CTA 用 `--action-bg`、层轮廓线纳入 draw call 153、遮蔽材质 unlit + 相机可拖、像素验收改确定性探针、受限观察屏蔽指纹、归并按意图比较。

---

## 0. 阅读顺序与结论速览

按顺序读第 1、3、4、5、7 节即可获得全部硬结论；第 8-11 节是渲染、目录、持久化与测试的落地约束。

本阶段的十三个硬结论：

| # | 结论 | 章节 |
|---|---|---|
| 1 | 状态模型采用 **facelet（面片）模型**，状态为长度 `6N²` 的 `Uint8Array` | §3 |
| 2 | 所有转动置换由**几何算法程序化生成**，代码中不存在任何手写置换数组 | §4 |
| 3 | 记法的层号语义为「从被命名面算起、1-based、l=1 即外层」；`Rw` 恒等于 `2Rw`；覆盖全层的转动**被拒绝** | §5.3 |
| 4 | 整体旋转 `x/y/z` **只转相机，不进入 state、不计步**；`applyMove` 拒绝接受它 | §5.5 |
| 5 | 题目生成方式 v1 仅实现 **随机操作打乱**，并如实标注；不做均匀随机状态生成 | §6.5 |
| 6 | 复现方式为**重放打乱序列 + 状态指纹校验**，不存最终状态快照 | §6.6 |
| 7 | Agent 公开契约的字段名**一律 snake_case**，与 PRD 6.2 逐字一致；内部 camelCase，转换集中在一个纯函数模块 | §7.2 |
| 8 | 渲染采用 **cubie mesh 方案**，且**每个 cubie 的贴纸颜色由 facelet 状态逐面派生**，渲染层不持有第二份状态 | §8.1 |
| 9 | 图标只允许 **lucide-static** 一套，以 `?raw` 导入 SVG，颜色继承 `currentColor` | §1 |
| 10 | 状态指纹**只用于重放一致性校验**，不是局面等价判据（同一个魔方可以是不同的数组） | §3.5 |
| 11 | 还原判定 = 六面单色 **且** 配色矩阵 `det = +1`；镜像配色报 `E_INVALID_STATE`（AC-25 / AC-26） | §3.4 |
| 12 | 渲染必须通过 `CubeView` 接口提供 **2D 展开图降级**，且该实现不得依赖 three（AC-53） | §8.8 |
| 13 | **方法名 camelCase（9 个，白名单穷举）、字段名 snake_case**；`parseNotation` 不进 `window.cubeAgent`；成功返回包**平铺**不包 `data` | §7.2 / §7.4 |

---

## 1. 技术选型与版本锚定（钉死）

版本号取自 2026-10-25 的实际 npm registry 查询结果，不是「通用印象」。安装时按此版本写代码；升级必须先更新本节与 ADR。

| 用途 | 包 | 锚定版本 | 选型理由 |
|---|---|---|---|
| 构建 | `vite` | `~8.3.5` | 零配置 TS 直出、`?raw` 资源导入、内置 dev server。本项目**不装任何 Vite 插件**，因此 bundler 后端换代（rolldown）的风险面被压到最小 |
| 语言 | `typescript` | `~7.0.2` | 当前 `latest`。若 `tsc --noEmit` 对本项目依赖报出编译器级不兼容，回退到 `~5.9.3` 并在 ADR 记录；**不得**使用 `next`/`beta` 标签版本 |
| 3D | `three` | `~0.186.1` | 唯一实际需求是「盒体 + 相机 + 矩阵」，three 的生态与 addons 覆盖足够 |
| 3D 类型 | `@types/three` | `~0.186.0` | `three` 包本身不带类型；该版本 `exports` 映射了 `./addons/*`，`three/addons/...` 导入可获得类型 |
| 单测 | `vitest` | `~5.0.5` | 与 Vite 同源配置；`environment: 'node'` 跑引擎与动画变换逻辑，`jsdom` 只用于 UI |
| DOM 环境 | `jsdom` | `~30.1.3` | 仅 UI 组件测试使用 |
| 覆盖率 | `@vitest/coverage-v8` | `~5.0.5` | 与 vitest 同版本线 |
| 图标 | `lucide-static` | `~1.61.0` | **全项目唯一图标来源**。SVG 文件以 `lucide-static/icons/<name>.svg?raw` 导入，类型由 `vite/client` 提供（`*?raw` 声明为 string），无额外 shim；`stroke="currentColor"` 使颜色完全由 CSS Token 控制 |
| 浏览器冒烟（可选） | `@playwright/test` | `~1.64.1` | 仅用于验证真实浏览器里的 `window.cubeAgent`。因需下载浏览器二进制，默认不进 `npm test`，列为 `test:e2e` |

**图标纪律（钉死）**：全项目只允许 `lucide-static` 一套，禁止混用其他图标库、禁止用字形/emoji 充当功能图标。

- 统一 `import` 出口：`ui/icons.ts`，其余模块**不得**直接 `import '...svg?raw'`。
- 尺寸只用 `16 / 20 / 24px` 三档（由 `width`/`height` 属性与 CSS 控制）。
- **不得覆写 `stroke-width`**（lucide 原值为 2）：覆写会让同一套图标出现两种粗细，视觉上像两套图标。
- 首版需要的 13 个语义图标（lucide 官方名，供 `ui/icons.ts` 导出）：

| 用途 | 图标名 |
|---|---|
| 视角左 / 右 / 上 / 下 | `chevron-left` / `chevron-right` / `chevron-up` / `chevron-down` |
| 视角复位 | `rotate-ccw` |
| 打乱 | `shuffle` |
| 重置 | `rotate-cw` |
| 播放 / 暂停 | `play` / `pause` |
| 结束会话 | `square` |
| 键位图 | `keyboard` |
| 复制挑战 ID | `copy` |
| 展开 / 折叠 | `chevron-down`（与视角下复用同一图标，靠 aria-label 区分语义） |

**运行时基线**：Node 满足 `^22.12.0 || ^24.0.0 || >=26.0.0`（Vite 8 要求 `^20.19.0 || >=22.12.0`，Vitest 5 要求 `^22.12.0 || ^24.0.0 || >=26.0.0`，取交集）。本机实测 `v22.22.2`，满足。

**版本锚定中已核实的两个真实坑（写进代码前必读）**：

1. `three` 的 `package.json` **没有** `types` 字段，类型全部来自 `@types/three`；导入 addons 必须写完整扩展名：`import { OrbitControls } from 'three/addons/controls/OrbitControls.js'`。省略 `.js` 在 `moduleResolution: "bundler"` 下解析失败。
2. `@types/three@0.186.0` 声明 `typeScriptVersion: 5.6`。使用 TS 7 时若出现类型层报错，先怀疑类型包而非业务代码，处理顺序为：降 `typescript` 版本 → 再考虑局部 `@ts-expect-error`（后者需在 ADR 留痕）。

**明确不引入**：任何后端运行时、数据库、ORM、鉴权库、状态管理库、UI 组件框架、CSS-in-JS、图标字体、emoji 图标。理由见 ADR-004 与 §12。

---

## 2. 分层架构与依赖方向（钉死）

```
┌──────────────────────────────────────────────────────────────┐
│  ui/            表现层：DOM、面板、按钮矩阵、键盘映射          │  依赖 engine / render / challenge 的公共出口
│                 不持有魔方状态，不实现规则                     │
└───────────────┬──────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────┐
│  agent/         契约层：window.cubeAgent（snake_case 投影）    │  依赖 engine + challenge，禁止依赖 ui / render / storage
│  render/        渲染层：Three.js 场景、动画、相机              │  只依赖 engine（类型 + 查询函数）与 shared
│  services/      应用服务：历史、设置（聚合 storage 给 ui 用）   │  依赖 storage + puzzle/challenge
└───────────────┬──────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────┐
│  challenge/     规则层：状态机、计时、观察权限、事件日志        │  依赖 engine + puzzle，禁止依赖任何浏览器 API
│  puzzle/        题目层：PRNG、打乱、指纹、复现                  │  依赖 engine
└───────────────┬──────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────┐
│  engine/        引擎层：纯 TypeScript，零 DOM、零浏览器 API    │  只依赖 shared
│                 facelet 状态、置换生成、记法解析、还原判定      │
└───────────────┬──────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────┐
│  shared/        无业务的基础工具：Result、断言、事件发射器      │  不依赖任何其他目录
└──────────────────────────────────────────────────────────────┘
```

**依赖铁律**（违反即退回重做）：

1. `engine/` 的 import 语句中**不得出现** `three`、`document`、`window`、`localStorage`、`requestAnimationFrame`、`performance`。这条让引擎可以在 `vitest` 的 `node` 环境里 100% 覆盖测试。
2. `render/` 不得 import `challenge/`、`agent/`、`ui/`。渲染层看到的只有「一份 facelet 状态 + 一个 move 事件」。
3. `render/view-2d.ts` **不得** import `three`（AC-53 的降级路径必须在 three 加载失败时仍可用）。`three` 只能被 `view-3d.ts` 及其下游模块 import，且必须通过动态 `import()` 加载，失败可捕获。
4. `agent/` 不得 import `render/`、`ui/`、`storage/`。Agent 契约必须能在「没有 WebGL、没有 DOM」的条件下被构造和测试。
5. `ui/` 可以 import 下游全部公共出口，但**不得直接 import `storage/`**，必须经 `services/`。
6. 跨层只调用下游的 `index.ts` 公共出口，禁止深路径穿透（`import { x } from '../engine/state/facelet-state'` 在 `ui/` 中属违规）。
7. 计时只出现在 `challenge/clock.ts` 一处。其他任何位置调用 `performance.now()` 都属违规（`render/frame-budget.ts` 的帧计时是唯一例外，且需注释说明）。

---

## 3. 状态模型选型（结论：facelet）

### 3.1 决策

采用 **facelet（贴纸/面片）模型**。状态是 `Uint8Array(6·N²)`，索引 `slot`，值域为 6 个颜色 id（用面名做 id：`0=U,1=R,2=F,3=D,4=L,5=B`）。

以面名当颜色 id 是一个刻意的设计：引擎里永远不出现任何十六进制色值，`solved` 判定退化为「6 段区间各自常量」，并且「U 面的 U 色」这种语义在调试时自解释。颜色到视觉的映射完全交给 `render/palette.ts`（见 §8.7）。

### 3.2 对比矩阵

评分 1-5，越高越好。

| 维度 | facelet | cubie | 判据 |
|---|---:|---:|---|
| 状态大小 | **5** | 3 | 4 阶 facelet 为 96 字节；cubie 需 56 个块 × (位置 3 + 朝向)，且位置需相对引用而非绝对坐标，约 336 字节起 |
| 序列化难度 | **5** | 2 | facelet 天然是定长 char 数组，`join('')` 即指纹输入；cubie 要编码嵌套朝向（角块 3 态、棱块 2 态、中心片相对位置），任何编码变更都破坏历史数据 |
| 4 阶适应性 | **5** | 2 | 4 阶没有固定的中心块与棱块：24 个中心片、24 个 wing。cubie 模型必须额外维护「哪些中心片属于同一面」的相对关系，或引入参考中心——复杂度陡增且易错；facelet 完全不需要这些概念 |
| 观察数据导出 | **5** | 3 | facelet 就是 PRD 6.2 要的二维颜色矩阵，切片即导出，不可能与渲染不一致；cubie 需要额外写一个「块 → 面片」投影函数，且这个函数会与渲染层的投影产生第二处真相 |
| 还原判定 | **5** | 4 | facelet：每面 6 段各自单一色即还原，天然与整体朝向无关，4 阶「整体朝向不唯一」的争议自动消解（见 §3.4）；cubie 还要额外判断中心片朝向 |
| 动画映射 | 3 | **5** | cubie 的块与 mesh 天然 1:1；facelet 要把「面片变化」翻译成「块的运动」。这是 cubie 唯一的真实优势 |
| 实现风险 | **4** | 2 | cubie 的朝向编码、4 阶中心/棱的特殊性、以及与观察投影的三方一致性，是本项目最容易产生**静默逻辑错误**的地方 |
| **合计** | **32** | **21** | |

**动画映射这一项的劣势在 §8.1 被消解，且不引入第二份状态**：渲染层的每个 cubie 只负责「我这一格朝外的三个面该显示什么颜色」，颜色由 facelet 状态逐面派生（纯函数），因此渲染层不持有任何可漂移的魔方语义。这条设计使 facelet 的总分优势成立。

### 3.3 slot 编号规则（钉死）

`slot = faceIndex·N² + row·N + col`，`faceIndex` 按 `[U, R, F, D, L, B]` 顺序，`row` 增大方向为「该面从外面看时的向下」，`col` 增大方向为「从外面看时的向右」。这一定义必须与 §4.1 的几何基向量严格一致，否则「从外面看」的直觉与引擎索引会对不上，表现为「界面上显示的颜色矩阵上下颠倒」。

### 3.4 还原判定：六面单色 + 配色必须是合法旋转

PRD AC-23 / AC-24 / AC-25 / AC-26 把还原判定拆成四条，其中 AC-25 与 AC-26 要求区分「标准配色的任一 24 旋转」与「镜像配色」。这不是可以靠「六面单色」一句话带过的，必须给出可执行算法。

判定分三步，全部可在 facelet 状态上完成，**不需要追踪朝向**：

1. **单色检查**：6 个面各自的 `N²` 个 slot 颜色全部相同。任一面不满足 → 未还原。
2. **双射检查**：设每面的颜色为 `c(f)`。若 `{c(U)..c(B)}` 不是 6 个颜色的一个排列（有重复或有缺失）→ 返回 `E_INVALID_STATE`。
3. **手性检查**：构造 3×3 矩阵 `M`，要求对全部 6 个面满足 `M · n(f) = n(c(f))`（`n` 取 §4.1 的单位法向量）。因为 6 个法向量张成整个空间，`M` 唯一。判定 `M` 是否为整数正交矩阵且 `det(M) = +1`：
   - `det = +1` → 是立方体的一个合法旋转 → **已还原**（对应 AC-23/24/25）
   - `det = -1` → 镜像配色，任何真实转动都无法到达 → **未还原**，返回 `E_INVALID_STATE`（对应 AC-26）

对「由转动到达的状态」，第 3 步必然给出 `det = +1`（立方体转动只产生真旋转），所以在正常挑战流程中这一步不改变结论——它只在对**导入的状态快照**做校验时生效，这正是 AC-26 的语境（`INVALID_STATE` 只可能来自导入路径）。

后果与纪律：

- 判定函数是 `isSolved(state): { solved: boolean; reason: 'uniform' | 'mixed' | 'invalid-scheme' }`，调用方必须区分「未还原」与「非法状态」，不得把后者当成「继续操作就好」。
- 对已还原状态施加「覆盖全部 N 层的转动」仍得到六面单色且 `det = +1` 的状态（整体旋转是合法旋转），因此 §5.3 禁止覆盖全层转动，是为了让「能执行的动作」与「会改变状态的动作」重合，避免 Agent 用全层转动刷步数。
- 单步判定开销 `O(6N²)`（4 阶 96 次比较 + 一次 3×3 行列式），可以在每步后无条件执行。

### 3.5 「同一个魔方」与「同一个数组」不是一回事（重要）

面片状态数组里带着整体朝向的信息，即使我们不把它当成语义。后果是：

> **两个不同的动作序列可能得到同一个魔方，但得到不同的 facelet 数组，从而有不同的状态指纹。**

已确认的例子：3 阶上 `2-3Rw` 与 `R'` 得到同一个魔方（相对状态一致），但数组不同。更常见的是「序列 A + 整体转一层」这类组合。

因此必须区分三种判定，且代码里不得混用：

| 判定 | 正确做法 | 错误做法 |
|---|---|---|
| 是否已还原 | §3.4 的三步检查（朝向无关，含手性校验） | 与已还原数组逐位比较 |
| 两个状态是否「同一个魔方」 | 需要先做朝向归一化（v1 **不提供**该能力） | 比较状态指纹 |
| 两次重放是否一致 | 比较状态指纹（同一序列必得同一数组） | 比较「是否已还原」 |

指纹的正确用途只有一个：**校验「同一段序列在同一版本引擎上重放出同一结果」**。它不是局面等价性判据。任何想拿指纹做「局面去重」「局面是否相同」的代码，都属于误用，必须在评审阶段拦下。这条限制也是 §12 中「不做求解器」的补充理由——求解器需要局面规范化，v1 没有这个能力。

---

## 4. 转动置换系统

> 本节是全项目最大的正确性风险点。硬性要求：**置换表必须由几何算法程序化生成，禁止手写任何置换数组**。

### 4.1 唯一允许手写的几何表

允许手写的只有「面 → 外法向量 + 局部基」这 6 行。它是坐标系的**定义**，不是置换；置换由它推导出来。写错这里的代价是「某一面的颜色矩阵镜像」，会被 §11 的定向测试抓到。

坐标系：`x` 向右、`y` 向上、`z` 指向观察者（F 面朝 +z）。右手系。

| 面 | 外法向量 `n` | 列方向基 `u` | 行方向基 `v` | 分量轴 | 侧 |
|---|---|---|---|---|---|
| U | (0, +1, 0) | (+1, 0, 0) | (0, 0, +1) | y | + |
| D | (0, -1, 0) | (+1, 0, 0) | (0, 0, -1) | y | - |
| F | (0, 0, +1) | (+1, 0, 0) | (0, -1, 0) | z | + |
| B | (0, 0, -1) | (-1, 0, 0) | (0, -1, 0) | z | - |
| R | (+1, 0, 0) | (0, 0, -1) | (0, -1, 0) | x | + |
| L | (-1, 0, 0) | (0, 0, +1) | (0, -1, 0) | x | - |

约束：每行必须满足 `u × v = -n`（右手屏幕基，行方向朝下）。这条约束是**可断言**的，见 §11 的 T-01。

由此得到的展开图邻接关系（必须与之一致）：U 的下边贴 F 的上边；F 的右边贴 R 的左边；D 的上边贴 F 的下边；B 的左边贴 R 的右边；L 的左边贴 B 的右边。

### 4.2 坐标表示：双倍整数

所有几何运算使用**双倍整数坐标**，绝不使用浮点：

```
c(i) = 2i - (N-1)          // i ∈ [0, N-1] → 取值 {-(N-1), ..., N-1}
面片位置 p = n·(N-1) + u·c(col) + v·c(row)
```

取值举例：`N=2` 时 c 取 `{-1, +1}`；`N=3` 时 `{-2, 0, +2}`；`N=4` 时 `{-3, -1, +1, +3}`。除以 2 就是世界坐标下的格心偏移。

用整数的收益：旋转矩阵元素只取 `0/±1`，整个状态推进是精确整数运算，**引擎侧零浮点误差**。（浮点只存在于渲染，且 §8.3 另有约束。）

### 4.3 生成器算法

输入：`(N, axis, A, k)` —— 轴、参与转动的**轴索引集合** `A ⊆ [0, N-1]`（从负侧数，见 §4.5）、四分之一转次数 `k ∈ {1,2,3}`。

```
BUILD_SLOT_TABLE(N):
  slots ← []
  FOR face IN [U, R, F, D, L, B]:
    FOR row IN 0..N-1:
      FOR col IN 0..N-1:
        p ← n(face)·(N-1) + u(face)·c(col) + v(face)·c(row)
        slots.push({ face, row, col, pos: p, normal: n(face) })
  index ← MAP (pos, normal) → slotIndex          // 6N² 个键，构造时断言无重复
  RETURN (slots, index)

GENERATE_PERMUTATION(N, axis, A, k):
  axisIdx ← {x:0, y:1, z:2}[axis]
  coordSet ← { c(a) : a ∈ A }                    // 轴索引 → 双倍坐标，只在这一处换算
  perm ← [0, 1, ..., 6N²-1]                      // 恒等
  FOR slot IN slots:
    IF slot.pos[axisIdx] ∉ coordSet: CONTINUE     // 不在本层，保持不变
    p' ← ROT90(slot.pos,    axis, k)              // k 次 90° 旋转，纯整数
    n' ← ROT90(slot.normal, axis, k)
    perm[ index(p', n') ] ← slot.idx              // 语义：新状态[目标] = 旧状态[来源]
  RETURN perm

ROT90 的单次形式（右手定则，绕 + 轴）：
  x: (x, y, z) → (x, -z,  y)
  y: (x, y, z) → (z,  y, -x)
  z: (x, y, z) → (-y, x,  z)
```

层号 `l` 到轴索引 `a` 的换算（§4.4）发生在**调用生成器之前**，生成器本身只认轴索引。这与「渲染层只使用轴索引」的约定一致，保证换算只有一处实现。

**`A` 是任意轴索引子集，不受连续约束（钉死）。** 生成器对 `A` 没有任何形状假设：`{0,2}`（跳过中间层）与 `{0,1,2}` 一样能正确生成置换。连续区间是**记法层与 UI 层**的产出约束，不是引擎的能力边界：

| 层 | 对层集合的约束 | 理由 |
|---|---|---|
| 引擎 `GENERATE_PERMUTATION(N, axis, A, k)` | 无，任意子集 | 保持引擎是「纯几何」，不承担产品规则 |
| 记法层 `parseMove` | 只产出连续区间 `[i, j]`，且不含全集 | 非连续集合没有公认记法，硬造私有语法没有意义 |
| UI 层 | 前置拦截，让用户配不出会被拒绝的组合 | 不让用户吃错误码 |

这条分层是有意的：引擎不设人为限制，将来若要支持「转第 1 和第 3 层」这类动作，只需放开记法层，引擎不用改。

**为什么它必然正确**（这四步推理要写进代码注释）：

1. `ROT90` 是行列式为 +1 的整数正交矩阵，立方体外表面片集合在它的作用下封闭（立方体对称群的定义）。
2. 映射 `φ: slot ↦ (R·pos, R·normal)` 在全体 slot 上是双射（`R⁻¹` 给出逆）。
3. `φ` 保持沿转轴的分量不变（绕该轴旋转的定义），因此每个「层子集」在 `φ` 下封闭。
4. 由 2、3：`perm` 在每个层子集上是双射，子集外是恒等；故 `perm` 是全体 slot 上的双射。又因 `R⁴ = I`，故 `perm` 的阶整除 4。

注意语义方向：`perm[target] = source` 表示「原来在 source 的贴纸移动到 target」，读取方式是 `newState[t] = oldState[perm[t]]`。整个代码库只允许这一种约定，`applyPermutation` 是唯一实现点。

### 4.4 由「面 + 层号 + 方向」到 `(axis, A, k)`

这层换算把记法语义接到几何上，是**单一规则**，不是六张表：

- 方向：`k = 3`（即 -90°）当面在正侧；`k = 1`（即 +90°）当面在负侧。等价表述：顺时针（从面外看）= 绕该轴的 `+90° × (侧为负 ? 1 : -1)`。`'` 取反，`2` 取 `k=2`。
- 层号换算：记法层号 `l`（从被命名面算起，1-based）→ 轴索引 `a`：正侧面 `a = N - l`，负侧面 `a = l - 1`；再换双倍坐标 `c(a)`。

六面方向规则的自检（应全部与手转一致，已实测）：

| 动作 | 绕轴 | 角度 | 预期搬运方向 |
|---|---|---|---|
| `R` | +x | -90° | F→U |
| `L` | +x | +90° | F→D |
| `U` | +y | -90° | F→L |
| `D` | +y | +90° | F→R |
| `F` | +z | -90° | U→R |
| `B` | +z | +90° | U→L |

切片方向（Singmaster 约定）：`M` 与 `L` 同向、`E` 与 `D` 同向、`S` 与 `F` 同向。

### 4.5 层索引语义（钉死）

- **层号从被命名的那个面算起，1-based，`l = 1` 恒为该面最外层。** 因此 `2R` 是「从 R 面数第 2 层」。
- **内部存储用轴索引 `a ∈ [0, N-1]`，从负侧数。** 换算见 §4.4。渲染与动画只使用 `a`，记法解析只产出 `a`，两者不重复实现换算。
- **外层判定**：`a = 0` 或 `a = N-1`。`l = 1` 恒为外层。
- **宽转覆盖从 1 到 n 的连续层，必含外层。**
- **`Rw` 的定义是「恰好 2 层」，不随 N 变化。** 理由：若定义为「一半的层」，3 阶上 `Rw` 的语义会与速拧社区习惯冲突（3 阶习惯 `Rw` = 2 层），且同一记法在不同阶数上产生不同的层集合，是静默错误的温床。
- **`a-bFw` 的区间形式支持**，`a ≥ 2` 时表示不含外层的「内层厚转」（如 4 阶 `2-3Rw`）。开区间 `a-Fw`（省略 b）**不支持**，避免与「到最后一层」还是「到某层」的歧义。

#### 2 阶完整层映射（`N=2`，`c(a) ∈ {-1, +1}`）

| 面 | `l=1` | `l=2` | 说明 |
|---|---|---|---|
| R / U / F（正侧） | `a=1`（外） | `a=0`（对面外） | **记法上被拒绝**（见下） |
| L / D / B（负侧） | `a=0`（外） | `a=1`（对面外） | **记法上被拒绝** |

- **2 阶不接受任何层前缀**（`2R`、`2L`… 一律 `E_MOVE_LAYER_OUT_OF_RANGE` / PRD 短名 `INVALID_LAYER`）。依据 PRD AC-07。
  这在几何上确实等价于对面外层转动（`2R ≡ L'`），但**语法层拒绝比接受更正确**：2 阶没有「内层」这个概念，允许 `2R` 只会让 Agent 与用户多一种同义写法，而没有任何表达能力增益。等价关系保留在本节作为几何事实记录，**不作为可执行动作**。
- 合法单层转动：18 个（6 面 × 1 层 × 3 后缀）。
- 宽转：`Rw`（= 2 层）**被拒绝**（覆盖全 2 层）。2 阶上一次宽转等价于整体旋转，不应计入步数。
- 切片：无（`N` 为偶数）。

#### 3 阶完整层映射（`N=3`，`c(a) ∈ {-2, 0, +2}`）

| 面 | `l=1` | `l=2` | `l=3` |
|---|---|---|---|
| R / U / F（正侧） | `a=2`（外） | `a=1`（中） | `a=0`（对面外） |
| L / D / B（负侧） | `a=0`（外） | `a=1`（中） | `a=2`（对面外） |

- 合法单层转动：18 个外层 + 6 面 × 2 内层 × 3 后缀 = 18 + 36 = 54 个（其中 `3R` 等价 `L'` 等 18 个是冗余但合法的写法）。
- 切片：`M`、`E`、`S` 各 3 后缀，共 9 个。**恒等式（必须测）**：3 阶上 `2R ≡ M'`、`2U ≡ E'`、`2F ≡ S`。
- 宽转：`Rw`（2 层）合法；`3Rw`（3 层 = 全层）**被拒绝**。

#### 4 阶完整层映射（`N=4`，`c(a) ∈ {-3, -1, +1, +3}`）

| 面 | `l=1` | `l=2` | `l=3` | `l=4` |
|---|---|---|---|---|
| R / U / F（正侧） | `a=3`（外） | `a=2` | `a=1` | `a=0`（对面外） |
| L / D / B（负侧） | `a=0`（外） | `a=1` | `a=2` | `a=3`（对面外） |

- 合法单层转动：6 面 × 4 层 × 3 后缀 = 72 个。其中 `3X` 与 `2Y'` 成对等价（`3R ≡ 2L'` 等 18 对），接受但归一化为后者，见 §5.7。
- 宽转：`2Rw`、`3Rw`（含 `Rw ≡ 2Rw`）、`2-3Rw`；`4Rw` 与 `1-4Rw` **被拒绝**。
- 切片：无（`N` 为偶数）。
- **恒等式（必须测）**：`2-3Rw` 等价于「先 `2R` 再 `3R`」（层不相交，可交换）。

### 4.6 置换的正确性验证手段

代码里不写「相信它对」，而是用四条可机器断言的性质兜住：

| 性质 | 断言方式 |
|---|---|
| 双射 | `new Set(perm).size === 6N²`，且所有值落在 `[0, 6N²)` |
| 阶整除 4 | 反复复合 `perm` 直到恒等，得到的阶 ∈ {1, 2, 4}；四分之一转必须是 4，半转必须是 2 |
| 逆元 | `compose(perm(move), perm(inverse(move)))` 为恒等 |
| 闭合性 | 参与转动的 slot 数量等于解析式 `Σ_{a∈A} (4N + (a 为外层 ? N² : 0))` |

最后一条是特别好用的一致性校验，它同时校验了「层集合换算」与「几何邻接」两件事。已实测的取值：

| 阶数 | 动作 | 受影响 slot 数 | 循环结构 |
|---|---:|---:|---|
| 2 | `R` | 12 | 3 个 4-循环 |
| 3 | `R` | 21 | 5 个 4-循环 + 1 个不动点（R 面中心） |
| 4 | `R` | 32 | 8 个 4-循环 |
| 4 | `Rw`（2 层） | 48 | — |
| 4 | 全 4 层 | 96 | 必须被 API 层拒绝 |

循环结构也可以断言：`R` 在 3 阶上恰好是「5 个 4-循环 + 1 个不动点」，任何「写成 3 循环」的实现错误会被立刻抓到。

### 4.7 复杂度与缓存

- `BUILD_SLOT_TABLE(N)`：`O(N²)`，每阶数构造一次并缓存。
- 置换缓存键：`(N, axis, a, k)`，条目数 `3·N·3 ≤ 36`。缓存单层置换即可：宽转由「不相交层的复合」得出，`2` 由两次四分之一转复合得出。
- 单步执行：`O(6N²)` 次整数拷贝（4 阶 96 次），实测量级为亚微秒，无需优化。
- 缓存对 `engine` 是内部细节，不得暴露给外部修改（返回只读视图或副本）。

---

## 5. 记法系统

基础为 Singmaster 记法，扩展内层与宽转（与 SiGN 记法兼容）。记法版本号：`ss-1`。这个版本号必须随每一次题目记录一起持久化。

### 5.1 EBNF

```ebnf
sequence    = ws, move, { ws, move }, ws ;
move        = turn | rotation ;
turn        = [ prefix ], face, [ wide ], [ suffix ] ;
rotation    = ( "x" | "y" | "z" ), [ suffix ] ;

prefix      = digit, [ "-", digit ] ;          (* "2" | "2-3" *)
wide        = "w" ;                            (* 只接受小写 w *)
suffix      = "'" | "2" | "2'" ;               (* 空串亦合法 *)
face        = "R" | "L" | "U" | "D" | "F" | "B" | "M" | "E" | "S" ;
digit       = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" ;
ws          = " " | "\t" | "\n" ;
```

实现用一条正则即可完全覆盖**词法**（语义约束在正则之外）。注意正则故意放宽到 `[A-Za-z]`，目的是让「小写面字母」「整体旋转字母」「未知字母」三类输入都能先被词法接受，再由 §5.4 的分类步骤给出**各自不同**的错误码——如果正则只认大写，`r` 会被报成语法错误，Agent 就学不到「你该写大写」这条信息。

```
/^(?:(\d{1,2})(?:-(\d{1,2}))?)?([A-Za-z])(w)?(2'?|')?$/
```

**大小写规则（钉死）**：面字母与 `w` 只接受大写；整体旋转只接受小写 `x/y/z`。小写面字母（如 `r`、`u`）被**显式拒绝**（`E_NOTATION_LOWERCASE`）。理由：速拧社区里 `r` 约定为 `Rw`，而多数人直觉里 `r` 就是 `R`。在 Agent 场景下，静默执行一个「看起来接近但语义不同」的转动，比直接失败危险得多——宁可让它报错，也不要让它错转。

### 5.2 归一化规则

| 输入 | 归一化输出 | 说明 |
|---|---|---|
| `R` | `R` | — |
| `R'` | `R'` | — |
| `R2`、`R2'` | `R2` | `2'` 与 `2` 等价（180° 自逆），归一化后 HTM 均为 1 步 |
| `Rw`、`2Rw` | `2Rw` | `Rw` 是 `2Rw` 的别名 |
| `3Rw`、`3Rw'` | 保持短形式 | `nFw` 一律保持短形式，不改写成 `1-nFw` |
| `2-3Rw` | `2-3Rw` | 区间形式只在 `a ≥ 2` 时使用，原样保留 |
| `3R` | `2L'` | 从另一侧数的等价写法，归一化为「离它更近的外层」命名，且方向取反（见 §5.7） |
| `3L` / `3U` / `3D` / `3F` / `3B` | `2R'` / `2D'` / `2U'` / `2B'` / `2F'` | 同上，成对对称 |
| 多余空白 | 单空格分隔 | 解析忽略首尾与重复空白 |

短形式与区间形式**不互相改写**：`nFw` 恒表示「第 1 到第 n 层」，`a-bFw` 恒表示「第 a 到第 b 层且 `a ≥ 2`」。这样两条路径各自只有一种写法，`move_catalog` 不会出现同一动作的两种字符串。

### 5.3 层集合推导（把记法变成 `A`）

```
推导(D, N):
  IF D.face ∈ {M, E, S}:
     断言 D.prefix = ∅ 且 D.wide = ∅，否则 E_NOTATION_MALFORMED
     断言 N ≥ 3 且 N 为奇数，否则 E_SLICE_NOT_AVAILABLE
     axis  ← {M:'x', E:'y', S:'z'}[D.face]
     A     ← [ (N-1)/2 ]                          // 唯一中间层
     k     ← 由「M 与 L 同向、E 与 D 同向、S 与 F 同向」+ 后缀决定
     RETURN (axis, A, k)

  // 层集合
  IF D.prefix 形如 a-b:  layers ← [a..b]
  ELSE IF D.prefix 为 n: layers ← D.wide ? [1..n] : [n]
  ELSE:                  layers ← D.wide ? [1,2] : [1]

  断言 1 ≤ min(layers) 且 max(layers) ≤ N      否则 E_MOVE_LAYER_OUT_OF_RANGE
  IF N = 2: 断言 layers = [1]                  否则 E_MOVE_LAYER_OUT_OF_RANGE   // AC-07：2 阶无内层
  断言 |layers| < N                            否则 E_MOVE_COVERS_ALL_LAYERS
  A ← layers.map(l ↦ 正侧面 ? N-l : l-1)
  k ← 由 §4.4 的方向规则 + 后缀决定
  RETURN (axis(face), A, k)
```

`|layers| < N` 这条断言就是「禁止覆盖全层」，理由见 §3.4。

### 5.4 非法 move 判定与错误码

判定顺序固定（先词法后语义，保证错误码可预测）：

| 序 | 条件 | 错误码 | Agent 应如何处理 |
|---:|---|---|---|
| 1 | 不匹配词法正则 | `E_NOTATION_MALFORMED` | 用 `parseNotation` 试跑，读 `hint` 修正 |
| 2 | 字母是 `x` / `y` / `z` | `E_NOTATION_ORIENTATION_NOT_MOVABLE` | 改调 `rotateView` |
| 3 | 字母是 `r l u d f b m e s`（小写面字母） | `E_NOTATION_LOWERCASE` | 改大写；`r` 须明确写成 `Rw` 或 `R` |
| 4 | 字母不是九个面字母之一 | `E_NOTATION_MALFORMED` | 用 `U R F D L B M E S` |
| 5 | 前缀或 `w` 与 `M/E/S` 同时出现 | `E_NOTATION_MALFORMED` | 切片不接受前缀与宽转 |
| 6 | 层号 `< 1` 或 `> N`（含 `a > b`） | `E_MOVE_LAYER_OUT_OF_RANGE` | 读 `allowed_actions.layer_indices` |
| 7 | `M/E/S` 而 `N` 为偶数 | `E_SLICE_NOT_AVAILABLE` | 该阶数不支持切片 |
| 8 | 层集合覆盖全部 N 层 | `E_MOVE_COVERS_ALL_LAYERS` | 若意图是改观察方向，改调 `rotateView` |
| 9 | 一次传入多个 move | `E_NOTATION_MULTIPLE_MOVES` | `applyMove` 只收单步 |

序 2 与序 3 的顺序重要：`x/y/z` 是小写但它们是**合法记法**，只是不属于 `applyMove` 的通道；而 `r` 是**非法记法**。两者必须给出不同错误码，否则 Agent 无法判断「该换通道」还是「该改大小写」。

所有错误都返回 `hint` 字段（人类可读的一句话 + 正确的替代写法），且**不修改状态**（校验全部前置，先解析成功再提交）。

### 5.5 整体旋转的裁决：只转相机，不进入 state

**结论**：`x / y / z` 不进入魔方状态，不计步，不走 `applyMove`。它们是观察通道的一部分，由 `rotateView` 承担。

理由三条：

1. PRD 4.2 明确「视角旋转只改变观察方向，不改变魔方内部状态，不计入魔方转动步数」。若把整体旋转写进 state，就必须回答「计不计步」这个 PRD 已经回答过的问题，并引入第二种「合法但不计步」的状态变更路径。
2. 状态里不含朝向 = 还原判定天然朝向无关（§3.4）。一旦允许整体旋转入 state，就必须额外维护「当前朝向」并让 `solved` 判定考虑它，4 阶的中心朝向争议会立刻回来。
3. 记法解析层仍然**支持** `x/y/z` 的解析（`kind: 'rotation'`），因为题目导入导出、UI 键盘映射、以及未来可能的外部算法文本都会用到它。但调用链上它被路由到 `rotateView`，`applyMove` 见到它就报 `E_NOTATION_ORIENTATION_NOT_MOVABLE`。

**Agent 需要 reorientation 时如何满足**：`rotateView` 提供两种请求形态——

- 相对：`{ kind: 'relative', axis, quarter_turns }`（1/2/3 个 90°）
- 绝对：`{ kind: 'absolute', up, front }`（`up` 与 `front` 必须是不共线的两个面）

绝对形态让 Agent 可以精确跳到 24 个离散朝向中的任意一个。同时 `observe()` 的返回里带 `view.matrix`（3×3 整数矩阵，把魔方坐标系的三个轴映射到观察者坐标系），Agent 拿到矩阵后可以自行把看到的颜色矩阵换算到它自己的参考系里做推理，**这个过程不需要也不应该污染 state**。

相机的连续拖拽（鼠标转动视角）只影响渲染相机，不改变 `view`；受限观察模式下，渲染层按 `view` 对应的授权面显示，未授权面显示遮蔽材质（§7.9）。

### 5.6 `move_catalog` 的构成与规模

`move_catalog` 是 `getChallengeInfo()` 返回的**全量合法单步清单**（归一化后的字符串）。它是「完备且无假阴性」的清单，不是「去重后的最小集合」——里面存在语义等价的多条写法（例如 3 阶 `2R` 与 `M'`），这是刻意的：让 Agent 拿到的清单与实际可执行的集合完全一致，避免它因为「清单里没有但引擎接受」而误判。

| 阶数 | 单层 `lF` | 宽转 `nFw` | 区间 `a-bFw` | 切片 | 合计 |
|---|---:|---:|---:|---:|---:|
| 2 | 6 面 × 1 层 × 3 = 18 | 0 | 0 | 0 | **18** |
| 3 | 6 × 3 × 3 = 54 | 6 面 × 1 档（`n=2`）× 3 = 18 | 6 面 × 1 组（`2-3`）× 3 = 18 | 3 × 3 = 9 | **99** |
| 4 | 6 × 4 × 3 = 72 | 6 面 × 2 档（`n=2,3`）× 3 = 36 | 6 面 × 3 组（`2-3`、`2-4`、`3-4`）× 3 = 54 | 0 | **162** |

- 单层：`l = 1` 输出裸面（`R`），`l ≥ 2` 输出 `lF`（`2R`）。`l` 上限为 `N`；**2 阶上限为 1**（AC-07）。
- 宽转：`n` 只取 `2..N-1`（`n = N` 覆盖全层被拒），规范形式是 `nFw`。
- 区间：`2 ≤ a < b ≤ N` 且 `b-a+1 < N`。`a = b` 的区间与 `nFw` 同义，不重复列出。
- 2 阶只有 18 条：任何层前缀都被 AC-07 拒绝，因此不产生 `2R` 一类的条目。

清单里存在若干代数等价的写法，这是刻意的冗余，不是缺陷。已确认的三条（T-09 覆盖前两条，第三条只作记录，不设断言）：

| 等价关系 | 阶数 | 备注 |
|---|---|---|
| ~~`2R ≡ L'`~~ | 2 | **不可执行**：AC-07 拒绝 2 阶的层前缀。几何上成立，语法上禁止 |
| `2R ≡ M'`、`2U ≡ E'`、`2F ≡ S` | 3 | 内层写法与切片写法重合 |
| `2-3Rw ≡ R'` | 3 | 层集合 `{2,3}` 是 `{1}` 在全集下的补集；整体转动不改变相对状态，故两者得到同一个魔方（但 facelet 数组不同，见 §3.5） |

**两个不同的数，不要互相验证**（这是最容易出错的地方）：

| 口径 | 定义 | 2 阶 | 3 阶 | 4 阶 |
|---|---|---:|---:|---:|
| 引擎可接受记法数 | `move_catalog.length`，即「能被 `applyMove` 接受的不同字符串」 | 18 | **99** | 162 |
| UI 可点击路径数 | 6 面 × 连续区间（排除全集）× 3 转向，用于「任意连续区间都有可点击路径」的验收 | 18 | **90** | 162 |

3 阶两者差 9，原因是切片族（`M`/`E`/`S` 各 3 后缀 = 9 条）在 UI 上是独立的一族按钮，但它对应的层集合 `[2]` 已经被 6 个面的 `2F` 前缀写法重复计入过。**这两个数不相等是正常的**，断言时不可混用：T-15 断言 `move_catalog.length`（18/99/162），而 UI 可点击路径数的验收是枚举界面按钮、断言每个三元组都能点到。

`allowed_actions` 里的紧凑字段（`layer_indices` / `wide_layer_counts` / `range_form`）是同一个集合的参数化描述，与 `move_catalog` 必须一致（同一条断言的两个视图）。

### 5.7 `describeMove`：记法的唯一真源

UI 不得自行拼接记法字符串。按钮角标、状态栏「将提交：…」预览、日志的 `move` 字段、帮助浮层，**四处必须取同一个函数的返回值**，否则日志里会出现同一动作的两种写法，回放与人工核对都会出问题。

```ts
/** 纯函数：由引擎的原语生成规范记法。不做校验、不读写状态。 */
describeMove(input: { axis: 'x' | 'y' | 'z'; from: number; to: number; amount: 90 | 180 }): Notation;
```

命名规则（唯一，不允许第二种）：

1. **层区间用离它更近的外层字母命名**。设 `N` 为阶数，区间 `[i, j]`（记法层号，1-based）。若 `i` 更靠近 1（即 `i <= N - j + 1`），用正侧面字母（`R/U/F`），层集合写作 `[i..j]`；否则用负侧面字母（`L/D/B`），并换成对称层号。
2. **只含单层且是外层** → 裸面字母（`R` / `L`）。
3. **只含单层且是内层** → 前缀层号 + 面字母（`2R` / `2L`）。
4. **含外层且层数 ≥ 2** → 宽转（`Rw` / `3Rw` / `Lw` / `3Lw`）。
5. **两端都不含外层**（只有中间层）→ 区间记法 `2-3R`（本平台扩展；4 阶的 `{2,3}` 是唯一实例）。
6. **`N = 3` 的中层例外**：3 阶中层有公认单字母记法，**规范形式**用 `M` / `E` / `S` 族，不用 `2R`。`2R` / `2U` / `2F` 仍被接受，但归一化为 `M'` / `E'` / `S`（与 §4.5 的恒等式一致）。两族不会在同一次运行内混用，无歧义。

4 阶 R/L 轴全量映射（U/D、F/B 同构）：

| 层集合（从 R 数） | 顺 | 逆 | 180° |
|---|---|---|---|
| {1} | `R` | `R'` | `R2` |
| {2} | `2R` | `2R'` | `2R2` |
| {3} | `2L` | `2L'` | `2L2` |
| {4} | `L` | `L'` | `L2` |
| {1,2} | `Rw` | `Rw'` | `Rw2` |
| {3,4} | `Lw` | `Lw'` | `Lw2` |
| {1,2,3} | `3Rw` | `3Rw'` | `3Rw2` |
| {2,3,4} | `3Lw` | `3Lw'` | `3Lw2` |
| {2,3} | `2-3R` | `2-3R'` | `2-3R2` |

#### `3R` 这类「从另一侧数」的写法：接受，但归一化

`3R`（从 R 数第 3 层，按 R 方向转）与 `2L'` 是**同一个动作**（同一层，方向相反）。裁决：

- **`parseMove` 接受 `3R` 并归一化为 `2L'`**（注意有撇号，不是 `2L`）。
- **日志、`normalized_move`、UI 角标一律输出规范形式 `2L'`**，因此同一次运行内一个动作只有一种写法。
- `move_catalog` **同时包含** `3R` 与 `2L'`（两者都能被提交），但它们的 `normalized_move` 相同——这是「完备且无假阴性」清单的必然结果，不是缺陷。

为什么接受而不是拒绝：拒绝只会给「自然地从 R 侧数层」的 Agent 增加一条失败路径，却不增加任何表达能力。接受 + 归一化同时满足「Agent 不必猜层的命名方向」与「日志只有一种写法」两个目标。

#### 往返恒等（记法层的唯一硬约束）

`describeMove` 的输出必须是 `parseMove` 的**不动点**：

```
parseMove(describeMove({ axis, from, to, amount })).canonical === describeMove({ axis, from, to, amount })
```

这条恒等是整个记法系统唯一的硬约束，它一次性排除了三类实现错误：`describeMove` 输出了非规范形式、`parseMove` 归一化到了另一个方向、两者对「离哪一侧更近」的判断不一致。

**它也是 `turn_amount` 只取 `{90, 180}` 的原因**：如果允许 `270`（把逆时针 90° 也记成 270），`R'` 就有 `(90, 逆)` 与 `(270, 顺)` 两种表示，`describeMove` 必须二选一，而 `parseMove` 无论选哪个都会与另一方冲突——往返恒等直接失效。方向必须由记法里的 `'` 承担，不由角度表达。引擎内部继续用 `{1,2,3}` 四分之一转加符号，但那只是实现细节，对外只有 90 与 180 两个值。

**这条裁决的连带影响**：4 阶单内层有两组等价写法（`3R ≡ 2L'`、`3L ≡ 2R'`、`3U ≡ 2D'` …），共 18 条冗余条目。它们计入 §5.6 的 `move_catalog` 总数，但会被 T-09 的等价性断言覆盖，不会被误认为「引擎支持了 18 种额外的层」。

---

## 6. 可复现题目系统

### 6.1 PRNG 选型

**mulberry32**，32 位状态，实现只有 6 行、全部使用 `Math.imul` 与 `>>> 0`。

```
mulberry32(a):
  RETURN function():
    a ← (a + 0x6D2B79F5) >>> 0
    t ← a
    t ← Math.imul(t XOR (t >>> 15), t OR 1)
    t ← t XOR (t + Math.imul(t XOR (t >>> 7), t OR 61))
    RETURN ((t XOR (t >>> 14)) >>> 0) / 4294967296
```

确定性保证：

- 只用 32 位整数乘法（`Math.imul` 按规范是精确的 32 位有符号乘法，无精度损失）与位运算，**不经过浮点中间态**，因此在任何符合 ES2015 的引擎上逐位一致。
- 最后一除以 `2^32` 的浮点除法结果确定（分子是整数、分母是 2 的幂，二进制可精确表示）。
- `Math.random()` 被明确禁用：它的算法由实现方自由决定，跨浏览器/跨版本不可复现，是复现体系的致命依赖。

**域分离（钉死）**：实际使用的流种子为

```
streamSeed = ( seed32 + Math.imul(N, 0x9E3779B1) ) >>> 0
```

否则 2 阶与 4 阶在同一 seed 下会产生完全相同的前缀序列（实测复现过这个缺陷）。任何新增的随机用途（例如未来多轮实验的题目变体）都必须引入新的域常量，不得直接复用同一个流。

已知限制（如实记录，不隐藏）：状态空间 `2^32`，种子空间约 42.9 亿。对本产品的本地题库规模（万级以下）完全足够；不用于任何安全用途。

### 6.2 seed 的接受格式

| 输入形态 | 规则 |
|---|---|
| `number` | 必须满足 `Number.isSafeInteger`，且 `0 ≤ v ≤ 4294967295`，否则 `E_SEED_OUT_OF_RANGE`；直接 `v >>> 0` 作为 `seed32` |
| `string` | 去除首尾空白后长度 1..128，UTF-8 字节内 `FNV-1a 32` 得到 `seed32`；长度不合法 `E_SEED_INVALID` |

题目记录里**永远保存规范化后的 `seed32`（十六进制 8 位）与原始 seed 文本**两个字段。只存原始文本的话，未来哈希算法一改就全部失效；只存 `seed32` 的话，用户看不到自己当初填的是什么。

### 6.3 challengeId 生成规则

题目指纹必须由 `(size, seed32, scrambleLength, generatorVersion, scrambleMode, filterPolicy)` 唯一确定。

```
canonical = "v1|n=" + N + "|seed=" + hex8(seed32)
          + "|len=" + L + "|gen=" + mode + "|filter=" + filterPolicy
challengeId = "c" + N + "-g" + generatorVersion + "-" + fp32(canonical)

fp32(s)   = hex8( fnv1a32(s, 0x811C9DC5) ) + hex8( fnv1a32(s, 0x050C5D1F) )
```

哈希选 FNV-1a 32 位，跑两遍（不同 offset basis）拼成 16 位十六进制。理由：

- **无依赖**：6 行实现，不需要引入任何哈希库。
- **跨引擎一致**：只用 `Math.imul`、`^`、`charCodeAt`，全部有确定规范行为。
- **不需要密码学强度**：它只用于本地唯一标识，不参与任何信任判断。
- **16 位而非 8 位**：单个 32 位哈希在万级题目规模下碰撞概率已到千分之一量级，双哈希把碰撞压到可忽略；代价是字符数翻倍，可接受。

注意：`generatorVersion` 进指纹意味着**升级生成算法会让旧 ID 无法复现**。这是刻意的：一个诚实的失效好过一个静默的错误复现。缓解措施是「旧版本生成器分支保留」+「记录里存完整 scramble 序列」（见 §6.6），后者才是复现的真实依据，ID 只是索引。

已实测样例（seed 文本 `demo-2026`）：

| 阶数 | 打乱长度 | challengeId | 最终状态指纹 |
|---|---:|---|---|
| 2 | 11 | `c2-g1-8a2c4e7d0f47d517` | `c2efe0670c2af351` |
| 3 | 20 | `c3-g1-43f60ef051fc99d6` | `80520c7c0c6547da` |
| 4 | 30 | `c4-g1-9389ec5e7e0dc918` | `deaf6a3fdf6e6d31` |

### 6.4 题目记录字段（钉死）

```ts
interface PuzzleRecord {
  schema_version: 1;
  challenge_id: string;          // §6.3
  cube_size: 2 | 3 | 4;
  generation: {
    mode: 'random-walk' | 'imported';   // v1 只产出 'random-walk'
    uniform_random_state: false;        // 恒为 false，字段存在是为了不给未来留谎报空间
    filter_policy: 'no-same-axis';      // 冗余过滤策略，影响序列，必须记录
    algorithm_version: 1;
  };
  seed_text: string | null;      // 用户原始输入（imported 时为 null）
  seed_u32_hex: string | null;   // 规范化后的 seed32
  scramble_length: number;
  scramble: string[];            // 归一化后的单步记法数组，复现的唯一依据
  scramble_fingerprint: string;  // fp32(scramble.join(' '))
  initial_state_fingerprint: string; // fp32(初始状态 char 序列)，用于重放校验
  notation_version: 'ss-1';
  difficulty: {
    label: 'intro' | 'standard' | 'hard' | 'structured' | 'long-scramble' | 'observation-focus' | 'timed' | 'dust';
    basis: 'manual';             // v1 只有人工标注，不做自动分级
    note: string | null;
  };
  created_at: string;            // ISO 8601，Date.now() 只在建记录时使用
}
```

### 6.5 随机状态生成 vs 随机操作打乱（必须区分）

| | 随机状态生成 | 随机操作打乱（v1 实现） |
|---|---|---|
| 含义 | 从合法状态空间按目标分布抽样 | 从已还原状态执行 L 次随机合法转动 |
| 分布 | 可做到近似均匀 | **不均匀**：状态与已还原状态的距离上界是 L（HTM） |
| 4 阶可行性 | 需要求解器或奇偶性感知的构造，成本高 | 无额外成本 |
| 是否 v1 范围 | 否 | 是 |

如实标注的落点：

1. `generation.uniform_random_state` 恒为 `false`。
2. `difficulty.label` 使用 `intro/standard/hard` 时，`basis` 恒为 `'manual'`，不得声称「按真实求解难度分级」。
3. UI 与结果页文案必须写「随机操作打乱（L 步）」，不得写「随机状态」。
4. 对评测可比性的影响必须写进 PRD：**随机操作打乱的题目难度上限由 L 决定**。要保证跨 Agent 可比，只能固定 `L`、固定 `filter_policy`、固定 `algorithm_version`，让所有 Agent 面对同一个分布。默认值建议 `L = 11 / 20 / 30`（2/3/4 阶），理由：3 阶 God's number 为 20，`L=20` 已足以越过「浅层易解区」，而 4 阶的解长度量级更大，`L=30` 与之匹配。
5. 冗余过滤策略 `no-same-axis`（禁止相邻两步同面、禁止相邻两步共轴）会影响序列与分布，因此**它进指纹**。不加过滤会产生大量 `R R'`、`U D U` 这类可消去片段，实际有效长度远小于名义 L——这是「打乱长度不等于难度」的直接原因。

### 6.6 复现方式裁决

**结论：保存打乱序列重放，不保存最终状态快照；同时保存最终状态指纹作为校验位。**

理由：

1. **快照解决不了观察问题**。观察权限、事件日志、回放都需要「从已还原状态一步步推演」，而不是「导入一个静态局面」。序列重放天然支持前向推演与逐步回放；快照则需要额外实现「从快照出发的合法性校验」。
2. **序列更小、更易读、可人工核对**。30 步 4 阶打乱约 200 字节；快照要 96 个颜色值加元信息。
3. **算法升级后的旧题目仍可复现**，因为复现路径不依赖 PRNG，只依赖「记法解析 + 置换生成」这两层。真正会导致旧题目失效的只有**记法语义或置换语义的破坏性变更**，而那类变更必须升 `notation_version` / `algorithm_version`，并且 §11 的回归用例会锁住「2 阶 `2R` = `L'`」「3 阶 `2R` = `M'`」这类跨版本不变式。
4. **指纹是校验位，不是数据源**。重放完成后计算 `initial_state_fingerprint`，与记录里的值比较；不一致时**不得静默继续**，必须向用户报 `E_REPRODUCTION_MISMATCH`，并在 UI 上明确提示「该题目由旧版本算法生成，当前版本无法保证一致」。这样，语义漂移会变成一个可见的错误，而不是一个悄悄变难的题目。

### 6.7 状态快照编码与指纹参数（钉死）

这是全项目唯一允许出现「魔法常量」的地方，必须写死，否则前端实现一份、测试实现另一份，历史记录全部作废。

**快照编码**：定长字符序列，带版本前缀。

```
obl1:URFDLB...        ← 前缀 obl1: 之后恰好 6N² 个字符，字符集 {U,R,F,D,L,B}
                       顺序即 slot 顺序：faceIndex·N² + row·N + col，faceIndex = [U,R,F,D,L,B]
```

- 长度：2 阶 `obl1:` + 24 = 29；3 阶 59；4 阶 101。
- 只在**测试、诊断、导入导出**里出现。运行时状态是 `Uint8Array`，序列化时才变成这个字符串。
- 版本前缀的作用：未来若改变 slot 顺序或引入新的颜色 id，旧串仍可被识别并走迁移，而不是被误读成新格式。读到不认识的前缀必须报 `E_INVALID_STATE`，**不得**按当前格式硬解。

**指纹参数**（FNV-1a，双通道，16 位十六进制）：

| 参数 | 值 |
|---|---|
| 位宽 | 32 位无符号，每步用 `Math.imul` 后接 `>>> 0` 截断 |
| offset basis（通道 1） | `0x811C9DC5` |
| offset basis（通道 2） | `0x050C5D1F` |
| prime | `0x01000193` |
| 迭代单位 | 快照 payload（**去掉 `obl1:` 前缀之后**的部分）逐个 UTF-16 code unit |
| 输出 | `hex8(通道1) + hex8(通道2)`，小写，共 16 字符 |

```
fnv1a32(s, basis):
  h ← basis >>> 0
  FOR i IN 0..s.length-1:
    h ← h XOR s.charCodeAt(i)
    h ← Math.imul(h, 0x01000193) >>> 0
  RETURN h

fingerprint(state):
  payload ← encode(state).slice('obl1:'.length)
  RETURN hex8(fnv1a32(payload, 0x811C9DC5)) + hex8(fnv1a32(payload, 0x050C5D1F))
```

**为什么去掉前缀再算**：前缀是格式标记，不属于盘面内容。若把前缀算进去，未来升到 `obl1:` → `obl2:` 会让所有历史指纹变化，等于把「格式版本」和「局面身份」耦在一起。

**三个已经算好的固定值（T-24 直接断言，不要现算）**：

| 阶数 | 快照 | 指纹 |
|---|---|---|
| 2 | `obl1:UUUURRRRFFFFDDDDLLLLBBBB` | `a70dec0187b6b94b` |
| 3 | `obl1:UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB` | `c92c246ea5d97bbc` |
| 4 | `obl1:UUUUUUUUUUUUUUUURRRRRRRRRRRRRRRRFFFFFFFFFFFFFFFFDDDDDDDDDDDDDDDDLLLLLLLLLLLLLLLLBBBBBBBBBBBBBBBB` | `85f783b58712b9cf` |

这三条是「算法被无意改动」的探针：任何一个字节的实现漂移都会让它们立刻红。把它们硬编码在测试里，而不是在测试里现算——现算的测试只能证明「算法与它自己一致」，证明不了「算法没变」。

---

## 7. Agent API 契约

### 7.1 传输形态

`window.cubeAgent`。所有方法同步返回 `ApiResult`，不返回 Promise，不抛异常。

- **为什么不抛异常**：调用方主要是 LLM 驱动的自动化（Playwright / DevTools / 浏览器类 MCP）。返回值里带结构化错误码，比捕获异常更可靠、也更容易被写进日志做统计分析。
- **为什么全同步**：引擎与规则层全是纯内存计算（单步 `O(6N²)` 整数运算）。真正的异步只存在于「动画播放」与「渲染」，而 Agent 不应等待动画——动画与状态提交解耦（§8.3），所以契约层可以保持完全同步。这个能力是「Agent 与人类共用同一引擎」这一原则的直接收益。

```ts
// 成功分支是「payload 平铺在根对象上」，不是包在 data 里。
// 依据 PRD AC-42：applyMove 的返回值必须能在根上直接取到 move / layer_count /
// turn_amount / state_fingerprint_after / move_count / remaining_ms / observation_id。
// 若包一层 data，这些断言全部落空。失败分支统一收敛到 error 对象。
type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: ApiError };

interface ApiError {
  code: ErrorCode;
  message: string;          // 人类可读，一句话
  hint: string;             // 可执行的下一步建议
  retryable: boolean;
  details?: Record<string, unknown>;
}
```

### 7.2 命名约定（钉死）

- **方法名一律 camelCase**：`getChallengeInfo`、`observe`、`rotateView`、`applyMove`、`getLastActionResult`、`getProgress`、`submitSolution`、`getChallengeResult`、`abandonChallenge`。依据 PRD AC-41 的方法白名单，它是穷举而非举例——**不得**新增第 10 个方法，也不得挂任何对象型属性（引擎实例、状态数组、调试句柄）。
- **字段名一律 snake_case**，与 PRD 6.2 逐字一致（`observation_id`、`face_colors`、`remaining_ms`、`state_fingerprint_after` 等）。
- **引擎与规则层内部一律 camelCase**。
- 转换**只允许出现在 `agent/to-wire.ts` 一个文件中**，且必须是纯函数（无 IO、无时间、无随机）。
- 该文件配一条字段名快照测试（§11 的 T-21）：把一次真实投影的键名集合序列化成快照。任何人手滑改字段名会立刻红，而不是等到评测脚本跑空。

**为什么方法名用 camelCase 而字段名用 snake_case**：这两者由不同的文档钉死。方法名由 AC-41 的测试断言钉死（实现必须能在 `window.cubeAgent` 上按名字取到），字段名由 PRD 6.2 的观察数据格式钉死。两套命名共存会产生一处转换成本，但违背任一方的成本更高。

**`parseNotation` 的处置**：本架构早期版本把它列为第 9 个方法，与 AC-41 的白名单冲突。裁决：**它不挂在 `window.cubeAgent` 上**。校验能力保留在 engine 里，通过 `applyMove` 的结构化错误（`error.code` + `error.hint` + `error.details.normalized`）暴露给 Agent。Agent 若想「先试跑」，读错误即可，不需要 dry-run 入口。

理由：PRD 已经把 snake_case 定成对外数据格式。在边界上转一次，比在整条链路上都用非惯用命名更省心，也比「内部也 snake_case」更容易被 lint 规则约束。

### 7.3 类型定义

```ts
// ---------- 基础标量 ----------
type CubeSize = 2 | 3 | 4;
type FaceId = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';
type ColorId = FaceId;                      // 颜色 id 用面名，引擎内不出现色值
type SliceId = 'M' | 'E' | 'S';
type Pivot = FaceId | SliceId;
type Notation = string;                     // 归一化后的 ss-1 记法，单步

// ---------- 挑战状态机（与 PRD §2.1 一一对应，v1.10）----------
// PRD: idle / configuring / ready / running <-> paused / solved_pending / finished / review
type ChallengeStatus =
  | 'ready'               // 对应 PRD ready：题面已生成、未开始。观察一律拒绝
  | 'running'
  | 'paused'              // 真暂停：冻结计时 + 屏蔽输入 + 画面遮罩（PRD §7.2.1 / AC-73/74）
  | 'solved_pending'      // 已还原、结果锁定 solved，等待 submitSolution；计时继续但不判超时
  | 'ended_solved'
  | 'ended_timeout'
  | 'ended_move_limit'
  | 'ended_invalid_submission'  // 累计 3 次 NOT_SOLVED（AC-29）
  | 'ended_aborted'
  | 'ended_internal_error';

type EndedReason = 'solved' | 'timeout' | 'move_limit' | 'invalid_submission' | 'aborted' | 'internal_error';

// ---------- 规则 ----------
interface ChallengeRules {
  cube_size: CubeSize;
  time_limit_ms: number | null;      // null = 不限时
  move_limit: number | null;         // null = 不限步（HTM 口径）
  dust_mode: boolean;
  observation_policy: ObservationPolicy;
  metric: 'HTM';
  pause_allowed: boolean;
  pause_stops_clock: true;           // v1.10 真暂停：暂停冻结 elapsed_ms（PRD §7.2.1 / AC-73）
  max_submission_failures: 3;        // 第 3 次 NOT_SOLVED 终止（AC-29）
  freeze_on_solved: true;            // v1 恒为 true，冻结后必须 submit
  auto_submit: boolean;              // 人类默认 true，Agent 默认 false（PRD §7.4 / §13.2）
  rate_limit_per_frame: 60;          // 单帧 API 调用上限，超出 E_RATE_LIMITED
}

type ObservationPolicy =
  | { mode: 'full' }
  | { mode: 'three_face' }
  | { mode: 'single_face' }
  | { mode: 'after_move'; inner: 'three_face' | 'single_face' }
  | { mode: 'limited'; max_observations: number; inner: 'full' | 'three_face' | 'single_face' };

// ---------- 视角 ----------
interface ViewState {
  up: FaceId;
  front: FaceId;
  right: FaceId;
  matrix: [number[], number[], number[]];   // 3x3 整数矩阵，魔方轴 → 观察者轴
}

interface RotateViewRequestRelative { kind: 'relative'; axis: 'x' | 'y' | 'z'; quarter_turns: 1 | 2 | 3 }
interface RotateViewRequestAbsolute { kind: 'absolute'; up: FaceId; front: FaceId }
type RotateViewRequest = RotateViewRequestRelative | RotateViewRequestAbsolute;

// ---------- 观察 ----------
interface AllowedActions {
  notation_version: 'ss-1';
  faces: FaceId[];                   // 6 个面字母，恒定
  suffixes: string[];                // ['', "'", '2']
  layer_indices: number[];           // 合法层号；2 阶为 [1]（AC-07），否则 1..N
  wide_layer_counts: number[];       // 合法 nFw 的 n（不含全层）
  range_form: boolean;               // 是否支持 a-bFw
  slices: SliceId[];                 // 偶数阶为空
  rejected: string[];                // 语法合法但被拒绝的形态，如 '4Rw'
  orientation_notation: 'rotate_view_only';
  requires_fresh_observation: boolean;
  observations_left: number | null;
}

interface ChallengeInfo {
  challenge_id: string;
  run_id: string;
  status: ChallengeStatus;
  rules: ChallengeRules;
  notation_version: 'ss-1';
  move_catalog: Notation[];          // 全量合法单步，构成见 §5.6
}

interface Observation {
  observation_id: string;
  challenge_id: string;
  run_id: string;
  cube_size: CubeSize;
  seq: number;                        // 观察序号，从 1 开始，与步数无关
  status: ChallengeStatus;
  view: ViewState;
  visible_faces: FaceId[];
  hidden_faces: FaceId[];
  facelets: Partial<Record<FaceId, ColorId[][]>>;   // 只含 visible 的键，[row][col]
  masked: { mode: string; hidden_face_count: number } | null;
  allowed_actions: AllowedActions;
  progress: Progress;
}

interface Progress {
  move_count: number;                 // HTM 口径
  moves_left: number | null;
  elapsed_ms: number;
  remaining_ms: number | null;
}

// ---------- 操作结果 ----------
interface MoveMetrics {
  layer_count: number;                 // 本次实际转动层数（AC-22）
  turn_amount: 90 | 180;               // 只有两个值：90 与 180。方向由 move 字符串的 ' 承担，不用角度表达（见 §5.7）
  axis: 'x' | 'y' | 'z';               // 转轴（AC-22）
  layer_set: number[];                 // 记法层号，1-based，从被命名面算起，升序（AC-05：4 阶 Rw → [1,2]，3Rw → [1,2,3]，2R → [2]）
  htm: 1;                              // 本步 HTM 增量，恒为 1（AC-21）
  htm_layer: number;                   // = layer_count
  qtm: number;                         // = layer_count × turn_amount / 90
}

interface MoveResult {
  // ---- AC-42 强制要求平铺在根上的 8 个字段 ----
  move: Notation;                      // 归一化后的记法
  layer_count: number;
  turn_amount: 90 | 180;               // 只有 90 / 180，方向由 move 的 ' 承担
  state_fingerprint_after: string | null;  // observation_mode !== 'full' 时为 null，见 §7.8
  move_count: number;
  remaining_ms: number | null;
  observation_id: string | null;       // 回显「本次操作所依据的」观察 id
  // ---- 扩展字段（不违反 AC-41，AC-41 只约束方法不约束字段）----
  raw_input: string;                   // 调用方原样传入，便于复盘
  axis: 'x' | 'y' | 'z';
  layer_set: number[];
  metrics: MoveMetrics;
  observation_lag: number | null;      // 自那次显式 observe 起已执行的步数；0 表示基于最新观察
  op_id: string | null;
  deduplicated: boolean;
  merged_from: string[];               // AC-61：归并时长度 2，否则长度 1
  input_channel: 'api' | 'keyboard' | 'button';
  status: ChallengeStatus;
  solved: boolean;
  solved_state: 'uniform' | 'mixed' | 'invalid-scheme';   // 见 §3.4
  elapsed_ms: number;
  next_observation: Observation;       // 操作后的观察（其 id 不计入 AC-43 的回显语义，见 §7.5）
}

// ---------- 提交与结果 ----------
interface SubmitResult {
  accepted: boolean;
  status: ChallengeStatus;
  submission_failures: number;         // 累计 NOT_SOLVED 次数
  summary: RunSummary | null;          // 仅在 accepted 或挑战因此终止时非空
}

interface RunSummary {
  run_id: string;
  challenge_id: string;
  cube_size: CubeSize;
  status: ChallengeStatus;
  solved: boolean;
  move_count: number;
  metrics_total: {                     // AC-49 要求结果页展示三种口径
    htm: number;                       // Σ1
    htm_layer: number;                 // Σ layer_count
    qtm: number;                       // Σ layer_count × turn_amount / 90
  };
  elapsed_ms: number;                  // 活跃经过时间：总墙钟扣除全部 paused 段（PRD AC-73）
  wall_elapsed_ms: number;             // 总墙钟时间，含暂停
  paused_ms: number;                   // 暂停累计时长（记录并展示；已从 elapsed_ms 扣除）
  pause_count: number;
  solve_ms: number | null;             // 到首次达成还原的活跃经过时间（不含暂停）
  solve_move_count: number | null;
  time_limit_ms: number | null;
  move_limit: number | null;
  dust_mode: boolean;
  observation_policy_mode: string;
  ended_reason: EndedReason;
  submission_failures: number;
}

interface ChallengeResult {
  summary: RunSummary;
  puzzle: {
    scramble: string[];
    scramble_length: number;
    seed_text: string | null;
    seed_u32_hex: string | null;
    generation_mode: string;
    uniform_random_state: false;
    algorithm_version: number;
    notation_version: string;
    initial_state_fingerprint: string;
  };
  events: RunEvent[];                 // 完整事件日志，含每次观察与操作
  final_state_fingerprint: string;
}

interface RunEvent {
  seq: number;
  at_ms: number;
  kind: 'start' | 'pause' | 'resume' | 'observe' | 'rotate_view' | 'move' | 'solve' | 'submit' | 'timeout' | 'abort' | 'visibility_gap';
  observation_id?: string;
  raw_move?: string;
  normalized_move?: string;
  metrics?: MoveMetrics;               // AC-22：MoveEvent 必须携带四个计量字段
  merged_from?: string[];              // AC-61：归并事件长度 2
  input_channel?: 'api' | 'keyboard' | 'button';
  ok?: boolean;
  error_code?: string;
  observation_lag?: number;            // 自最近一次显式 observe 起已走的步数
  state_fingerprint_before?: string;   // AC-47 回放对账用
  state_fingerprint_after?: string;
  note?: string;
}
```

`RunEvent` 里同时记 `state_fingerprint_before` 与 `state_fingerprint_after` 是有意的：它让「回放」与「日志」可以互相校验，回放产出的指纹序列必须与日志逐条相等，否则说明引擎语义发生了漂移。这条也是 §11 的 T-19。

### 7.4 方法契约

| 方法 | 输入 | 成功输出 | 前置条件 | 失败情形（错误码） |
|---|---|---|---|---|
| `getChallengeInfo()` | — | `ChallengeInfo`（含 `rules` 与全量 `move_catalog`） | 挑战已创建 | 未创建 `E_NO_ACTIVE_CHALLENGE` |
| `observe(opts?)` | `{ requested_faces?: FaceId[] }` | `Observation` | `status ∈ {running, solved_pending}` | 未开始 `E_CHALLENGE_NOT_STARTED`；已结束 `E_CHALLENGE_ENDED`；暂停 `E_PAUSED`；请求含未授权面 `E_OBSERVATION_DENIED`；次数用尽 `E_OBSERVATION_BUDGET_EXHAUSTED`；`after_move` 模式未操作即观察 `E_OBSERVATION_REQUIRES_MOVE` |
| `rotateView(req)` | `RotateViewRequest` | `ViewState` + 本次产生的 `ViewEvent` | `status ∈ {ready, running, solved_pending}`（v1.10：ready 放开，预观察需要转视角） | 未开始 `E_CHALLENGE_NOT_STARTED`；暂停 `E_PAUSED`；`up` 与 `front` 共线 `E_VIEW_ORIENTATION_INVALID`；面标识非法 `E_VIEW_FACE_UNKNOWN` |
| `applyMove(move, opts?)` | 单步记法 + `{ op_id?, channel? }` | `MoveResult`（含 AC-42 的 8 个字段） | `status === 'running'` | §5.4 全部记法错误；`x/y/z` → `E_NOTATION_ORIENTATION_NOT_MOVABLE`；`solved_pending` → `E_CUBE_ALREADY_SOLVED`；已结束 `E_CHALLENGE_ENDED`；暂停 `E_PAUSED`；超时 `E_DEADLINE_EXCEEDED`；步数用尽 `E_MOVE_LIMIT_REACHED`；单帧超频 `E_RATE_LIMITED` |
| `getProgress()` | — | `Progress` + `status` | 无 | 无（无挑战时 `E_NO_ACTIVE_CHALLENGE`）；暂停时仍可用（AC-73） |
| `getLastActionResult(op_id?)` | 可选 opId | `MoveResult \| null` | 已有操作 | 指定 opId 不存在 `E_OP_ID_NOT_FOUND` |
| `submitSolution(note?)` | 可选说明 | `SubmitResult` | `status ∈ {running, solved_pending}`（`running` 下未还原返回 `E_NOT_SOLVED`；`solved_pending` 下成功结算） | 未还原 `E_NOT_SOLVED`（**不终止**，累计第 3 次转 `ended_invalid_submission`，AC-29）；已结束 `E_CHALLENGE_ENDED`；暂停 `E_PAUSED`；未开始 `E_CHALLENGE_NOT_STARTED` |
| `getChallengeResult(challenge_id, run_id?)` | 挑战 ID + 可选运行 ID | `ChallengeResult` | 该运行已结束 | 未结束 `E_RUN_NOT_FINISHED`；不存在 `E_RUN_NOT_FOUND` |
| `abandonChallenge(reason?)` | 可选原因 | `RunSummary`（`ended_reason === 'aborted'`） | `status ∈ {running, paused}` | 已结束 `E_CHALLENGE_ENDED`；未开始 `E_CHALLENGE_NOT_STARTED` |

**AC-41 的边界（钉死）**：`window.cubeAgent` 的自有属性集合必须**恰好**等于上表 9 个方法名，不得多也不得少。具体禁止：挂 `engine` / `state` / `scramble` 等对象型属性；挂 `getDebugState` / `getSolution` / `getScramble` / `getFullState`（AC-64 会逐个断言不存在）；挂 `parseNotation`（见 §7.2）；挂 `pause` / `resume`（AC-58：Agent 模式不支持暂停）。用 `Object.freeze` 冻结这个对象，并配一条单测断言 `Object.keys(window.cubeAgent).sort()` 等于硬编码的 9 个名字（T-32）。

`abandonChallenge` 是「主动结束」的唯一入口，对应 PRD AC-30 的人类「放弃」按钮。它不检查是否已还原，也不校验步数；调用后 `ended_reason === 'aborted'`，此前全部事件保留。

`paused` 状态下，`observe` / `applyMove` / `rotateView` / `submitSolution` 一律返回 `E_PAUSED`；`getProgress` 与 `getChallengeInfo` 仍可用（否则 Agent 无法判断自己处在什么状态）。**真暂停冻结计时**（`pause_stops_clock: true`）：`elapsed_ms` 扣除暂停段，`remaining_ms` 不变；错误文案必须含「计时已冻结」（PRD §7.2.1 / AC-73）。

三个校验点必须钉死顺序，否则会出现「同一步两个结论」：

1. **超时优先**。`observe` / `applyMove` / `rotateView` / `submitSolution` 四个方法的**入口第一行**都做「已超时则转 `ended_timeout` 并返回 `E_DEADLINE_EXCEEDED`」。不得只依赖 UI 倒计时，也不得只在 `applyMove` 里检查——否则 Agent 可以在最后一秒内反复 `observe` 拖住进程。**例外**：`solved_pending` 不判超时（PRD AC-75：还原优先，结果锁定 `solved`）。
2. **超时的主动触发**。除入口兜底外，`clock.ts` 在挑战开始时用 `setTimeout(剩余毫秒)` 主动把状态翻到 `ended_timeout`，满足 AC-28 的「200ms 内」。已知限制：后台标签页的 `setTimeout` 会被节流到 ≥1s，此时以入口兜底为准，并在事件日志里记 `visibility_gap`。这是浏览器行为，不假装能解决。
3. **还原优先于步数耗尽**。每步之后的判定顺序固定为「先判 §3.4 还原 → 再判步数上限 → 再判超时」，使 AC-27（`move_count == move_limit` 且该步还原时判定为 solved）自然成立。

### 7.5 `observation_id` 的生成与用途

PRD AC-43 把语义定死了：**`observe()` 返回 id X 之后，紧接着的 `applyMove()` 返回值里的 `observation_id` 必须等于 X。** 因此 `observation_id` 在 `applyMove` 里是「回显本次决策所依据的那次观察」，不是「下一次观察」。

两个计数器必须分开（这是 AC-43 与「决策质量分析」能同时成立的前提）：

| 计数器 | 何时递增 | 用途 |
|---|---|---|
| `explicitObsSeq` | 仅当调用方**显式**调 `observe()` | 决定 `applyMove` 回显的 `observation_id`（AC-43） |
| `issuedObsSeq` | 每次产出 `Observation` 对象（显式的 `observe()` 和 `applyMove` 返回的 `next_observation` 都算） | 观察 id 的唯一性来源，保证 `next_observation.observation_id` 不与已发出的 id 冲突 |

- 格式：`<run_id>:o<issuedObsSeq>`。
- **`observation_lag`** 由 `explicitObsSeq` 推导：`applyMove` 返回时 `observation_lag` = 自那次显式观察以来已成功的步数。lag = 0 表示「刚看过就动手」；lag = n 表示「连续走了 n 步没有重新观察」。这个值进事件日志，是事后分析 Agent 决策质量的核心指标——它能区分「看了最新状态后立刻决策」与「凭记忆闷头走」。
- **回放对齐**：每步操作的 `state_fingerprint_before` / `state_fingerprint_after` 与当时的 `observation_id` 一起落盘（对应 AC-47 的 `events[k-1].state_fingerprint_after`），回放时逐条比对。
- **审计「未观察就操作」**：默认不因 `observation_lag > 0` 而拒绝（Agent 连续执行已算好的算法是合法且常见的），只记录。仅当策略显式开启 `after_move` 的严格档（`requires_fresh_observation === true`）时才拒绝，错误码 `E_STALE_OBSERVATION`。
- `observation_id` **不可被客户端构造**：`window.cubeAgent` 不暴露任何写入口，id 只由引擎发出；`getChallengeResult` 返回的事件日志是唯一合法来源。

### 7.6 错误码表

命名口径与 PRD §12.1 一致：PRD 用无前缀短名便于引用，实现与 API 返回一律用 `E_` 前缀，最后一列给出对应关系。**`error.code` 字段返回的永远是 `E_` 形式**，短名只用于文档交叉引用。

| code | PRD 短名 | httpLike | 触发条件 | Agent 应如何处理 | retryable |
|---|---|---|---|---|---|
| `E_NO_ACTIVE_CHALLENGE` | — | 409 | 尚未创建挑战 | 先创建挑战 | false |
| `E_CHALLENGE_NOT_STARTED` | `NOT_STARTED` | 409 | `status ∈ {idle, configuring, ready}` | 调用开始（人类点「开始」或自动化触发） | false |
| `E_CHALLENGE_ENDED` | `ALREADY_FINISHED` | 409 | 已进入 `ended_*` | 改调 `getChallengeResult` | false |
| `E_PAUSED` | `PAUSED` | 409 | `status === 'paused'` | 等待恢复；计时已冻结 | true |
| `E_CUBE_ALREADY_SOLVED` | `ALREADY_SOLVED` | 409 | `status === 'solved_pending'` | 立即 `submitSolution` | false |
| `E_DEADLINE_EXCEEDED` | `TIMEOUT` | 408 | 剩余时间 ≤ 0，且 `status !== 'solved_pending'` | 停止操作，`getChallengeResult` | false |
| `E_MOVE_LIMIT_REACHED` | `MOVE_LIMIT` | 409 | 步数已达上限 | 尝试 `submitSolution`；若未还原则本局失败 | false |
| `E_RATE_LIMITED` | `RATE_LIMITED` | 429 | 单帧 API 调用超过 60 次 | 降低频率；这是防 Agent 死循环打爆主线程的护栏 | true |
| `E_NOT_SOLVED` | `NOT_SOLVED` | 422 | 提交时未还原 | 继续操作；累计 3 次后挑战以 `ended_invalid_submission` 终止 | true |
| `E_INVALID_SUBMISSION` | — | 409 | 已达 3 次 `NOT_SOLVED` | 本局作废，`getChallengeResult` | false |
| `E_INVALID_STATE` | `INVALID_STATE` | 422 | 导入题面不可还原；或 §3.4 手性检查得到 `det = -1` | 换题面；不得在本局继续 | false |
| `E_NOTATION_MALFORMED` | `INVALID_MOVE` | 422 | 语法不匹配 | 读 `hint`，可先 `parseNotation` 试跑 | true |
| `E_NOTATION_LOWERCASE` | `INVALID_MOVE` | 422 | 小写面字母 | 改大写 | true |
| `E_NOTATION_MULTIPLE_MOVES` | `INVALID_MOVE` | 422 | 单次传入多步 | 拆成多次 `applyMove` | true |
| `E_NOTATION_ORIENTATION_NOT_MOVABLE` | `ORIENTATION_NOT_MOVABLE` | 422 | 传了 `x/y/z` | 改调 `rotateView` | true |
| `E_MOVE_LAYER_OUT_OF_RANGE` | `INVALID_LAYER` | 422 | 层号越界 | 读 `allowed_actions.layer_indices` | true |
| `E_MOVE_COVERS_ALL_LAYERS` | `INVALID_LAYER` | 422 | 覆盖全 N 层 | 若意图是改朝向，用 `rotateView` | true |
| `E_SLICE_NOT_AVAILABLE` | `INVALID_MOVE` | 422 | 偶数阶用 `M/E/S` | 改用 `nF` 内层写法 | true |
| `E_OBSERVATION_DENIED` | `OBSERVATION_DENIED` | 403 | `requested_faces` 含未授权面 | 读 `details.allowed_faces`，改请求或先 `rotateView` | true |
| `E_STALE_OBSERVATION` | — | 409 | 严格档下用陈旧观察操作 | 先 `observe` | true |
| `E_OBSERVATION_REQUIRES_MOVE` | — | 409 | `after_move` 模式未操作即观察 | 先 `applyMove` | true |
| `E_OBSERVATION_BUDGET_EXHAUSTED` | — | 429 | 观察次数用尽 | 只能基于已有信息操作 | false |
| `E_VIEW_ORIENTATION_INVALID` | — | 422 | `up` 与 `front` 共线 | 重选两个相邻面 | true |
| `E_VIEW_FACE_UNKNOWN` | — | 422 | 面标识非法 | 用 `U/R/F/D/L/B` | true |
| `E_OP_ID_NOT_FOUND` | — | 404 | 指定 opId 无记录 | 不传 opId 取最近一次 | false |
| `E_OP_ID_CONFLICT` | — | 409 | 同一 opId 携带不同 move | 换新 opId | false |
| `E_RUN_NOT_FINISHED` | — | 409 | 查询未结束的运行 | 等结束后再查 | false |
| `E_RUN_NOT_FOUND` | — | 404 | 运行记录不存在 | 读历史列表 | false |
| `E_REPRODUCTION_MISMATCH` | — | 500 | 重放指纹与记录不符 | 不得继续本局，提示版本不一致 | false |
| `E_IMPORT_TOO_LARGE` | — | 413 | 导入题面 > 256KB | 精简后重试 | false |
| `E_IMPORT_UNSAFE_KEY` | — | 422 | 导入 JSON 含 `__proto__` / `constructor` / `prototype` 键 | 拒绝该题面 | false |
| `E_STORAGE_FULL` | `STORAGE_FULL` | 507 | localStorage 写入超配额 | 提示清理历史记录 | true |
| `E_SEED_OUT_OF_RANGE` | — | 422 | seed 数值越界 | 用 0..4294967295 | true |
| `E_SEED_INVALID` | — | 422 | seed 文本长度非法 | 用 1..128 字符 | true |
| `E_INTERNAL` | `INTERNAL` | 500 | 未预期错误 | 记录并上报；挑战转 `ended_internal_error` | false |

`httpLike` 列不表示本产品有 HTTP 层（它没有），**也不作为对外响应字段**。PRD v1.10 统一返回 `{ok:false, error_code}`；保留这一列只为一件事：当未来把 `window.cubeAgent` 包一层供外部 Agent 远程调用时，语义映射已经现成，不需要重新设计错误模型。

### 7.7 幂等性裁决

**结论：`applyMove` 支持可选的 `op_id` 去重，默认不启用。**

- 提供 `op_id` 且命中去重表 → 直接返回缓存的 `MoveResult`，`deduplicated: true`，**不执行转动、不消耗步数**。
- 提供 `op_id` 但命中且 `move` 参数不同 → `E_OP_ID_CONFLICT`（同一个键不允许有两种含义）。
- 未提供 `op_id` → 每次都视为新操作，无去重。
- 去重表是**有界环形缓冲（容量 256）**，只保留最近的成功结果；被淘汰的 `op_id` 再次出现时按「未命中」处理（而不是报错），因为一个相隔 256 步的重放请求几乎必然是调用方 bug，但它不应该让当前挑战挂掉。

为什么不做强制：人类操作路径不走 `op_id`，强制会产生两套语义；而 Agent 的重复提交来自传输层重试，属于调用方可以自行选择保护级别的问题。强制去重会让「故意重复同一步」（如 `R R` 中的两次 `R`）变得不可能，那是真实的语义损失。

### 7.8 观察权限模型

`ObservationPolicy` 的每一种模式，`observe()` 返回什么、藏什么，都必须逐条钉死：

| 模式 | `visible_faces` | `facelets` 的键 | `hidden_faces` | 备注 |
|---|---|---|---|---|
| `full` | 全部 6 面 | 6 个 | `[]` | `masked: null` |
| `three_face` | 当前视角下同时可见的 3 面 | 3 个 | 其余 3 个 | 三面随 `view` 变化，不是永久只能看这 3 面 |
| `single_face` | 仅 `view.front` | 1 个 | 其余 5 个 | 改面必须先 `rotateView` |
| `after_move`（内层为 three/single） | 同内层模式 | 同内层模式 | 同内层模式 | 额外约束：两次 `observe` 之间必须有一次成功的 `applyMove` |
| `limited` | 同内层模式 | 同内层模式 | 同内层模式 | 额外约束：`observations_left` 递减，归零后 `E_OBSERVATION_BUDGET_EXHAUSTED` |

**任何模式都不返回的东西**（这是权限模型的硬边界，与模式无关）：

- `scramble` 序列、`seed`、以及 `generation` 的全部字段（含 `algorithm_version`、`filter_policy`）
- `initial_state_fingerprint`、`final_state_fingerprint`、任何形式的状态指纹
- 完整 facelet 数组（即使 `full` 模式也只返回 `facelets`，不返回扁平 slot 数组——扁平数组会暴露 slot 编号约定，让「按索引猜位置」变得容易）

指纹被排除在**观察响应**之外是刻意的：它虽然只有 16 个字符，但它是一个**强预言机**。受限观察的 Agent 可以本地枚举候选状态、算指纹、与返回值比对，从而在完全看不到颜色的情况下反推出局面。

**`applyMove` 的 `state_fingerprint_after` 按观察模式分级（主理人裁决）。** 原有的「永远返回指纹」方案与受限观察直接冲突，已推翻：

| 观察模式 | `state_fingerprint_after` | 理由 |
|---|---|---|
| `full` | 字符串 | 没有隐藏信息，指纹只用于回放对账与 Agent 自校验 |
| `three_face` / `single_face` / `after_move` / `limited` | **`null`** | 返回一个可被本地枚举反推的哈希，等价于直接返回状态 |

为什么必须这样而不是「接受它」：2 阶状态空间约 3.67×10⁶，秒级可枚举建「指纹 → 局面」表。在 2 阶 + 受限观察下，32 位指纹是**完整泄露**，不是「削弱」——它把作弊成本从 0 抬到 10 秒，等于蒙尘在 2 阶上完全失效。受限观察的全部意义就是限制信息，在 API 里造一个假的安全感没有意义。

三点连带约定：

1. **挑战结束后照常返回**：`getChallengeResult` 与结果页在 `ended_*` 状态下返回 `final_state_fingerprint`，此时没有隐藏信息可泄露。回放对账用的是事件日志里的 `state_fingerprint_after`，它在结束时一并解禁。
2. **`null` 不是漏实现**，是设计。`to-wire.ts` 必须有注释说明，T-35 要断言受限模式下为 `null`、`full` 模式下为 32 位十六进制串。
3. `observation_lag`、`move_count`、`layer_count`、`turn_amount` 等**结构性元数据不受影响**——它们泄露的是「我走了几步、转了几层」，不是「盘面长什么样」。

`requested_faces` 参数的语义严格遵循 PRD 的 `OBSERVATION_DENIED`：**只要请求集合里含有任何一个未授权面，整个请求被拒绝**，返回 `E_OBSERVATION_DENIED`，`details.allowed_faces` 给出当前允许的面集合。

不做「静默裁剪只返回交集」的原因：裁剪会让 Agent 以为自己看到了想看的全部，从而在错误的信息完整度假设上继续推理——这类错误是静默的，事后极难归因。宁可显式失败，让它改请求或先 `rotateView`。

`after_move` 模式的实现细节（钉死两个不同的判据，不要混为一谈）：

| 判据 | 含义 | 字段 | 拒绝码 |
|---|---|---|---|
| 观察间隙 | 两次 `observe` 之间必须有一次成功的 `applyMove` | 由模式本身表达，无需额外字段 | `E_OBSERVATION_REQUIRES_MOVE` |
| 观察新鲜度 | `applyMove` 携带的 `observation_id` 必须指向当前最新一次观察（`observation_lag === 0`） | `allowed_actions.requires_fresh_observation` | `E_STALE_OBSERVATION` |

`after_move` 模式恒开启观察新鲜度判据（`requires_fresh_observation: true`），因为该模式的产品意图就是「每一步都必须建立在一次观察之上」。`limited` 模式只约束次数，不开启新鲜度判据。其余模式两者都不启用——Agent 连续执行自己已经算好的算法是合法且常见的行为，此时 `observation_lag > 0` 只被记录、不被拒绝。

### 7.9 蒙尘门控的落地方式

```
真实状态（engine 内存中的 Uint8Array）
        │
        ├──► projection.ts ──► Observation（受观察策略约束，唯一的对外出口）
        │       └─ 未授权面：键不存在，且计入 hidden_faces
        │
        └──► render 层 ──► 屏幕（受同一套授权面约束：未授权面用遮蔽材质）
```

三个必须说清楚的点：

1. **`ready` 阶段（未开始）**：`observe` 一律返回 `E_CHALLENGE_NOT_STARTED`，不返回任何颜色。此时渲染层把整个魔方显示为统一遮蔽外观。PRD 2.2 要求「隐藏状态必须由数据访问层执行，而不是用 CSS 遮住」——在纯前端里对应的做法是：**`projection.ts` 是颜色的唯一出口，`ready` 阶段这个出口整体关闭**；渲染层之所以能画遮蔽外观，是因为它拿到的是「遮蔽指令」而不是颜色数据。
2. **进行中**：观察权限由 `projection.ts` 执行，渲染层复用同一个「授权面集合」的函数（`observation-policy.ts` 暴露 `visibleFaces(policy, view)`，被投影与渲染共同调用），保证「屏幕上能看到的」与「API 能读到的」不会打架。
3. **边界必须明说**：**这不等于安全沙箱。** 状态在浏览器内存里，用户可以通过 DevTools 读内存、改源码、打补丁。蒙尘模式约束的是「诚实 Agent 的信息获取路径」，用于评测「在信息受限下求解」的能力，**不是防作弊**。这条必须进 PRD 与 UI 文案，产品不得以「防作弊」作为卖点。

### 7.10 180° 归并事件（可合并事件，open event）

PRD AC-61 / AC-62 / AC-63 / AC-69 一起定义了「双击同一面键 → 合并成一次 180° 转动」的行为，且要求：

- 事件流只新增 **1** 条 `MoveEvent`，`move_count` 净增 **1**
- 该事件的 `turn_amount == 180`、`merged_from.length == 2`
- **不得**出现任何逆操作事件（不能先 `R` 再 `R'`）
- 旋转角度轨迹必须单调 0° → 90° → 180°（不能 90° → 0° → 180° 闪回）
- 与 Agent 直接提交 `X2` 产生的 `MoveEvent` 在 `move` / `turn_amount` / `layer_set` / `axis` / `state_fingerprint_after` 上完全一致
- 窗口内到达**不同**面键时必须立即执行且不回退前一步（AC-69）

这四条同时成立，只有一种实现方式：**事件在窗口关闭时才定稿（open event）**。

```
输入到达（键盘面键 / 按钮 / applyMove）
        │
        ▼
engine 立即执行（状态推进，动画立即开始，零输入延迟）
        │
        ▼
event-log 检查「未定稿尾部事件」是否可合并
   ├─ 无尾部事件 → 新建 open 事件，deadline = now + 300ms
   ├─ 有且 (face, axis, layer_set) 相同、且在 deadline 内、且自它之后无其他输入
   │      → 定稿为 turn_amount 180、merged_from = [raw1, raw2]，move_count +0
   ├─ 有但键不同 → 立即定稿旧事件（保持 90°）并新建 open 事件（AC-69）
   └─ 有且已过 deadline → 立即定稿（90°）后按新事件处理
        │
        ▼
定时器到期 / 其他任何输入 / 挑战结束 → 定稿全部 open 事件
```

四条硬约束：

1. **状态推进与事件定稿解耦**。engine 永远立即推进（`R` 然后 `R` 与 `R2` 的状态完全相同，这是 ① 成立的原因）；`move_count` 与事件流由 event-log 在定稿时计算。因此 `getProgress().move_count` 读的是「已定稿数 + 未定稿 open 事件数」，不会出现「先加后减」。
2. **不可回退的动画**。turn-animator 的目标角度由 open 事件的当前 `turn_amount` 决定；合并时目标从 90° 平滑延长到 180°（只延长、不回退），满足 AC-62 的单调性。这也是为什么 turn-animator 必须接受「修改目标角度」而不是「追加一次旋转」。
3. **还原会立即关闭窗口**（两个时点都要覆盖）：
   - **第一步就还原**：open 事件当场定稿为 90°，不再开窗口等待第二击；
   - **第二击生效后才还原**（窗口期内）：第二击照常执行并合并成 180°，但**定稿立即发生**，绝不因为「还差 N 毫秒才到 300ms」而让 `solved_pending` 延迟。冻结与定稿同一帧完成。
   已确认这是 `solved_pending` 不会被合并窗口拖延的唯一实现方式；否则用户在还原瞬间会看到状态没冻结、按钮还能按的假象。
4. **通道无关的定稿器**。合并判定发生在 `challenge/input-arbiter.ts`，键盘、按钮、`applyMove` 三条路径都经过它（AC-45 / AC-70 的同轨要求）。`input_channel` 只作为记录字段，不参与是否合并的判定。

**计步口径的口径冲突与最终裁决（已定，R13）**

三条原始要求互斥：每次 `applyMove('R')` 计 1 步（AC-21） vs 双击同面键净增 1 步（AC-61） vs 「同样的按键序列与同样的 `applyMove` 序列 `move_count` 必须一致」（AC-70 原措辞）。

主理人裁决：**统一到「按意图比较」，不再按输入比较。**

> 双击 `R R` 表达的是 **`R2` 这个意图**，不是 300ms 内做了两次独立转动 → 产生 1 条 `R2` 事件、计 1 步，与直接按 `R2` 完全等价。
> `applyMove('R')` 连调两次表达的是**两次独立转动** → 计 2 步。合并它才是篡改调用方的意图。
> 因此人机公平性不是「按键序列相同时步数相同」，而是**同一个表达出来的意图恒得同一个 `move_count`**。人类用双击表达 `R2`，Agent 用 `applyMove('R2')` 表达 `R2`，两者都是 1 步。

落地要求：

- `input-arbiter.ts` 保留合并开关 `coalesceDoubleTap`，**默认开**；Phase 3 按此实现，不等 PRD 文案。
- `applyMove` 不参与合并（它已经是「意图级」入口）。
- PRD v1.10 的 AC-70 已改为「经 §5.4.1 输入整形后的规范化 move 序列」，与本节口径一致；不再保留“按原始输入比较”的表述。
- 合并开关的状态写进事件日志（`coalesced: true`），这样事后分析能区分「人类双击」与「人类按了两次」。

### 7.11 真实观察示例

以下三份数据不是占位符，是从已验证的引擎实现里跑出来的真实状态（打乱序列与指纹同 §6.3 的样例）。

**2 阶 + 完整观察**（打乱 `R U F'`，再执行 `R`）：

```json
{
  "ok": true,
  "observation_id": "c2-g1-8a2c4e7d0f47d517#r1:o5",
  "challenge_id": "c2-g1-8a2c4e7d0f47d517",
  "run_id": "c2-g1-8a2c4e7d0f47d517#r1",
  "cube_size": 2,
  "seq": 5,
  "status": "running",
  "view": {
    "up": "U",
    "front": "F",
    "right": "R",
    "matrix": [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ]
  },
  "visible_faces": ["U", "R", "F", "D", "L", "B"],
  "hidden_faces": [],
  "facelets": {
    "U": [
      ["D", "U"],
      ["R", "U"]
    ],
    "R": [
      ["R", "B"],
      ["B", "B"]
    ],
    "F": [
      ["D", "F"],
      ["L", "R"]
    ],
    "D": [
      ["U", "D"],
      ["B", "D"]
    ],
    "L": [
      ["L", "F"],
      ["U", "F"]
    ],
    "B": [
      ["L", "F"],
      ["L", "R"]
    ]
  },
  "masked": null,
  "allowed_actions": {
    "notation_version": "ss-1",
    "faces": ["R", "L", "U", "D", "F", "B"],
    "suffixes": ["", "'", "2"],
    "layer_indices": [1],
    "wide_layer_counts": [],
    "range_form": true,
    "slices": [],
    "rejected": ["Rw", "2R", "2L", "2U", "2D", "2F", "2B"],
    "orientation_notation": "rotate_view_only",
    "requires_fresh_observation": false,
    "observations_left": null
  },
  "progress": {
    "move_count": 4,
    "moves_left": null,
    "elapsed_ms": 12480,
    "remaining_ms": 1187520
  }
}
```

**3 阶 + 三面观察**（打乱 6 步后执行 `R`；注意 `D/L/B` 三个键根本不存在）：

```json
{
  "ok": true,
  "observation_id": "c3-g1-43f60ef051fc99d6#r1:o8",
  "challenge_id": "c3-g1-43f60ef051fc99d6",
  "run_id": "c3-g1-43f60ef051fc99d6#r1",
  "cube_size": 3,
  "seq": 8,
  "status": "running",
  "view": {
    "up": "U",
    "front": "F",
    "right": "R",
    "matrix": [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ]
  },
  "visible_faces": ["U", "R", "F"],
  "hidden_faces": ["D", "L", "B"],
  "facelets": {
    "U": [
      ["U", "U", "F"],
      ["U", "U", "F"],
      ["B", "D", "B"]
    ],
    "R": [
      ["R", "L", "L"],
      ["R", "R", "L"],
      ["D", "L", "L"]
    ],
    "F": [
      ["L", "F", "U"],
      ["B", "F", "D"],
      ["B", "R", "R"]
    ]
  },
  "masked": {
    "mode": "three_face",
    "hidden_face_count": 3
  },
  "allowed_actions": {
    "notation_version": "ss-1",
    "faces": ["R", "L", "U", "D", "F", "B"],
    "suffixes": ["", "'", "2"],
    "layer_indices": [1, 2, 3],
    "wide_layer_counts": [2],
    "range_form": true,
    "slices": ["M", "E", "S"],
    "rejected": ["3Rw"],
    "orientation_notation": "rotate_view_only",
    "requires_fresh_observation": false,
    "observations_left": null
  },
  "progress": {
    "move_count": 7,
    "moves_left": null,
    "elapsed_ms": 12480,
    "remaining_ms": 1187520
  }
}
```

**4 阶 + 单面观察**（打乱 `Rw U2 Fw' L`，再执行 `Rw`；只返回 F 面）：

```json
{
  "ok": true,
  "observation_id": "c4-g1-9389ec5e7e0dc918#r1:o6",
  "challenge_id": "c4-g1-9389ec5e7e0dc918",
  "run_id": "c4-g1-9389ec5e7e0dc918#r1",
  "cube_size": 4,
  "seq": 6,
  "status": "running",
  "view": {
    "up": "U",
    "front": "F",
    "right": "R",
    "matrix": [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ]
  },
  "visible_faces": ["F"],
  "hidden_faces": ["U", "R", "D", "L", "B"],
  "facelets": {
    "F": [
      ["D", "D", "F", "L"],
      ["D", "D", "F", "L"],
      ["L", "L", "F", "U"],
      ["L", "L", "U", "U"]
    ]
  },
  "masked": {
    "mode": "single_face",
    "hidden_face_count": 5
  },
  "allowed_actions": {
    "notation_version": "ss-1",
    "faces": ["R", "L", "U", "D", "F", "B"],
    "suffixes": ["", "'", "2"],
    "layer_indices": [1, 2, 3, 4],
    "wide_layer_counts": [2, 3],
    "range_form": true,
    "slices": [],
    "rejected": ["4Rw", "1-4Rw"],
    "orientation_notation": "rotate_view_only",
    "requires_fresh_observation": false,
    "observations_left": null
  },
  "progress": {
    "move_count": 5,
    "moves_left": null,
    "elapsed_ms": 12480,
    "remaining_ms": 1187520
  }
}
```

---

## 8. 渲染架构

### 8.1 方案对比与结论

| 维度 | 贴纸 plane 方案 | cubie mesh 方案 |
|---|---|---|
| 与 facelet 状态的映射 | 需要引入「贴纸身份随块移动」的二次绑定，颜色与位置双通道 | 每个 cubie 的可见面颜色由状态派生（纯函数），无需身份绑定 |
| 动画实现 | 需要在动画结束瞬间「换色」，容易出现颜色跳变的边界帧 | 物理旋转，结束瞬间颜色重算后与物理结果完全一致 |
| 4 阶规模 | 96 个平面 | 56 个 body + 96 个贴纸平面 |
| 视觉质感 | 只能表现平面色块，缺少块间缝隙与倒角 | 可表现体块、缝隙、倒角、内黑体 |
| 倒角实现 | 需自绘圆角矩形路径 | `RoundedBoxGeometry` 现成 |
| 实现风险 | 状态同步风险高 | 建模代码稍多，但同步逻辑是纯函数 |

**结论：cubie mesh 方案。** 关键设计不是「选 cubie」，而是下面这条：

> **每个 cubie 只回答「我这一格朝外的面该显示什么颜色」，颜色由 facelet 状态逐面派生；渲染层不持有任何独立的魔方语义（不维护块身份、不维护块朝向）。**

后果：

- 状态与视觉之间没有第二份真相，不存在「渲染状态与引擎状态不一致」这一类 bug。
- 动画期间 cubie 携带的是转前的颜色（正确），动画提交后颜色按新状态重算（正确），两者在拓扑上必然一致（因为置换正是把那些面片搬到了那一格）。视觉无缝，无需「换色补偿」。
- 引擎换实现（例如未来换 cubie 状态模型）时，渲染层只需要换一个派生函数。

### 8.2 场景组成

- `WebGLRenderer`：`antialias: true`，`powerPreference: 'high-performance'`。**默认关闭 shadowMap**（4 阶 96 贴纸开阴影在集显上会掉帧，是已知的掉帧源）。
- 光照：1 个环境光 + 2 个方向光（主光 + 补光），保证六个面在默认视角下都有可辨识亮度差，不出现「某一面全黑」。**光照只作用于挑战开始后的正常材质，不作用于遮蔽材质**（见下）。
- 背景：纯色，取自 Token（`--surface-canvas`）。
- cubie body：`RoundedBoxGeometry(0.95, 0.95, 0.95, 2, 0.08)`，单材质（体色 Token `--cube-body`）。
- 贴纸：每个 cubie 每个朝外方向一个圆角薄平面，尺寸 `0.82`，法向偏移 `0.476`，材质 `MeshStandardMaterial`（`roughness` 高、`metalness` 低，避免在深色背景上反光失控）。贴纸是 body 的子节点，局部变换在构造时固定、永不修改。贴纸间隙读 `--cube-sticker-gap`，内描边读 `--cube-sticker-edge`（渲染层只读取、不写死数值）。
- **层轮廓线（`layer-outline`）**：一个复用的 `LineSegments2` 对象（不每次新建），顶点集由「参与转动的 cubie 集合 → 该板块的 12 条外轮廓棱」计算。「参与转动的 cubie 集合」直接取引擎的层判定结果，渲染层不重复实现层语义。
- draw call 上界：`56 + 96 + 1 = 153`（4 阶，含层轮廓线）。这是一个明确的性能预算数字，见 §8.5。

**层轮廓线为什么不可省略、以及它的四条实现约束**

面键只编码「转哪个面」，不编码「转哪一层」。视角转到背面后，用户看到的是一条斜向的边在动，无法确认是第 1 层还是第 2 层；4 阶有 4 层，没有板块外轮廓，实际操作退化为盲猜。因此这不是装饰，是可操作性的必要条件。

| 约束 | 要求 |
|---|---|
| 语义 | 画的是**板块外轮廓**（3×3 转 R 时是 9 个 cubie 组成的 3×3×1 板块的棱），不是 9 张贴纸各自的边框 |
| 线宽 | 屏幕空间恒定 `2px`，用 `Line2` / `LineMaterial` 的 `resolution` 缩放，不随相机缩放变化 |
| 生命周期 | 转动期间常显；转动结束后 `120ms` 淡出；悬停预高亮复用**同一对象**改材质 alpha（30%），不新增对象 |
| draw call | 恒为 `+1`（单对象复用），计入 §8.5 的预算表 |

**遮蔽材质必须不受光（钉死）**

蒙尘 / 未授权面使用 `MeshBasicMaterial` 单色（Token `--cube-masked`），**不得**使用 `MeshStandardMaterial`，也不得被环境光/方向光影响。原因：带光照的材质其明暗随法向变化，同一个面会渲染出多个亮度值，直接违反「ready 态画布上不出现任何贴纸颜色、遮蔽面只有一种像素色」的验收要求。同理，遮蔽状态下**不渲染**贴纸网格、不应用 `--cube-sticker-edge` 内描边、不叠纹理与噪点，只渲染统一外壳。

**蒙尘态下相机拖拽必须保持可用**（成本为零、收益很高）：拖拽只改相机、不泄露任何颜色、不计步。它是区分「已就绪」与「加载中」最有效的信号——加载中的东西不会跟着鼠标转。

**像素验收改用确定性探针**（替代原来「扫全画布」的口径）：开 `antialias: true` 后 MSAA 必然在轮廓处产生过渡色，「除背景外颜色种类 ≤ 2」无论收窄到多大区域都过不了。改为按相机矩阵计算固定探针点并断言色差，详见 §8.8。

优化路径（不在 v1 范围，但留好接口）：body 合并为单个 `InstancedMesh`（56 实例）可把 draw call 降到 `1 + 96 + 1`；贴纸若进一步合并则动画需要写 per-instance 矩阵。**v1 先不做**，因为 153 在桌面端不是瓶颈，而提前上实例化会让动画代码复杂度上一个台阶。

### 8.3 转动动画与浮点漂移

这是本类项目的经典坑：如果每步动画结束时用 `object.quaternion.multiply(delta)` 或 `position.add(offset)` 累积，误差会随步数线性增长，几百步后魔方会肉眼可见地「歪掉」和「散开」。

**规则（钉死）**：任何 `Object3D` 的变换都**不得**做累积乘法或加法。变换的唯一来源是「整数格坐标 → 精确变换」的纯函数。

```
提交时序（一次 applyMove）：
  1. 记下受影响的 cubie 集合（用 engine 的同一份层判定，不重复实现）
  2. 为这几个 cubie 建一个临时 pivot Group（世界原点，无偏移）
  3. 把它们 reparent 到 pivot 上（three 的 Group.attach 保持世界变换）
  4. 每帧：pivot.quaternion.setFromAxisAngle(axisVec, angle * easedT)
         其中 angle ∈ { -90°, +90°, +180° }（**带符号**，来自整数表）；
         注意：对外的 turn_amount 只有 90/180 两个值，符号只存在于渲染内部
  5. 动画到 t = 1 时：
       a. 向 engine 提交 move（状态推进，整数运算）
       b. 对参与的每个 cubie，把 position / quaternion 直接 set 为
          「由当前整数格坐标与整数朝向矩阵重算出的精确值」
       c. reparent 回静态父节点
       d. 把 pivot.quaternion 设为 identity 并复用（或销毁）
       e. 按新状态重算这 96 个贴纸的颜色
  6. 渲染循环不参与任何状态判断
```

关键点：

- **精确值的来源是整数**：`position = latticeToWorld(integerPos)`；`quaternion` 只从整数 3×3 朝向矩阵一次性 `setFromRotationMatrix`。所有角度都是 `π/2` 的整数倍，二进制可精确表示，因此不存在「累积」这件事——每步都是重新计算而非叠加。
- **动画不可被打断，但输入可以排队**：`turn-animator` 维护一个长度上限 8 的输入队列。超长队列直接丢弃并记录一次 `coalesced` 事件，避免「按住键盘 30 秒后魔方还在转 2 分钟」。这一条同时保护了人类操作体验与 Agent 的批量提交。
- **`solved_pending` 的冻结发生在引擎层，不发生在动画层**：提交顺序中 a 步在 b 步之前，因此「冻结」一定先于视觉落位。渲染层不需要知道冻结的存在。
- **可测性**：`turn-animator` 只操作 `Object3D` 图，不接触 `WebGLRenderer`。three 的数学类在 Node 里可用，因此**动画变换逻辑可以在 vitest 的 node 环境里直接单测**，无需 WebGL（§11 的 T-13）。

#### 8.3.1 采样契约（中间帧必须可观测）

「终态精确」不足以验收——转动过程的每一帧角度也必须正确，否则会出现「落位对、过程错」的动画（例如先转到 180° 再退回 90° 的闪回，终态依然正确）。因此 `turn-animator` 必须暴露可注入时钟的采样接口：

```ts
interface TurnAnimator {
  /** 注入时钟：生产环境传 performance.now 包装，测试传手动推进的假时钟 */
  setClock(now: () => number): void;
  /** 按当前时钟推进一帧（不调用 requestAnimationFrame） */
  tick(): void;
  /** 采样任意时刻的转动状态，纯函数，无副作用，可任意次调用 */
  sampleAt(t: number): { angleDeg: number; easedT: number };
  /** 当前目标角度（归并时会被修改：绝对值只增不减）。带符号：-90 / 90 / 180 */
  getTargetAngleDeg(): -90 | 90 | 180;
  /** 采样序列钩子：每帧 tick 后把 angleDeg 追加进环形缓冲，供 AC 的单调性断言读取 */
  getAngleTrace(): readonly number[];
}
```

需要机器断言的三条等式与不变量：

| 断言 | 内容 |
|---|---|
| 角度等式 | `sampleAt(t).angleDeg === angleBase * ease(sampleAt(t).easedT)`，其中 `angleBase ∈ {-90, 90, 180}` 来自**整数表**（不是从时间反推）。`angleBase` 的绝对值即对外的 `turn_amount`（90 或 180），符号只用于渲染方向 |
| 归一化等式 | `sampleAt(t).easedT === clamp((t - t0) / duration, 0, 1)`，`ease` 单调递增且 `ease(0) === 0`、`ease(1) === 1` |
| 单调性不变量 | `getAngleTrace()` 在一次转动（含归并延长）过程中**单调不减**，且首项为 0、末项为最终 `angleBase` |

三条实现纪律：

1. **`sampleAt(t)` 必须是纯函数**：给定 `t` 返回同一个结果，不受内部游标影响。这样才能对同一时刻反复采样做断言（例如断言 `t=0.5` 的两次采样相等），也才能在归并后重放已过去的时刻。
2. **测试不注入 `requestAnimationFrame`**。测试用 `setClock` + 手动 `tick()` 驱动，整个动画（含 500 步压力测试）在 node 里秒级跑完，不依赖浏览器帧调度。这是 T-13 与 T-34 能进 CI 的前提。
3. **归并延长只改 `angleBase`**（90 → 180），不改已过去的 `easedT` 曲线。这是 AC 要求「角度轨迹 0→90→180 单调、不得出现 90→0→180」的实现落点：延长而不是重放，因此历史帧的采样值不会变。

### 8.4 相机

**结论：用 `three/addons/controls/OrbitControls.js`，只自写一个薄封装 `camera-rig.ts`。**

理由：连续轨道、阻尼、触控、缩放、极角限制这些都是现成的、被大量项目验证过的手感细节，自己写反而更容易在移动端出问题。需要自写的只有两件事：

1. **离散 `view` ↔ 相机位姿的绑定**：`camera-rig` 把 `(up, front)` 映射到球坐标 `(radius, phi, theta)`，切换时用 220ms 的球坐标插值过渡（不用四元数 slerp，球坐标插值在轨道相机上更稳）。
2. **输入仲裁**：`enablePan = false`（避免魔方被拖出视野），`minPolarAngle/maxPolarAngle` 限制在 `[0.15π, 0.85π]`（避免拖到正上/正下时万向锁导致手感发飘），`enableDamping = true` 且每帧 `controls.update()`。

**鼠标拖拽只转相机，不转层（v1 明确不做 drag-to-turn）。** 理由：drag-to-turn 需要「射线命中面片 → 判断拖拽方向 → 抢占 OrbitControls 的 pointerdown」一套仲裁层，且手势冲突在触控板上尤其难调。PRD 4.3 要求的层转动已由「按钮矩阵 + 键盘」完整覆盖。这条是 out-of-scope 项（§12），如果 PM 后续要加，必须先补手势仲裁设计，不能顺手加。

离散 `view` 与连续相机的关系（钉死）：**拖动只改相机，不改 `view`。** 受限观察模式下渲染层按 `view` 的授权面显示，所以用户能把相机拖到看见 D 面，但那三个未授权面仍是遮蔽材质——「能拖到」不等于「能看到」。这正是「视觉展示、真实状态、观察权限三者独立」的落地方式。

### 8.5 帧预算与 60fps 判定标准

判定标准必须可机器采样，否则「流畅」是不可验收的词。

| 指标 | 阈值 | 采样方式 |
|---|---|---|
| 帧间隔 p50 | ≤ 16.7 ms | `requestAnimationFrame` 时间戳差，在一次完整转动动画窗口内采样 |
| 帧间隔 p95 | ≤ 20 ms | 同上 |
| 单帧最大间隔 | ≤ 33 ms | 同上 |
| 长帧（> 50 ms）计数 | 0 | 同上 |
| 单帧 JS 耗时（update + render 调用） | ≤ 8 ms | `performance.now()` 包住一帧的两个调用 |
| 转动动画时长 | 默认 180 ms，可配 `[0, 400]`（下限 60ms，低于此值人眼读不出方向） | 配置项 `--dur-turn` |
| draw call | ≤ 153（4 阶：56 body + 96 贴纸 + 1 层轮廓） | `renderer.info.render.calls` 每帧采样 |
| 层轮廓线对象数 | 恒为 1（复用，不随层数增长） | 断言语义：`scene` 中 `LineSegments2` 类型对象计数 === 1 |

验收方式：4 阶，连续执行 200 步随机转动，用内置 `frame-budget.ts` 输出上表；同时用 Chrome Performance 面板人工复核一次。两条都过才算达标。

降级策略（必须显式，不得静默）：连续 10 帧 p95 > 20 ms 时，按顺序降级 `[关闭贴纸圆角 → devicePixelRatio 上限降到 1.5 → 动画时长降到 90ms → 改为瞬时落位]`，并在 UI 上挂一个可见的「性能已降级」标记与当前档位，写进事件日志。静默降级会让「为什么我的测试机看起来不一样」变成不可诊断的问题。

`devicePixelRatio` 上限固定 `Math.min(dpr, 2)`。4 阶在 3x 屏上按 3x 渲染是纯粹的浪费。

### 8.6 尺寸与缩放策略

目标：2/3/4 阶切换时，魔方在屏幕上的视觉大小基本一致（约视口高度的 55%）。

- 世界单位下 `cellSize = 1`，cubie 边长 `0.95`（留 0.05 缝隙）。魔方整体边长即 `N`。
- 相机 `fov = 45°`（垂直），固定不变。
- 相机到原点距离 `D = R / sin(fovY/2) / fillRatio`，其中 `R = N·cellSize·√3/2` 是包围球半径，`fillRatio ≈ 0.9` 表示允许占满可视角的 90%。

代入得 `D ≈ 2.51·N`，取 `D = 2.6·N` 留 4% 余量。切换阶数时只改 `D`（通过 `OrbitControls` 的相机距离），不改 `fov`——改 `fov` 会连带改变透视强度，让三阶看起来比四阶「更广角」，视觉上不统一。

`resize` 处理：监听容器尺寸，更新 `camera.aspect` 与 `renderer.setSize`；`setPixelRatio` 受 §8.5 的上限约束。

### 8.7 色彩 Token（不写色值）

引擎里没有任何色值（颜色 id 就是面名）。渲染层需要把 `ColorId` 映射到实际颜色，这个映射的唯一落点是 `render/palette.ts`，它的输入是 CSS 自定义属性。**色值的唯一定义点是 `ui/tokens.css`**（设计师产出的 `docs/design-tokens.css` 即该文件的来源，它同时提供本文所需名字的一等别名）。

渲染层实际会读取的 Token：

| Token | 用途 |
|---|---|
| `--cube-face-u` / `--cube-face-r` / `--cube-face-f` | 三个面的贴纸色 |
| `--cube-face-d` / `--cube-face-l` / `--cube-face-b` | 另三个面的贴纸色 |
| `--cube-body` | cubie 体色（缝隙与倒角可见的那一层） |
| `--cube-sticker-gap` | 贴纸间隙比例（数值型，渲染层直接读） |
| `--cube-sticker-edge` | 贴纸内描边，防红面在深底上丢轮廓 |
| `--cube-masked` | 蒙尘遮蔽外观（必须配合 unlit 材质，见 §8.2） |
| `--surface-canvas` | 画布背景 |

UI 层使用的语义 Token（渲染层不读，但视觉验收要看）：`--surface-panel`、`--text-primary` / `--text-secondary` / `--text-muted`、`--accent-primary`、`--accent-success` / `--accent-warning` / `--accent-danger`、`--border-subtle` / `--border-strong`、`--focus-ring`。

**`--accent-primary` 的语义（已裁决，钉死）**

> `--accent-primary` 保留给「进行中 / 当前选中 / 焦点」这类**状态指示**，**不得用作主按钮填充**。主按钮填充用 `--action-bg`（白实心，对面板背景 15.52:1）。理由是魔方六色已占满色相空间：`--accent-primary` 与 F 面绿的 L* 只差 1.6，中栏就是六色魔方，主按钮用青实心会与 F 面绿无法区分——这是可辨识性缺陷，不是风格偏好。

架构早期版本在 Token 表注释里把 `--accent-primary` 写成「按钮、主动作」，该表述**作废**。实现时若按旧语义取色，会出现两种主按钮并存。

渲染层（`palette.ts`）只读 7 个 Token：`--cube-face-*`（6 个）+ `--cube-masked`。`--body` 类与全部 UI 语义色都是 CSS 侧的事，渲染层不碰——这保证「引擎/渲染层零色值」这条约束在代码上是可检查的。

实现细节：`palette.ts` 在启动时用 `getComputedStyle(document.documentElement).getPropertyValue('--cube-face-u')` 读取一次，转换后交给 `THREE.Color`，并缓存。**不得**在 `palette.ts` 里写任何色值，也不得在 `render/` 其他文件里出现 `getPropertyValue` 调用——令牌读取只允许在 `palette.ts` 一处，否则主题切换时会出现「改了一个地方没改另一个」。这条让配色调整不需要碰任何 TS 代码。

### 8.8 渲染降级路径：2D 展开图模式（AC-53 强制要求）

PRD §12.2 第 5 条与 AC-53 要求：WebGL 初始化失败时**必须**降级到 2D 展开图模式，且键盘操作、计时、还原判定、记录写入全部照常工作。这是唯一的功能降级路径，必须在架构上预留，不能等到出错时再补。

结构：

```
render/view-contract.ts     ← 接口 CubeView（唯一的渲染抽象）
   ├─ render/view-3d.ts     ← WebGL 实现（scene + cube-view + turn-animator）
   └─ render/view-2d.ts     ← 2D 展开图实现（复用 ui/components/facelet-grid）
```

```ts
interface CubeView {
  readonly kind: '3d' | '2d';
  mount(host: HTMLElement): void;
  dispose(): void;
  /** 阶数变化时重建几何 */
  setSize(n: CubeSize): void;
  /** 唯一的视觉输入：完整 facelet 状态 + 授权面集合 + 是否遮蔽 */
  renderState(state: Readonly<Uint8Array>, visibleFaces: readonly FaceId[], masked: boolean): void;
  /** 播放一次转动动画；2D 实现直接回调完成 */
  playMove(move: Notation, onDone: () => void): void;
  /** 离散视角切换；2D 实现忽略 */
  setView(view: ViewState): void;
  /** 连续相机拖拽；2D 实现忽略 */
  setOrbitEnabled(enabled: boolean): void;
}
```

四条硬约束：

1. **`view-2d` 不得依赖 three**。它只依赖 `ui/components/facelet-grid` 与 engine 的类型。这保证「three 加载失败」不会连带拖垮降级路径（因此 3D 模块必须可被惰性 `import()` 且失败可捕获）。
2. **`playMove` 是异步回调而不是 Promise**，因为 2D 实现同步完成、3D 实现走 rAF。调用方（`app/wiring.ts`）不得假设它一定异步。
3. **视觉与状态的解耦在 2D 下依然成立**：`renderState` 的签名对两种实现完全一致，2D 只是把「96 个贴纸」换成「6 个 N×N 网格」。观察权限、蒙尘、冻结逻辑全部在 `challenge` 层，2D 模式自动继承，不需要重复实现。
4. **降级必须可见**：进入 2D 模式时在挑战信息区显示一条不可关闭的提示（「当前环境不支持 WebGL，已切换到 2D 展开图模式」），并写一条事件日志。静默降级会让「为什么我的成绩和别人的不可比」变成无法诊断的问题。

#### 8.8.1 像素验收契约（确定性探针，`CubeView` 的一部分）

「ready 态不出现任何贴纸颜色」这条要求必须可机器验收，但**不能靠扫全画布统计颜色种类**：开 `antialias: true` 后 MSAA 必然在轮廓处产生过渡色，无论把区域收窄到多小都过不了。改为**确定性探针 + 色差断言**：

```ts
interface CubeView {
  // ...（略）
  /** 返回当前相机矩阵下应当被采样的屏幕点（CSS 像素坐标），确定性、可复现 */
  getProbePoints(): ReadonlyArray<{ x: number; y: number; face: FaceId; kind: 'center' | 'inset' }>;
}
```

探针布局：每个可见面的中心 1 点 + 每面再取 4 个内缩点（向内缩进贴纸边长的 30%），由相机矩阵与面法向计算，因此视角一变探针随之变、且完全可复现。2D 展开图视图用**同一套探针语义**（每个网格的中心 + 4 个内缩点），这样同一条验收脚本对两种视图都成立。

断言两条：

| 编号 | 断言 | 含义 |
|---|---|---|
| P1 | 全部探针像素与 `--cube-masked` 的色差 `ΔE(CIE76) ≤ 2` | 探针处只有遮蔽色，没有被光照拉出明暗差 |
| P2 | 任一探针像素与 6 个贴纸色中**任何一个**的 `ΔE ≥ 20` | 魔方表面没有露出任何贴纸颜色 |

为什么这样比「颜色种类 ≤ 2」好：它测的是我们真正在意的事——**魔方表面没有出现任何贴纸色**——而不是「画面里恰好只有两种 RGB」。后者对压缩噪声、色彩管理、显示器 gamma 都敏感，前者只依赖我们自己的两个 Token 与已知的 6 个贴纸色。

被测的两组基准色（`--cube-masked` 与 6 个 `--cube-face-*`）在测试里通过 `getComputedStyle` 读取，**不在测试代码里写色值**，与 §8.7 的单一真源纪律一致。

检测与回退顺序：尝试创建 `WebGLRenderer` → 捕获异常或 `getContext` 返回 null → 若失败，`await import('./view-2d')` 并切换 → 若连 2D 都失败（理论上不会），显示纯文本错误页并保留 `window.cubeAgent`（Agent 仍然可以在没有视觉的情况下完成评测，这正是本产品「API 优先」的额外收益）。

---

## 9. 目录结构与分层约束

### 9.1 目录树

项目名已由主理人定为 **`ob-cube`**（用户个人品牌惯例，OB = Old Bee），`package.json` 的 `name` 与工程目录根均为 `ob-cube`。下面所有路径都以 `src/ob-cube/` 为根。

```
src/ob-cube/
├─ main.ts                          # 入口：只装配，< 80 行，零业务
├─ app/
│  ├─ bootstrap.ts                  # 依赖装配：engine → puzzle → challenge → agent → render → ui
│  ├─ wiring.ts                     # 事件接线（engine 事件 → render/ui 更新）
│  └─ app-shell.ts                  # 三栏 DOM 骨架
├─ engine/                          # 零 DOM、零浏览器 API
│  ├─ types.ts
│  ├─ geometry/
│  │  ├─ face-layout.ts             # 6 行几何表（唯一允许手写）
│  │  ├─ lattice.ts                 # 双倍整数坐标、层号 ↔ 轴索引
│  │  └─ rotation.ts                # 整数 ROT90 与复合
│  ├─ state/
│  │  ├─ facelet-state.ts           # Uint8Array 容器 + 只读视图
│  │  ├─ solved.ts                  # 还原判定
│  │  └─ fingerprint.ts             # FNV-1a 状态指纹
│  ├─ permutation/
│  │  ├─ slot-table.ts              # slot ↔ (pos, normal) 双向索引，按阶数缓存
│  │  ├─ perm-generator.ts          # §4.3 生成器（核心）
│  │  └─ perm-cache.ts              # (N, axis, a, k) 缓存
│  ├─ notation/
│  │  ├─ grammar.ts                 # 正则常量 + 版本号
│  │  ├─ parse-move.ts              # 单步解析 + 归一化 + 层集合推导
│  │  ├─ parse-sequence.ts          # 序列解析（导入/回放）
│  │  └─ move-catalog.ts            # 每阶数全量合法单步清单
│  ├─ moves/
│  │  └─ apply-move.ts              # 置换应用 + HTM 计量
│  └─ index.ts
├─ puzzle/
│  ├─ prng.ts                       # mulberry32 + 种子规范化 + 域分离
│  ├─ hash.ts                       # FNV-1a 双通道指纹
│  ├─ scramble-gen.ts               # 随机操作打乱 + 冗余过滤
│  ├─ puzzle-record.ts              # 记录构造 / 校验 / challengeId
│  ├─ import-validate.ts            # 题面快照 / 序列导入校验（限长、防原型污染、配色手性）
│  ├─ reproduce.ts                  # 重放 + 指纹校验
│  └─ index.ts
├─ challenge/
│  ├─ types.ts
│  ├─ clock.ts                      # 单调时钟、暂停、可见性间隙
│  ├─ challenge-machine.ts          # 状态机
│  ├─ event-log.ts                  # 有界事件日志
│  ├─ input-arbiter.ts              # 三条输入路径的统一入口 + 180° 归并定稿（§7.10）
│  ├─ observation-policy.ts         # visibleFaces(policy, view) 单一实现
│  ├─ projection.ts                 # 状态 → Observation（唯一颜色出口）
│  ├─ run-result.ts                 # 结果汇总
│  └─ index.ts
├─ storage/
│  ├─ local-store.ts                # 版本化命名空间 + 配额保护 + 节流写
│  ├─ puzzle-repository.ts
│  ├─ run-repository.ts             # 写入 + 淘汰
│  ├─ settings-repository.ts
│  └─ migrations.ts
├─ services/
│  ├─ history-service.ts            # ui 访问 storage 的唯一通道
│  └─ settings-service.ts
├─ agent/
│  ├─ wire-types.ts                 # snake_case 契约类型
│  ├─ errors.ts                     # 错误码常量 + ApiResult 构造
│  ├─ to-wire.ts                    # camelCase → snake_case 纯函数（唯一转换点）
│  ├─ idempotency.ts                # opId 有界去重环
│  ├─ cube-agent.ts                 # 9 个方法实现
│  └─ index.ts
├─ render/
│  ├─ view-contract.ts              # CubeView 接口（唯一渲染抽象，见 §8.8）
│  ├─ view-3d.ts                    # WebGL 实现：装配 scene / cube-view / turn-animator
│  ├─ view-2d.ts                    # 2D 展开图兜底（禁止 import three）
│  ├─ scene.ts                      # 场景 / 相机 / 光照 / resize
│  ├─ cubie-factory.ts              # body + 贴纸构造
│  ├─ cube-view.ts                  # 状态 → 贴纸颜色的派生
│  ├─ turn-animator.ts              # pivot 组 + 精确落位（不碰 WebGLRenderer）
│  ├─ camera-rig.ts                 # 离散 view ↔ OrbitControls
│  ├─ mask-material.ts              # 遮蔽材质（unlit 单色）
│  ├─ palette.ts                    # ColorId → CSS Token → THREE.Color（唯一读取点）
│  ├─ frame-budget.ts               # 帧时采样与降级判定
│  └─ index.ts
├─ ui/
│  ├─ tokens.css                    # 全部色值只在这里出现
│  ├─ layout.css
│  ├─ icons.ts                      # 唯一图标出口（lucide-static ?raw）
│  ├─ keyboard.ts                   # 键盘映射 → 走与 Agent 相同的调用路径
│  ├─ formatters.ts
│  ├─ components/
│  │  ├─ button.ts
│  │  ├─ timer.ts
│  │  ├─ facelet-grid.ts
│  │  ├─ turn-matrix.ts            # 转动按钮矩阵：5 个互斥 tab + 层槽多选 + 角标三态（全项目最复杂交互）
│  │  └─ dialog.ts
│  └─ panels/
│     ├─ config-panel.ts
│     ├─ challenge-info-panel.ts
│     ├─ control-panel.ts          # 层级按钮矩阵，按阶数显隐
│     ├─ observation-panel.ts
│     ├─ event-log-panel.ts
│     └─ result-panel.ts
├─ shared/
│  ├─ result.ts                     # Ok/Err 工具
│  ├─ assert.ts
│  └─ event-emitter.ts
└─ types/
   └─ vite-env.d.ts

tests/
├─ engine/
│  ├─ geometry.test.ts              # T-01, T-02
│  ├─ permutation.test.ts           # T-03 ~ T-07
│  ├─ move-directions.test.ts       # T-08
│  ├─ layer-semantics.test.ts       # T-09, T-10
│  ├─ notation-valid.test.ts        # T-15
│  ├─ notation-invalid.test.ts      # T-16
│  ├─ solved.test.ts                # T-14, T-26
│  └─ fingerprint.test.ts           # T-24, T-25
├─ puzzle/
│  ├─ reproducibility.test.ts       # T-11, T-12
│  ├─ import-validate.test.ts       # T-31
│  └─ reproduce.test.ts             # T-19 的重放部分
├─ challenge/
│  ├─ clock-boundaries.test.ts      # T-17, T-18, T-30
│  ├─ observation-policy.test.ts    # T-20
│  ├─ freeze.test.ts                # T-23
│  ├─ submission-failures.test.ts   # T-28
│  └─ rate-limit.test.ts            # T-29
├─ agent/
│  ├─ to-wire.test.ts               # T-21
│  ├─ errors.test.ts                # 错误码覆盖
│  └─ idempotency.test.ts           # T-22
├─ render/
│  ├─ turn-animator.test.ts         # T-13（node 环境，无 WebGL）
│  └─ view-fallback.test.ts         # T-27（桩化 getContext）
├─ ui/
│  ├─ keyboard.test.ts
│  └─ panels.test.ts
├─ e2e/
│  └─ agent-smoke.spec.ts           # Playwright，可选
└─ fixtures/
   └─ wire-snapshot.json            # T-21 的字段名快照
```

### 9.2 文件规模红线（钉死）

- 单文件 ≤ 300 行（不含空行与注释）。超限必须**按子功能拆文件**，不是拆函数凑数。
- 入口 `main.ts` < 80 行，且不含任何业务判断。
- 以下文件是最容易膨胀的，提前设定预期上限，超过就拆：

| 文件 | 预期行数 | 超限时的拆法 |
|---|---:|---|
| `notation/parse-move.ts` | ≤ 180 | 层集合推导拆到 `layer-resolve.ts` |
| `challenge/projection.ts` | ≤ 200 | 策略分支拆到 `observation-policy.ts`（本来就在那） |
| `agent/cube-agent.ts` | ≤ 280 | 按方法族拆 `cube-agent-observe.ts` / `cube-agent-move.ts` |
| `render/turn-animator.ts` | ≤ 240 | 队列管理拆到 `anim-queue.ts` |
| `ui/panels/control-panel.ts` | ≤ 260 | 按钮矩阵生成拆到 `layer-button-matrix.ts` |
| `agent/to-wire.ts` | ≤ 200 | 仍是单职责，不得为了凑行数拆散 |

门禁命令（CI 与本地提交前都跑）：

```bash
find src/ob-cube -name '*.ts' | xargs wc -l | sort -rn | awk '$1>300 && $2!="total" {print "OVER LIMIT:", $0}'
wc -l src/ob-cube/main.ts
```

### 9.3 归属判定表

拿不准某段代码放哪时按此表判定，不允许「先放着后面再整理」：

| 这段代码 | 归属 |
|---|---|
| 判断某个 move 是否合法 | `engine/notation/` |
| 判断是否还原 | `engine/state/solved.ts` |
| 判断剩余时间是否耗尽 | `challenge/clock.ts` |
| 决定 Agent 能看到哪几面 | `challenge/observation-policy.ts` |
| 把颜色矩阵序列化 | `agent/to-wire.ts` |
| 把 pivot 角度算出来 | `render/turn-animator.ts` |
| 把格坐标换成世界坐标 | `render/`（`engine` 只知道整数坐标，不知道世界单位） |
| 「点按钮后该做什么」的编排 | `ui/`（只编排，不实现规则） |
| 判断两次输入能否合并成 180° | `challenge/input-arbiter.ts`（唯一实现，三条通道共用） |
| 读 localStorage | `storage/` |
| 读 CSS Token / 取色 | `render/palette.ts`（全项目唯一读取点） |
| 决定用 3D 还是 2D 渲染 | `app/bootstrap.ts`（装配层，失败回退也在这里） |
| 键名快照测试 | `agent/` 的测试文件 |

---

## 10. 持久化

### 10.1 命名空间

| key | 内容 | 上限策略 |
|---|---|---|
| `cube.v1.schema` | `{ version: 1, updated_at }` | 单条 |
| `cube.v1.puzzles` | `Record<challengeId, PuzzleRecord>` | 最多 500 条，按 `created_at` 淘汰 |
| `cube.v1.runs` | `Record<runId, RunRecord>` | 最多 100 条，按 `started_at` 淘汰 |
| `cube.v1.settings` | 界面与默认挑战配置 | 单条 |

### 10.2 写入纪律（钉死）

1. **禁止每次 `applyMove` 同步写 localStorage。** `localStorage.setItem` 是同步阻塞 API，一次 JSON 序列化 + 写入在 4 阶长日志下可达数毫秒，会直接吃掉 §8.5 的 8ms 帧预算，并且在限时挑战里造成「因为写盘所以超时」的荒谬结论。
2. 策略：**内存中维护当前 run，写入用 500ms debounce 合并**；以下四个时点**强制 flush**：`start`、`solve`、`submit`、`abort`，另加 `visibilitychange → hidden` 与 `beforeunload`。
3. 写入失败（配额溢出）必须捕获 `QuotaExceededError`，转成 `E_STORAGE_FULL` 并触发一次「淘汰最旧 run」的重试；重试一次仍失败则把当前 run 标记为 `unsaved: true` 并提示用户。**不得静默吞掉**——静默失败会让用户丢掉一次评测记录，这是本产品最贵的失败。
4. 读写一律经 `local-store.ts`，禁止任何模块直接 `localStorage.xxx`（用 lint 规则或 code review 拦截）。

### 10.3 导入的边界（安全约束，PRD §11 强制）

题面导入（PRD F15，优先级 P1）会引入外部 JSON，必须在 `puzzle/import-validate.ts` 里做四道检查，任何一道不过即 `ok:false`，且**不进入** `ready` 态（AC-12）：

| 检查 | 规则 | 错误码 |
|---|---|---|
| 体积 | 原始字符串 ≤ 256KB | `E_IMPORT_TOO_LARGE` |
| 键名安全 | 递归拒绝 `__proto__` / `constructor` / `prototype` 三个键 | `E_IMPORT_UNSAFE_KEY` |
| schema | 字段名、类型、阶数枚举、颜色 id 枚举逐项校验（不用「宽松反序列化后再说」） | `E_INVALID_STATE` |
| 可解性 | 颜色计数每色恰为 `N²`；§3.4 三步判定通过（含 `det = +1` 手性） | `E_INVALID_STATE` |

`JSON.parse` 本身不会污染原型（它不执行 setter），但后续 `Object.assign` / 递归合并会把 `__proto__` 变成真实赋值。因此检查必须在**任何合并之前**做，用 `Object.keys` 遍历而不是 `for...in`。

### 10.4 迁移

`schema.version` 只增不减。`migrations.ts` 维护 `v(n) → v(n+1)` 的幂等函数链。遇到高于当前版本的记录（用户回退了应用版本），**不得删除**，标记为 `E_SCHEMA_AHEAD` 并在历史列表里显示为「由更新版本创建，当前版本不可读」。

---

## 11. 测试策略

### 11.1 测试分层

| 层 | 环境 | 覆盖对象 |
|---|---|---|
| 引擎单测 | `node` | 几何、置换、状态、记法、还原判定 |
| 规则单测 | `node` | 状态机、时钟、观察策略、投影 |
| 契约单测 | `node` | `to-wire`、错误码、幂等、字段名快照 |
| 动画单测 | `node`（three 数学类无需 WebGL） | `turn-animator` 的变换与漂移 |
| UI 单测 | `jsdom` | 面板渲染、键盘映射 |
| 冒烟 | Playwright（可选） | 真实浏览器里的 `window.cubeAgent` 全链路 |

### 11.2 必须有的单元测试清单

每条都写清「断言什么」，不允许写成「测试打乱功能」。

| ID | 用例 | 断言什么 |
|---|---|---|
| T-01 | 几何表自洽 | 对 6 个面，`cross(u, v)` 的三个分量都等于 `-n` 的对应分量；6 个法向量两两不同且都是单位轴向量 |
| T-02 | slot 表唯一性 | `BUILD_SLOT_TABLE(N)` 对 N∈{2,3,4} 产出的 `6N²` 个 `(pos, normal)` 键互不相同；且每个键的 `pos` 至少一个分量绝对值等于 `N-1`（确实在表面） |
| T-03 | 置换双射 | 对 3 个阶数 × 全量合法单步（含内层、宽转、切片）逐个断言 `new Set(perm).size === 6N²` 且值域合法 |
| T-04 | 置换阶整除 4 | 同上集合，逐断言 `permOrder(perm) ∈ {1,2,4}`；四分之一转断言恰为 4；半转断言恰为 2 |
| T-05 | 逆元 | 对每个 move，`compose(perm(move), perm(inverse(move)))` 为恒等；`inverse` 覆盖 `'`、`2`、区间形式 |
| T-06 | 受影响 slot 计数 | 对每个单层 move 断言受影响数等于 `Σ_{a∈A}(4N + (a 为外层 ? N² : 0))`；并断言四组实测值：2 阶 `R`=12、3 阶 `R`=21、4 阶 `R`=32、4 阶 `Rw`=48 |
| T-07 | 循环结构 | 断言 3 阶 `R` 分解为「5 个 4-循环 + 1 个不动点」；4 阶 `R` 为「8 个 4-循环」；2 阶 `R` 为「3 个 4-循环」 |
| T-08 | 六面方向正确性 | 从已还原态执行单步，断言搬运方向：`R` 后 F 面右列出现在 U 面右列；`U` 后 F 面上行出现在 L 面上行；`F` 后 U 面上行出现在 R 面左列；`L`/`D`/`B` 同理。逐面断言具体颜色矩阵，不做「状态变了」这种弱断言 |
| T-09 | 层语义恒等式 | 断言 2 阶 `2R` 结果状态等于 `L'`；3 阶 `2R` 等于 `M'`；4 阶 `2-3Rw` 等于先 `2R` 再 `3R`；4 阶 `Rw` 等于 `2Rw`；3 阶 `Rw` 等于 `2Rw` |
| T-10 | 全层转动被拒绝 | 断言 2 阶 `Rw`、3 阶 `3Rw`、4 阶 `4Rw`/`1-4Rw` 都返回 `E_MOVE_COVERS_ALL_LAYERS`；同时断言「若能执行」得到的确实是每面单色（证明拒绝的理由成立） |
| T-11 | 打乱可复现 | 同 `(N, seed, L, filter)` 两次生成得到逐字符相同的序列与相同的初始状态指纹；不同 `N` 同 seed 的序列前缀**不相同**（域分离生效） |
| T-12 | 打乱-逆打乱回归 | 对 N∈{2,3,4} 各 20 组随机打乱，断言「序列 + 逆序列」后状态指纹等于已还原指纹 |
| T-13 | 动画零漂移 | 用假时钟驱动 `turn-animator` 连续执行 500 步（4 阶，随机 move）；每步结束后断言每个 cubie 的 `position` 与 `quaternion` 的 8 个分量与「由整数格坐标重算的精确值」逐位相等（`Object.is`），最终 `maxAbsDiff === 0` |
| T-14 | 还原判定 | 已还原态判定为真；单步打乱后为假；「每面单色但整体被转动过」的状态判定为真（4 阶整体朝向不唯一）；「仅两块错位」判定为假 |
| T-15 | 记法合法用例 | 断言 `R`、`R'`、`R2`、`R2'`、`Rw`、`2Rw`、`3Rw`、`2-3Rw`、`2R`、`3R`、`M`、`M2`、`M'`、`E`、`S` 的归一化结果与 `(axis, layers, k)` 三元组全部符合预期表 |
| T-16 | 记法非法用例 | 断言 `r`（小写）→ `E_NOTATION_LOWERCASE`；`X` → `E_NOTATION_MALFORMED`；`5R`（3 阶）→ `E_MOVE_LAYER_OUT_OF_RANGE`；`M`（2 阶/4 阶）→ `E_SLICE_NOT_AVAILABLE`；`R U`（单步入口）→ `E_NOTATION_MULTIPLE_MOVES`；`x` → `E_NOTATION_ORIENTATION_NOT_MOVABLE`；`2-1R` → `E_MOVE_LAYER_OUT_OF_RANGE`；`R3` → `E_NOTATION_MALFORMED` |
| T-17 | 超时边界 | 假时钟推进到恰好等于 `time_limit_ms` 时，下一次 `applyMove` 返回 `E_DEADLINE_EXCEEDED` 且状态为 `ended_timeout`；`time_limit_ms - 1` 时仍可成功执行 |
| T-18 | 步数边界 | `move_limit = 3` 时第 3 步成功、第 4 步返回 `E_MOVE_LIMIT_REACHED`；`moves_left` 精确从 3→2→1→0；宽转计 1 步而非按层数计 |
| T-19 | 日志与回放一致 | 跑一局 30 步的完整流程，把事件日志里的 `state_fingerprint_after` 序列与「用 `scramble + 操作序列` 重新重放」算出的指纹序列逐条比对，必须完全相等 |
| T-20 | 观察权限 | 五种策略各一例，断言 `visible_faces` 集合、`facelets` 的键集合、`hidden_faces` 集合；断言任何策略下响应里都**不含** `scramble`/`seed`/`*_fingerprint` 键（用递归键名扫描，而不是逐个断言） |
| T-21 | 契约字段名快照 | 把一次真实观察投影的键路径集合（排序后）序列化为快照文件；另断言 `to-wire` 输出中不存在任何 camelCase 键名 |
| T-22 | 幂等 | 同 `op_id` + 同 move 二次提交：返回 `deduplicated: true`、`move_count` 不增加、状态不变；同 `op_id` + 不同 move 返回 `E_OP_ID_CONFLICT` |
| T-23 | 冻结时序 | 使状态变为已还原的那一步之后，`status === 'solved_pending'`，下一次 `applyMove` 返回 `E_CUBE_ALREADY_SOLVED`，`submitSolution` 成功且 `ended_reason === 'solved'` |
| T-24 | 指纹稳定性 | 对固定的 N 个状态样本，指纹与硬编码的期望值相等（防止哈希实现被无意改动导致历史记录全部失效） |
| T-25 | 「同一个魔方」不等于「同一个数组」 | 3 阶：断言 `2-3Rw` 与「`R'` 之后再整体转 3 个四分之一转」得到逐位相同的数组；同时断言 `2-3Rw` 与 `R'` 的数组**不同**且指纹不同；断言两者的 `isSolved` 结果相同（都为 false）。这条锁住 §3.5 的边界，防止后人拿指纹做局面等价判据 |
| T-26 | 配色手性（还原判定的手性校验） | 构造 24 个「整体旋转后的已还原态」，断言**全部**判定为已还原（若实现把 `det` 判反，这条会红，这是最坏的结果，必须首先跑通）；构造 24 个镜像配色（`det = -1`）的全单色状态，断言**全部**判定为未还原且 `reason === 'invalid-scheme'`；构造一个颜色计数重复的状态，断言同样拒绝；断言这三类失败路径**都不修改状态、不推进 `move_count`、不产生 `MoveEvent`** |
| T-27 | 2D 降级（AC-53） | 用一个必定抛错的 `getContext` 桩模拟 WebGL 失败，断言 `CubeView.kind === '2d'`；断言此状态下 `applyMove`、`submitSolution`、计时、还原判定、storage 写入全部照常工作；断言 `render/view-2d.ts` 的模块图里不含 `three`（静态检查 `import` 语句） |
| T-28 | 提交失败计数（AC-29） | 未还原时累计调用 `submitSolution`：第 1、2 次返回 `E_NOT_SOLVED` 且 `status` 仍为 `running`、`submission_failures` 递增；第 3 次后 `status === 'ended_invalid_submission'`、`ended_reason === 'invalid_submission'`，此后 `applyMove` 返回 `E_CHALLENGE_ENDED` |
| T-29 | 调用频率护栏 | 在同一帧内连续调用 61 次任意 API，断言第 61 次返回 `E_RATE_LIMITED`，且状态与步数均未被改变 |
| T-30 | 还原优先于步数耗尽（AC-27） | 设 `move_limit` 为「恰好使魔方还原的步数」，执行最后一步后断言 `status === 'solved_pending'`、`ended_reason` 最终为 `solved` 而非 `move_limit` |
| T-31 | 导入校验（P1，未来导入；MVP 不提供导入） | 256KB+1 的字符串 → `E_IMPORT_TOO_LARGE`；含 `__proto__` 键的 JSON → `E_IMPORT_UNSAFE_KEY` 且 `Object.prototype` 未被污染（`({}).polluted === undefined`）；颜色计数错误 → `E_INVALID_STATE` |
| T-32 | API 白名单（AC-41 / AC-58 / AC-64） | 断言 `Object.keys(window.cubeAgent).sort()` 严格等于 9 个方法名；断言不存在 `pause` / `resume` / `parseNotation` / `getDebugState` / `getSolution` / `getScramble` / `getFullState`；断言没有任何属性的 `typeof === 'object'`；断言 `Object.isFrozen(window.cubeAgent) === true` |
| T-33 | 三种计步口径（AC-49） | 3 阶执行 `R` → `Rw` → `M2`，断言 `htm === 3`、`htm_layer === 4`（1+2+1）、`qtm === 5`（1+2+2）；再断言 `RunSummary.metrics_total` 与逐步累加一致 |
| T-34 | 180° 归并（AC-61 / 62 / 63 / 69） | 假时钟下 120ms 内注入两次 `R` 键：断言事件流新增 **1** 条 `MoveEvent`、`turn_amount === 180`、`merged_from.length === 2`、`move_count` 净增 1、事件流中**不含**任何 `R'`；把动画目标角度采样序列断言为单调不减。另注入 `W` 后 120ms 注入 `Q`：断言新增 **2** 条事件且最终指纹等于按序执行 `U` 再 `B` |
| T-35 | AC-42 / AC-43 返回字段 | `applyMove("R")` 的返回对象在**根上**必须有 `ok`、`move`、`layer_count`、`turn_amount`、`state_fingerprint_after`、`move_count`、`remaining_ms`、`observation_id` 八个键；先 `observe()` 得到 id X，紧接着 `applyMove` 的 `observation_id` 必须等于 X；连续两步不观察时第二步的 `observation_lag === 1` |
| T-36 | 记法往返恒等（AC-71） | 对全部 144 个物理转动（18/45/81）逐个断言 `parseMove(describeMove(t)).canonical === describeMove(t)`；另断言 `parseMove` 对同物异名的输入（`3R`、`2L'`、`2R`、`M'`）返回同一个 `canonical`。这条同时锁住「`describeMove` 输出唯一」与「`parseMove` 归一化方向正确」 |

### 11.3 变异定向加固（防止沉默逻辑错误）

针对本产品最容易「悄悄算错」的四处，各写一条「注入错误必须被抓到」的元测试：

1. 把 `ROT90` 的某个符号取反 → T-08 必须红。
2. 把层号换算的 `N - l` 改成 `l - 1` → T-06 或 T-09 必须红。
3. 把 `perm[target] = source` 写成 `perm[source] = target` → T-08 必须红。
4. 把打乱的域分离常量去掉 → T-11 的「不同 N 前缀不同」必须红。

在 CI 里可以用手工临时改代码 + 跑测试的方式验证一次，把结果记在 ADR-002 的 Consequences 里。

---

## 12. 明确不做（out-of-scope）

以下条目本阶段不做，任何人不得顺手实现。需要时先改 PRD + 本文档。

| 不做的事 | 原因 |
|---|---|
| 任何后端、数据库、账号体系、云端题库 | ADR-004 |
| 均匀随机状态生成 | §6.5；4 阶需要求解器或奇偶性构造，成本与 MVP 不匹配 |
| 自动难度分级、求解器、最优解计算 | PRD 5.3 明确第一版人工标注 |
| Agent 批量提交多步（`applyMoves`） | PRD 6.3 明确作为后续扩展；需要单独标记批量模式与计步规则 |
| 鼠标拖拽转层（drag-to-turn） | §8.4；手势仲裁成本高，触控板体验难控 |
| 移动端三栏转上下布局 | PRD 3.2 明确第一版优先桌面端；只做「不崩」的降级，不做专门优化 |
| 平台托管 Agent（服务端调模型） | PRD 6.4 的第二形态需要后端，与 ADR-004 冲突 |
| 认证、限流、会话隔离、opId 强制幂等 | 这些是服务端语义，纯前端无对应实体。注意：**单帧 60 次的调用频率护栏（`E_RATE_LIMITED`）是要做的**，它防的是主线程被 Agent 死循环打爆，与网络限流不是一回事 |
| 题面导入的完整 UI（PRD F15，P1） | v1 必须实现 `import-validate.ts`（§10.3）与对应错误码，因为 §3.4 的手性校验需要它；但导入面板的交互设计不在 v1 范围 |
| 练习模式（还原后继续自由转动） | 与 §7 的冻结规则冲突，会引入第二种状态语义 |
| 声音、彩带、庆祝动画等表现层增强 | 不影响验收，且会引入未授权的资源 |
| 大于 4 阶的魔方 | PRD 1.1 只要求 2/3/4 |
| 任意 N 的通用层宽转组合枚举 | 语法支持，但 `move_catalog` 只对 2/3/4 生成 |

---

## 13. 端到端验证步骤

Phase 3 交付完成时，必须能按下面顺序跑通，且每步结果与期望一致。任何一步失败即不算完成。

```bash
# 1. 安装与类型检查
npm ci
npx tsc --noEmit                     # 期望：0 error

# 2. 文件规模门禁
find src/ob-cube -name '*.ts' | xargs wc -l | sort -rn | awk '$1>300 && $2!="total" {print "OVER LIMIT:", $0}'
wc -l src/ob-cube/main.ts                    # 期望：无输出 / < 80

# 3. 引擎与契约单测（node 环境，零 WebGL）
npx vitest run --environment node tests/engine tests/challenge tests/agent
# 期望：T-01..T-31 全绿；覆盖率 engine/ >= 95%，challenge/ >= 85%

# 4. UI 单测
npx vitest run --environment jsdom tests/ui

# 5. 构建
npm run build                        # 期望：产出 dist/，无警告级以上的 Rollup 报错

# 6. 静态预览 + 控制台验证（人工）
npm run preview
```

浏览器控制台逐条执行，期望结果写在注释里：

```js
// 6.1 未开始前，观察被拒且不含任何颜色
window.cubeAgent.observe();
// 期望 { ok:false, error:{ code:'E_CHALLENGE_NOT_STARTED' } }，且响应中无 facelets 键

// 6.2 拿到规则与全量动作清单
window.cubeAgent.getChallengeInfo().move_catalog.length;
// 期望：2 阶 18、3 阶 99、4 阶 162（构成见 §5.6）

// 6.3 开始后完整观察
// 期望 visible_faces 为 6 个面；facelets 有 6 个键；无 scramble / seed / fingerprint 字段

// 6.4 非法记法不改变状态
const before = window.cubeAgent.getProgress().move_count;
window.cubeAgent.applyMove('r');
// 期望 E_NOTATION_LOWERCASE，且 getProgress().move_count === before

// 6.5 整体旋转走独立通道，不计步
window.cubeAgent.rotateView({ kind:'absolute', up:'U', front:'R' });
// 期望返回新的 ViewState + ViewEvent，且 move_count 不变、state_fingerprint 不变

// 6.5b 整体旋转不能经 applyMove 提交（AC-66）
window.cubeAgent.applyMove('x');
// 期望 E_NOTATION_ORIENTATION_NOT_MOVABLE，且指纹不变、move_count 不变

// 6.5c API 白名单（AC-41）
Object.keys(window.cubeAgent).sort();
// 期望恰好 9 项：abandonChallenge, applyMove, getChallengeResult, getChallengeInfo,
//               getLastActionResult, getProgress, observe, rotateView, submitSolution

// 6.6 还原判定与冻结
// 先 applyMove 完整逆打乱序列，最后一步后：
// 期望 status === 'solved_pending'，再次 applyMove 返回 E_CUBE_ALREADY_SOLVED
window.cubeAgent.submitSolution('e2e');
// 期望 ok:true, summary.ended_reason === 'solved'

// 6.7 结果可复现
const r1 = window.cubeAgent.getChallengeResult(challenge_id);
// 期望 r1.events 的最后一条 state_fingerprint_after 等于 r1.final_state_fingerprint
// 用同一 challenge_id 重开一局，初始状态指纹等于 r1.puzzle.initial_state_fingerprint

// 6.8 手性检查（AC-26）：手工构造一个「六面单色但为镜像配色」的状态快照导入
// 期望 ok:false, error.code === 'E_INVALID_STATE'，且挑战不进入 ready 态

// 6.9 2D 降级（AC-53）：DevTools 里让 canvas.getContext 对 'webgl2'/'webgl' 返回 null 后刷新
// 期望页面出现 2D 展开图的六面网格，挑战信息区显示「已切换到 2D 展开图模式」，
// 且 6.3 ~ 6.7 全部仍然通过
```

真实浏览器冒烟（可选）：

```bash
npx playwright test tests/e2e/agent-smoke.spec.ts
# 期望：4 阶跑 20 步，p95 帧间隔 <= 20ms，final_state_fingerprint 与日志一致
```

---

## 14. 风险登记

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | 层语义或记法语义定错 | 所有历史题目复现错位；所有 Agent 算例失效；错误是静默的 | §4.5 钉死规则；T-09 锁住跨阶数恒等式；T-24 指纹固定值；`notation_version` 进记录 |
| R2 | 动画提交与状态推进时序错乱 | 步数与回放不一致、双提交、丢步 | §8.3 固定时序；输入队列有界；T-13 + T-19 覆盖 |
| R3 | 浮点漂移 | 长会话后魔方歪掉、缝隙不均 | §8.3 禁止累积变换；T-13 用 500 步 + `maxAbsDiff === 0` 断言 |
| R4 | 蒙尘被当成安全边界 | 产品做出错误的安全承诺 | §7.9 明确写进 PRD 与 UI 文案 |
| R5 | localStorage 同步写阻塞主线程 | 帧率掉、限时挑战误判超时 | §10.2 debounce + 强制 flush 时点 |
| R6 | 4 阶 152 draw call 在低端集显掉帧 | 60fps 不达标 | §8.5 降级策略显式化；§8.2 留实例化路径 |
| R7 | `three` 与 `@types/three` 版本错配 | 类型全红或 addons 导入失败 | §1 同版本线锚定；`three/addons/*.js` 带扩展名 |
| R8 | TS 7 与 `@types/three`（声明 5.6）潜在不兼容 | 类型检查失败阻塞构建 | §1 的回退路径 |
| R9 | ~~像素验收与抗锯齿互斥~~ **已裁决** | — | 改为**确定性探针 + 色差断言**（§8.8.1）：探针与 `--cube-masked` 的 ΔE ≤ 2，且与 6 个贴纸色的 ΔE ≥ 20。测的是「表面没露出贴纸色」而不是「画面恰有 2 种 RGB」，因此不受 MSAA 影响 |
| R10 | 错误码双命名（PRD 短名 vs `E_` 前缀） | 前后端/脚本按不同名字匹配，错误处理静默失效 | §7.6 增加「PRD 短名」列作为唯一映射表；`error.code` 只返回 `E_` 形式；任何新码必须同时补两列 |
| R11 | 2D 降级被当成「以后再说」 | AC-53 是强制验收项，后补需要改渲染抽象，成本远高于预留 | §8.8 的 `CubeView` 接口在 Phase 3 第一天就落地；T-27 常驻 |
| R12 | 暂停语义被误实现为「停表」或旧口径「计时照跑」 | 与 PRD §7.2.1 冲突，产生不可比的成绩 | `pause_stops_clock` 恒为 true；`E_PAUSED` 文案必须含「计时已冻结」；`RunSummary` 记录 `elapsed_ms`（扣除暂停）与 `paused_ms`、`pause_count` |
| R13 | ~~PRD 冲突：AC-21 vs AC-61/AC-70~~ **已裁决并在 PRD v1.10 回写** | 主理人采纳「按规范化意图比较」口径；PRD AC-70 已改为「经 §5.4.1 输入整形后的 move 序列」 | §7.10 与 PRD 附录 C 口径一致；不再有“按输入比较”的原句 |
| R14 | ~~`state_fingerprint_after` 削弱受限观察~~ **已裁决** | — | 受限观察下该字段返回 `null`（§7.8），挑战结束后解禁。理由是 2 阶状态空间约 3.67×10⁶、32 位指纹可枚举反推，等于把作弊成本从 0 抬到 10 秒 |

---

## 附录 A：符号与常量

| 符号 | 含义 |
|---|---|
| `N` | 魔方阶数，∈ {2,3,4} |
| `6N²` | facelet 总数：24 / 54 / 96 |
| `slot` | facelet 索引，`faceIndex·N² + row·N + col` |
| `c(i)` | 双倍整数坐标，`2i - (N-1)` |
| `a` | 轴索引，`[0, N-1]`，从负侧数 |
| `l` | 记法层号，`[1, N]`，从被命名面数，1-based |
| `A` | 参与转动的轴索引集合（已是 `c()` 值） |
| `k` | 四分之一转次数，∈ {1,2,3} |
| `HTM` | Half-Turn Metric，任一单步（含 180°、宽转、内层）计 1 |

## 附录 B：契约变更流程

1. 先改本文档对应章节 + 受影响的 ADR。
2. `notation_version` / `algorithm_version` / `schema_version` 是否需要升版？写清楚结论。
3. 若改变了对外字段名或语义，先更新 `agent/to-wire.ts` 与 T-21 的快照，再改实现。
4. 由 team-lead 同步给 PM（PRD 文案）与设计师（UI 显示）。
5. 历史记录的兼容性结论必须显式记录：能复现 / 不能复现但可读 / 不可读。

## 附录 C：AC 引用对照表

AC 编号在 PRD 四轮改版中整体位移过，跨文档引用已经出现过「设计师引 AC-22、架构引 AC-16、其实指同一条像素约束」的情况。本文不再把编号当作唯一标识，而是**以本表为唯一权威映射**：本表给出一句话内容，编号只是索引。若 PRD 的 AC 索引表与本表冲突，**以内容为准**，并由 team-lead 统一订正一次。

本文引用的全部 AC 及其实质内容：

| 编号 | 一句话内容 | 本文引用位置 |
|---|---|---|
| AC-02 | 单步转动的返回形状（含 `turn_amount` 以度为单位） | §7.3 `MoveMetrics` |
| AC-05 | 层集合字段的取值语义（4 阶 `Rw` → `[1,2]`） | §7.3 `MoveMetrics.layer_set` |
| AC-07 | 2 阶不接受任何层前缀 | §4.5、§5.3、§5.6 |
| AC-12 | 导入非法题面必须 `E_INVALID_STATE` 且不进入 ready | §10.3、§13 |
| AC-16 | ready 态画布上不得出现任何贴纸颜色 | §8.2、§8.8.1（改用确定性探针判定） |
| AC-21 | 每次 `applyMove` 的 `move_count` 增量恒为 1 | §7.7、§7.10 |
| AC-22 | 每个 MoveEvent 必带 `layer_count`/`turn_amount`/`axis`/`layer_set` | §7.3、§11 |
| AC-23 / AC-24 | 2 阶 / 3 阶：六面单色且任意整体朝向即已还原 | §3.4 |
| AC-25 / AC-26 | 4 阶：配色为 24 旋转之一判已还原；镜像配色判未还原并报 `E_INVALID_STATE` | §3.4、T-26 |
| AC-27 | 步数用尽那一步若已还原，判定为 solved（还原优先） | §7.4 第 3 条 |
| AC-28 | 超时须在 200ms 内生效，之后写操作被拒 | §7.4 第 2 条 |
| AC-29 | 提交未还原不终止；累计 3 次终止为 `invalid_submission` | §7.3、§7.4 |
| AC-30 | 主动放弃产生 `aborted` 并保留全部事件 | §7.4 `abandonChallenge` |
| AC-41 | `window.cubeAgent` 自有属性只含 9 个方法 | §7.2、§7.4 |
| AC-42 | `applyMove` 返回 8 个字段且平铺在根上 | §7.1、§7.3 |
| AC-43 | `applyMove` 的 `observation_id` 回显所依据的那次观察 | §7.5 |
| AC-45 | 键盘与 API 走同一引擎入口，结果一致 | §7.10 第 4 条、T-34 |
| AC-47 | 回放第 k 步须等于事件日志第 k 条的指纹 | §7.3 `RunEvent`、T-19 |
| AC-49 | 结果页须同时展示 HTM / HTM-layer / QTM 三口径 | §7.3 `metrics_total`、T-33 |
| AC-53 | WebGL 失败必须降级 2D 展开图，功能不降级 | §8.8、T-27 |
| AC-55 / AC-56 [已废弃] | 原暂停旧口径；PRD v1.10 由 AC-73 / AC-74 替代 | PRD 附录 C |
| AC-73 | `paused` 期间 `elapsed_ms` 冻结（增量为 0），恢复后继续 | §7.3 `pause_stops_clock` |
| AC-74 | `paused` 期间不得触发超时判定 | §7.3 `clock.ts`、T-23 |
| AC-58 | `window.cubeAgent` 不暴露 `pause` / `resume` | §7.4、T-32 |
| AC-61 / AC-62 / AC-63 | 180° 归并：1 条事件、1 步、无逆向事件、角度单调、与显式 `X2` 等价 | §7.10、§8.3.1、T-34 |
| AC-64 | 不得存在 `getDebugState`/`getSolution`/`getScramble`/`getFullState` | §7.4、T-32 |
| AC-66 | `applyMove` 拒绝整体旋转记法 | §5.5、§13 |
| AC-69 | 归并窗口内到达不同面键必须立即执行且不回退 | §7.10、T-34 |
| AC-70 | 人机同轨：同一「表达出来的 move 序列」结果一致（**按意图比较，不按输入比较**） | §7.10 |

**关于 AC-70 的口径（主理人裁决，已写进本文）**：原表述「同样的按键序列与同样的 `applyMove` 序列必须一致」是按输入比较，永远无法成立（人类双击表达 `R2` 的意图，Agent 连调两次 `applyMove('R')` 表达两个独立意图）。正确口径是**按意图比较**：同一个表达出来的 move 序列，无论来自键盘、按钮还是 `applyMove`，`move_count` 与事件序列必须一致。
