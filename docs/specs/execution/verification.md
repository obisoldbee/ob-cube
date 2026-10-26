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
| T-09 | 层语义恒等式 | 断言 2 阶 `2R` 结果状态等于 `L'`；3 阶 `2R` 等于 `M'`；4 阶 `2-3R` 等于先 `2R` 再 `3R`；4 阶 `Rw` 等于 `2Rw`；3 阶 `Rw` 等于 `2Rw` |
| T-10 | 全层转动被拒绝 | 断言 2 阶 `Rw`、3 阶 `3Rw`、4 阶 `4Rw`/`1-4Rw` 都返回 `E_MOVE_COVERS_ALL_LAYERS`；同时断言「若能执行」得到的确实是每面单色（证明拒绝的理由成立） |
| T-11 | 打乱可复现 | 同 `(N, seed, L, filter)` 两次生成得到逐字符相同的序列与相同的初始状态指纹；不同 `N` 同 seed 的序列前缀**不相同**（域分离生效） |
| T-12 | 打乱-逆打乱回归 | 对 N∈{2,3,4} 各 20 组随机打乱，断言「序列 + 逆序列」后状态指纹等于已还原指纹 |
| T-13 | 动画零漂移 | 用假时钟驱动 `turn-animator` 连续执行 500 步（4 阶，随机 move）；每步结束后断言每个 cubie 的 `position` 与 `quaternion` 的 8 个分量与「由整数格坐标重算的精确值」逐位相等（`Object.is`），最终 `maxAbsDiff === 0` |
| T-14 | 还原判定 | 已还原态判定为真；单步打乱后为假；「每面单色但整体被转动过」的状态判定为真（4 阶整体朝向不唯一）；「仅两块错位」判定为假 |
| T-15 | 记法合法用例 | 断言 `R`、`R'`、`R2`、`R2'`、`Rw`、`2Rw`、`3Rw`、`2-3R`、`2R`、`3R`、`M`、`M2`、`M'`、`E`、`S` 的归一化结果与 `(axis, layers, k)` 三元组全部符合预期表 |
| T-16 | 记法非法用例 | 断言 `r`（小写）→ `E_NOTATION_LOWERCASE`；`X` → `E_NOTATION_MALFORMED`；`5R`（3 阶）→ `E_MOVE_LAYER_OUT_OF_RANGE`；`M`（2 阶/4 阶）→ `E_SLICE_NOT_AVAILABLE`；`R U`（单步入口）→ `E_NOTATION_MULTIPLE_MOVES`；`x` → `E_NOTATION_ORIENTATION_NOT_MOVABLE`；`2-1R` → `E_MOVE_LAYER_OUT_OF_RANGE`；`R3` → `E_NOTATION_MALFORMED` |
| T-17 | 超时边界 | 假时钟推进到恰好等于 `time_limit_ms` 时，下一次 `applyMove` 返回 `E_DEADLINE_EXCEEDED` 且状态为 `ended_timeout`；`time_limit_ms - 1` 时仍可成功执行 |
| T-18 | 步数边界 | `move_limit = 3` 时第 3 步成功、第 4 步返回 `E_MOVE_LIMIT_REACHED`；`moves_left` 精确从 3→2→1→0；宽转计 1 步而非按层数计 |
| T-19 | 日志与回放一致 | 跑一局 30 步的完整流程，把事件日志里的 `state_fingerprint_after` 序列与「用 `scramble + 操作序列` 重新重放」算出的指纹序列逐条比对，必须完全相等 |
| T-20 | 观察权限 | 五种策略各一例，断言 `visible_faces` 集合、`facelets` 的键集合、`hidden_faces` 集合；断言任何策略下响应里都**不含** `scramble`/`seed`/`*_fingerprint` 键（用递归键名扫描，而不是逐个断言） |
| T-21 | 契约字段名快照 | 把一次真实观察投影的键路径集合（排序后）序列化为快照文件；另断言 `to-wire` 输出中不存在任何 camelCase 键名 |
| T-22 | 幂等 | 同 `op_id` + 同 move 二次提交：返回 `deduplicated: true`、`move_count` 不增加、状态不变；同 `op_id` + 不同 move 返回 `E_OP_ID_CONFLICT` |
| T-23 | 冻结时序 | 使状态变为已还原的那一步之后，`status === 'solved_pending'`，下一次 `applyMove` 返回 `E_CUBE_ALREADY_SOLVED`，`submitSolution` 成功且 `ended_reason === 'solved'` |
| T-24 | 指纹稳定性 | 对固定的 N 个状态样本，指纹与硬编码的期望值相等（防止哈希实现被无意改动导致历史记录全部失效） |
| T-25 | 「同一个魔方」不等于「同一个数组」 | 3 阶：断言 `2-3R` 与「`R'` 之后再整体转 3 个四分之一转」得到逐位相同的数组；同时断言 `2-3R` 与 `R'` 的数组**不同**且指纹不同；断言两者的 `isSolved` 结果相同（都为 false）。这条锁住 §3.5 的边界，防止后人拿指纹做局面等价判据 |
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

