# 执行契约 · 架构总纲（CONTRACT）

> 所属：**执行侧文档树** `docs/specs/execution/`。产品口径见 [`../PRD.md`](../PRD.md)，设计总纲见 [`UIUX.md`](UIUX.md)。
> 权威级别：**实现契约（How）**。与 `../prd/` 冲突时以 PRD 为准；AC 编号一律以 [`../prd/11-appendix.md`](../prd/11-appendix.md) 附录 C 为唯一真源。
> 来源：原 `ARCHITECTURE.md` v1.4（2183 行）拆分而来。本文件保留总纲部分（§0 硬结论 / §1 技术锚定 / §2 分层铁律 / §9 目录与规模红线 / §12 out-of-scope / §14 风险登记 / 附录 A-C）；各模块细节已拆到同目录的 `engine.md` / `notation.md` / `puzzle.md` / `agent-api.md` / `render.md` / `persistence.md` / `verification.md`。
> 本文件独占的主题：**技术选型与版本锚定、分层依赖铁律、目录结构、文件规模红线、跨模块风险登记、符号常量表、契约变更流程。** 其他文件不得重述，只能链接到此处。
> 标注「钉死」的条目不得单方面更改；需要更改时先改本文档 + 对应 ADR，再改代码（活规格纪律）。

---

## v2.0 修订说明（阅读下方正文前必看）

本文正文来自 `ARCHITECTURE.md` v1.4，它声明"已吸收 PRD v1.4、UIUX v1.2"，但现行是 PRD v2.0 / UIUX（本目录 `UIUX.md`）。以下六处 v1.4 的内容已被 v2.0 推翻或需要据实登记，**正文相应位置未必逐字改到，以本说明为准**：

| # | 项 | v1.4 原写法 | v2.0 现行 | 依据 |
|---|---|---|---|---|
| 1 | **附录 C「AC 引用对照表」的权威声明** | "本文不再把编号当作唯一标识，而是**以本表为唯一权威映射**……若 PRD 的 AC 索引表与本表冲突，**以内容为准**" | **该权威声明废除。** 本表降级为"本文引用了哪些 AC"的**索引**，编号与内容一律以 PRD 附录 C 为准。两处平行权威是本轮排查发现的结构性矛盾之一 | `../PRD.md` §1.3 |
| 2 | **记法版本** | `ss-1`；规范形式 `2Rw`；区间 `2-3Rw`；面口径 `18/90/162` | **`ss-2`**；规范形式 `Rw`；区间 `2-3R`（无 `w`）；AC-40 = **轴口径 `18/45/81`（合计 144）**，`move_catalog` = `18/99/162`，两者永不互验 | [`notation.md`](notation.md) 的 v2.0 修订说明 |
| 3 | **硬结论 #3** | "`Rw` 恒等于 `2Rw`" | 表述反了：**规范形式是 `Rw`，`2Rw` 是别名**（可解析、归一化后不输出） | 同上 |
| 4 | **TypeScript 版本锚定** | `~7.0.2`，附"若 `tsc --noEmit` 报编译器级不兼容，回退 `~5.9.3` 并记 ADR" | **实际已回退到 `~5.9.3`**（见 `package.json`），但**回退分支要求的 ADR 从未写**。v2.0 补记为 `docs/decisions/ADR-006.md` | `../PRD.md` §4、`docs/decisions/` |
| 5 | **运行时基线** | "Node `>=22.12.0`（本机 v22.22.2 满足）" | 本机现为 **Node v24.18.0**。基线 `>=22.12.0` 仍成立，但"本机 v22.22.2"是过期陈述 | 环境实测 |
| 6 | **§9.1 目录树 / §9.3 归属判定表** | 列了 `engine/notation/`、`agent/to-wire.ts`、`app/bootstrap.ts`、`storage/`、`challenge/projection.ts`、`input-arbiter`、`observation-policy` 等路径 | **这些路径都不存在。** 实际是扁平文件布局：`src/agent/index.ts`（无 to-wire 转换层，公开类型本身就是 snake_case）、`src/wiring/index.ts`（不是 `app/bootstrap.ts`）、`src/services/{storage,settings,history}.ts`（不是 `storage/`）；`input-arbiter` / `observation-policy` 的逻辑并入了 `ui/keyboard.ts` 与 `challenge/session.ts`。**§9.1 应读作"目标态"而非"现状"**，现状以 `find src/ob-cube/src -type f` 为准 | 代码实测 |

### 文件规模红线的当前违约登记（§9.2 的据实补充）

§9.2 的"单文件 ≤ 300 行"红线在 v2.0 **保留**（它是有效的架构约束），但当前有 **8 个 TS 文件 + 3 个 CSS 文件违约**，必须显式登记，不得当作已满足：

