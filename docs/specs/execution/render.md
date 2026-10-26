# 执行契约 · 渲染架构

> 所属：**执行侧文档树** `docs/specs/execution/`。产品口径见 [`../PRD.md`](../PRD.md)，架构总纲见 [`CONTRACT.md`](CONTRACT.md)，设计总纲见 [`UIUX.md`](UIUX.md)。
> 权威级别：**实现契约（How）**。与 `../prd/` 冲突时以 PRD 为准；AC 编号一律以 [`../prd/11-appendix.md`](../prd/11-appendix.md) 附录 C 为唯一真源。
> 来源：原 `ARCHITECTURE.md` v1.4 §8（渲染架构）
> 本文件独占的主题：cubie mesh 方案、场景组成与 draw call 预算、转动动画与浮点漂移、相机、帧预算与 60fps 判定、尺寸缩放、色彩 Token 读取纪律、2D 展开图降级路径。**其他文件不得重述，只能链接到此处。**

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

引擎里没有任何色值（颜色 id 就是面名）。渲染层需要把 `ColorId` 映射到实际颜色，这个映射的唯一落点是 `render/palette.ts`，它的输入是 CSS 自定义属性。**色值的唯一定义点是 `ui/tokens.css`**（设计师产出的 `design/design-tokens.css` 即该文件的来源，它同时提供本文所需名字的一等别名）。

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