## 11. 内嵌已知坑（全部来自本项目已发生的实证）

| # | 坑 | 根因 | 修法 |
|---|---|---|---|
| 1 | 180° 双击归并出现「转过去→转回来→再转半圈」闪回 | 按"撤销 + 重放 R2"实现 | 保留两次 90° 动画，只合并计步与日志条目；`move_count` 由事件数派生 |
| 2 | `Rw` 解析失败 | 正则把 `w` 写在面字母前 | 顺序必须是「数字前缀 → 面字母 → `w` → 转向后缀」 |
| 3 | 单面转动受影响贴纸数算错 | 奇数阶面心不动、偶数阶中心块自转 | N 奇：`N²-1+4N`；N 偶：`N²+4N`。2阶 12 / 3阶 20 / 4阶 32 |
| 4 | 偶数阶用 `M/E/S` 得到错误结果 | 切片只对奇数阶有定义 | N 为偶数一律 `E_SLICE_NOT_AVAILABLE` |
| 5 | `three` 导入 addons 后无类型 | `three` 无 `types` 字段 | 装 `@types/three`；addons 必须写完整扩展名 `three/addons/controls/OrbitControls.js` |
| 6 | TS 7 下 `@types/three` 报类型错 | 类型包声明 `typeScriptVersion: 5.6` | 先降 `typescript` 到 `~5.9.3`，再考虑局部 `@ts-expect-error` 并记 ADR。**本条的回退分支已经实际触发**（`package.json` 现为 `~5.9.3`），但当时要求的 ADR 从未写 → v2.0 补记 `docs/decisions/ADR-006.md` |
| 7 | 转几百步后魔方肉眼可见歪掉、散开 | 用 `quaternion.multiply` / `position.add` 累积 | 任何 `Object3D` 变换只从整数格坐标 + 整数朝向矩阵**重算**，禁止累积 |
| 8 | 蒙尘态像素验收失败（**AC-16**，原表误写 AC-22） | 光照让六面亮度不同 | 蒙尘材质 unlit + `NoToneMapping`，只读 `--cube-masked`，无纹理无噪点。**注意判定口径已从"颜色种类数 ≤2"改为确定性探针 ΔE**，见 [`../prd/05-dust-observation.md`](../prd/05-dust-observation.md) §8.2 |
| 9 | 验收项永远过不了 | 把"任意层组合"写进 AC-40 | 限连续区间（记法只能序列化连续区间） |
| 10 | 主按钮与 F 面绿混淆 | `--accent-primary` 青绿 L\* 与 F 面绿只差 1.6 | 主 CTA 用 `--action-bg` |

## 12. 端到端验证步骤

> **v2.0 修订：断言 A / D / E 三条原文有误或已不可用，逐条见下方注释。** 原文来自已归档的 `SPEC-v1.0.md` §12，它用的是 PRD v1.3 冻结前的旧 AC 编号。