| 文件 | 行数 | 超出 | 备注 |
|---|---:|---:|---|
| `src/wiring/index.ts` | 848 | +548 | 装配层膨胀最严重，v2 拆分首要目标 |
| `src/challenge/session.ts` | 772 | +472 | 规则层，含状态机 + 计时 + 观察 + 事件 |
| `src/ui/shell.ts` | 507 | +207 | |
| `src/ui/turn-matrix.ts` | 377 | +77 | |
| `src/engine/notation.ts` | 368 | +68 | |
| `src/ui/panels/result-panel.ts` | 333 | +33 | |
| `src/contracts.ts` | 326 | +26 | 冻结契约文件，含大量注释 |
| `src/ui/keyboard.ts` | 302 | +2 | |
| `src/ui/components.css` | 1453 | +1153 | CSS 是否适用同一红线待裁定 |
| `src/ui/layout.css` | 648 | +348 | 同上 |
| `src/ui/tokens.css` | 543 | +243 | 同上（色值唯一定义点，不宜拆） |

> **注**：§9.2 原文的红线口径是"不含注释与空行"。上表用 `wc -l` 的**物理行数**，比红线口径更严；按红线口径实际违约数会略少。两种口径都登记在此，避免下次核对时又出现"文档说达标、实测超标"的漂移。

---

## 0. 阅读顺序与结论速览

按顺序读第 1、3、4、5、7 节即可获得全部硬结论；第 8-11 节是渲染、目录、持久化与测试的落地约束。

本阶段的十三个硬结论：

| # | 结论 | 章节 |
|---|---|---|
| 1 | 状态模型采用 **facelet（面片）模型**，状态为长度 `6N²` 的 `Uint8Array` | §3 |
| 2 | 所有转动置换由**几何算法程序化生成**，代码中不存在任何手写置换数组 | §4 |
| 3 | 记法的层号语义为「从**规范化后的**被命名面算起、1-based、l=1 即外层」；**规范形式是 `Rw`，`2Rw` 是别名**（v2.0 修订，原文写反）；覆盖全层的转动**被拒绝**（`E_MOVE_COVERS_ALL_LAYERS`） | §5.3、[`notation.md`](notation.md) |
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
| R12 | 暂停语义被误实现为「停表」或旧口径「计时照跑」 | 与 PRD §7.2.1 冲突，产生不可比的成绩 | `pause_stops_clock` 恒为 true；`E_CHALLENGE_PAUSED` 文案必须含「计时已冻结」；`RunSummary` 记录 `elapsed_ms`（扣除暂停）与 `paused_total_ms`、`pause_count` |
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
2. `notation_version` / `gen_version` / `schema_version` 是否需要升版？写清楚结论。
3. 若改变了对外字段名或语义，先更新 `agent/to-wire.ts` 与 T-21 的快照，再改实现。
4. 由 team-lead 同步给 PM（PRD 文案）与设计师（UI 显示）。
5. 历史记录的兼容性结论必须显式记录：能复现 / 不能复现但可读 / 不可读。

## 附录 C：AC 引用索引（**v2.0 降级：本表不是权威**）

> ### ⚠️ v2.0 废除本表的权威声明
>
> 原文写的是："AC 编号在 PRD 四轮改版中整体位移过，跨文档引用已经出现过「设计师引 AC-22、架构引 AC-16、其实指同一条像素约束」的情况。本文不再把编号当作唯一标识，而是**以本表为唯一权威映射**：本表给出一句话内容，编号只是索引。若 PRD 的 AC 索引表与本表冲突，**以内容为准**，并由 team-lead 统一订正一次。"
>
> **该声明自 v2.0 起废除。** 理由：它与 PRD 附录 C 的规则 3（"其他文档引用 AC 时必须引用本表编号，不得自创别名"）直接互斥，形成**两处平行 AC 权威**——这正是本轮排查发现的结构性矛盾之一。两个权威等于没有权威：`SPEC-v1.0.md` 就是在这个空隙里用了一套冻结前的旧编号（把蒙尘像素写成 `AC-22`），并把这个错误编号带进了 8 处代码注释。
>
> **现行口径**：AC 编号与内容的**唯一真源是 [`../prd/11-appendix.md`](../prd/11-appendix.md) 附录 C**（冻结）。本表降级为"本文档集引用了哪些 AC"的**只读索引**，方便架构侧读者快速定位；若本表与 PRD 附录 C 冲突，**一律以 PRD 附录 C 为准**，并按 `../PRD.md` §1.3 记裁定、修正本表。
>
> 下表内容在 v2.0 已与 PRD 附录 C 逐条核对，**无实质分歧**（AC-16 = 蒙尘像素探针、AC-22 = MoveEvent 四字段、AC-25/26 = 4 阶还原判定）。分歧只存在于已归档的 `SPEC-v1.0.md` 与部分代码注释里，后者已在 v2.0 修正。
>
> **v2.0 追加**：AC-42 的内容已由"8 字段"修订为"13 字段"；AC-03 / AC-12 / AC-26 / AC-38 / AC-75 亦有内容修订；新增 AC-78 ~ AC-81。详见 [`../prd/10-acceptance.md`](../prd/10-acceptance.md)。

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
| AC-42 | `applyMove` 返回 **13** 个字段且平铺在根上（v2.0 修订，原写 8）| §7.1、§7.3 |
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