```bash
# 0. 引擎算法基线（已通过，改动引擎后必须重跑）
python -B docs/research/permutation-proof.py        # 退出码 0
python -B docs/research/verify-spec-vs-proof.py     # 退出码 0
#    说明：这两个脚本是引擎正确性的机器证据，属研究/验证基线，
#    配套说明见 docs/research/2026-10-25-engine-verification-baseline-research.md

# 1. 安装
cd src/ob-cube && npm install

# 2. 类型门禁
npm run typecheck        # tsc --noEmit 零错误

# 3. 单元测试
npm test                 # vitest run，全绿

# 4. 构建
npm run build            # tsc --noEmit && vite build，零错误，dist/ 产出

# 5. P0 字符扫描（构建产物也扫）
#    emoji / 紫粉渐变 / 占位文案 全部零命中
#    扫描区间：U+2700–27BF、U+2600–26FF、U+1F300 以上（AC-54）

# 6. 浏览器冒烟
npm run dev
# 断言 A【v2.0 修订口径】：ready 且 dust_mode=true 时，用 AC-16 的确定性探针判定——
#   调 cubeView.getProbePoints() 取「每可见面中心 1 点 + 每面 4 个内缩点（内缩=投影包围盒 25%）」，
#   断言 ① 探针像素 vs --cube-masked 的 ΔE ≤ 2；② 探针像素 vs 6 个贴纸色的 ΔE ≥ 20。
#   ✗ 原文「canvas 像素颜色种类 <= 2（AC-22）」两处都错：编号应为 AC-16，
#     且「颜色种类数」口径已被 PRD v1.5 明令废止（MSAA 边缘过渡色会让它恒假）。
#   ⚠ 当前状态：接口已暴露，但无自动化断言（附录 C-bis 标为「部分」）。
#     第四轮评审做过一次性人工采样（33066 点，最小 ΔE=66.69），不是可重复门禁。
# 断言 B：ready 态 window.cubeAgent.observe() 抛 E_CHALLENGE_NOT_STARTED
# 断言 C：点击开始 -> 3 阶随机题 -> 键盘 W/A/S/D/X/Q 可转面，步数递增
# 断言 D【v2.0 修订】：4 阶切到「内层」tab -> 该 tab 含近本侧/近对面位置切换（innerPosition 2|3）
#   -> 按 2R 按钮 -> 只转第 2 层。原文只写「按 2R 按钮」，未覆盖 2L（近对面侧）那一半。
#   注：4 阶的 5 个 tab 是 单层/宽转2/宽转3/内层/自由层（AC-80），不是 v1.10 写的 G1/G3/G4/G5/G6。
# 断言 E【当前必然失败】：视角转到背面后按 D，被转动层有 2px 外轮廓描边。
#   ⚠ render/layer-outline.ts 已实现并入场景（预留 1 draw call），但 shell.ts 的
#     onLayerHover 是 () => undefined、show() 全库无调用者，描边从不出现。
#   已立为 AC-81（P1）。接线前不得据本断言判验收通过。
# 断言 F：还原后进入 solved_pending，submitSolution() 返回成功 -> ended_solved
#   ⚠ 已知缺陷 D1：solved_pending 未豁免超时判定，若配置了时限且拖延提交，
#     会被 tick() 覆盖为 ended_timeout，违反 AC-28 / AC-75。修复前本断言在限时场景下不可靠。
# 断言 G：同一 seed 创建两次挑战，初始 facelet 指纹相同（AC-09）
```

### 12.1 最近一次完整验证结果（2026-10-26，v2.0 定稿时）

| 步骤 | 结果 |
|---|---|
| `npm run typecheck` | **零错误** |
| `npm test` | **18 个测试文件 / 232 用例全绿**（engine 5、challenge 2、agent 1、render 1、ui 8、`_scratch` 1） |
| `npm run build` | **通过**。`dist/assets/index-*.js` = 719.15 KB（gzip 188.23 KB），CSS 39.95 KB；**1 条警告**：chunk > 500KB 建议代码分割 |
| 引擎算法基线（步骤 0） | 两个脚本退出码 0（改动引擎后必须重跑） |
| P0 字符扫描 | 零命中（第四轮代码级修复后） |

> **`tests/_scratch.test.ts` 是无断言的遗留物**（只往 stdout 打印 seed 与指纹），它被计入上面的"18 个测试文件"里。应删除，删除后为 17 文件 / 232 用例（它本身不含用例）。
>
> 覆盖率门禁（本文 §11.1 要求 `engine/ >= 95%`、`challenge/ >= 85%`）**未纳入上述命令**——`npm run coverage` 存在但不在 CI/门禁流程里，当前无覆盖率数据。
