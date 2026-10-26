# 研究：引擎正确性的机器验证基线

| 字段 | 值 |
|---|---|
| 日期 | 2026-10-25（脚本产出）；本说明补写于 2026-10-26 |
| 类型 | 技术可行性研究 / 验证基线说明 |
| 范围 | `docs/research/` 下三个 Python 脚本的用途、运行方式与权威地位 |
| 关联 | `docs/specs/execution/engine.md`（状态模型与置换系统）、`docs/specs/execution/verification.md` §12 步骤 0、`docs/specs/execution/ui-visual.md` §2.5（六色方案）、`docs/decisions/ADR-002.md`（禁止手写置换表） |

---

## 1. 为什么 `docs/research/` 下是 `.py` 而不是 `.md`

`project-conventions` 的 `directory-layout.md` 规定 `docs/research/` 收纳 "competitive analysis, market research, **technology investigations, feasibility studies**"。本目录下的三个脚本正是**可行性研究的产物与机器证据**，不是工程代码：

- 它们**不参与构建**（`src/ob-cube/` 的 `package.json` / `vite.config.ts` / `tsconfig.json` 都不引用它们）；
- 它们的输出是**结论**（退出码 0 / 非 0、实测数值），不是运行时行为；
- 它们在时间上**先于** TypeScript 实现存在——`permutation-proof.py` 的文档字符串写得很明确："在写任何 TypeScript 之前，证明『程序化几何生成置换表』这条路在数学上是可靠的。**如果这里过不了，ARCHITECTURE 的整个引擎方案就要推翻重做**。"

因此它们留在 `docs/research/`（研究证据），不移入 `src/`（工程代码）。本文件是该目录的研究说明。

## 2. 三个脚本

### 2.1 `permutation-proof.py`（350 行）

**目的**：证明"程序化几何生成置换表"在数学上可靠，N=2/3/4 统一处理。

**核心思想**：不使用任何手写置换数组。每个贴纸有唯一的三维位置与外法向量；一次转动 = 把落在指定层上的贴纸绕某轴旋转 90°/180°，再按旋转后的位置反查目标贴纸。

**它支撑的决策**：`ADR-002`（转动置换由几何算法程序化生成，禁止手写置换表）。这条决策的价值在于消除一整类静默错误——手写置换表里一个数字写错，表现为"某个特定层转动后某两个贴纸颜色互换"，极难定位；程序化生成则把正确性归约到几何公式的正确性，而几何公式可以穷举验证。

**运行**：`python -B docs/research/permutation-proof.py`，期望**退出码 0**。

> ⚠️ **已知的一处记法文档陈旧**：该脚本文档字符串的"记法"段里同时出现了 `Rw`（ss-2 规范形式）与 `2-3Rw`（ss-1 形式，ss-2 已改为 `2-3R`）。**这不影响脚本的验证效力**——它证明的是几何置换的正确性，与记法字符串的命名无关；但读它的人不要被误导。v2.0 的记法口径见 `docs/specs/execution/notation.md` 的修订说明。
>
> **有意不修改该脚本**：它是"退出码 0"这条基线的载体，任何改动都要求重跑并重新确立基线。修改一行文档字符串的收益，不足以支付"基线是否仍然有效"这个新问题的核对成本。此处的正确做法是**在本说明里登记**，而不是改脚本。

### 2.2 `verify-spec-vs-proof.py`（241 行）

**目的**：五源对齐验证——把架构文档里的算法**逐字实现**，与已验证的置换实现逐张贴纸比对落点。

**为什么需要第二步**：`permutation-proof.py` 证明了这条路走得通，但它用的是自己写的 `(face, row, col) → 坐标` 的 if-else 表。而架构文档（现 `execution/engine.md` §4.1/§4.3/§4.4）用的是另一套表述：外法向量 + 列基 `u` + 行基 `v` + 位置公式 `p = n·(N-1) + u·c(col) + v·c(row)`，且 slot 顺序是 `[U,R,F,D,L,B]`。

两套实现如果有一处基向量写反、有一处符号错，就会产生"**某一面的颜色矩阵镜像**"这类极难发现的静默错误——魔方看起来照样能转、照样能还原，只是某一面的贴纸排布是镜像的。本脚本逐张贴纸比对，把这类错误变成退出码非 0。

**它支撑的结论**：架构文档可以直接作为实现契约（这也是 `conversation/02-phase1-research.md` 记录的做法——把 §4.1/§4.3/§4.4 的算法逐字实现后与验证一逐张贴纸比对）。

**运行**：`python -B docs/research/verify-spec-vs-proof.py`，期望**退出码 0**。

### 2.3 `_color-math.py`（135 行）

**目的**：配色实测。计算 sRGB → 线性 → 相对亮度 → WCAG 对比度 → CIE Lab → ΔE，用于验证六色方案的可区分性与遮蔽色的安全性。

**它产出的关键实测数据**（这些数据被 `execution/ui-visual.md` 与 `design/design-tokens.json` 引用，是**被测指标**而非主观配色）：

| 实测项 | 结论 |
|---|---|
| 六色 L\* 阶梯 | U `#F4F7FB` 97.11 / D `#F5C93C` 82.66 / F `#3DCE80` 73.99 / L `#F5821F` 66.12 / B `#5484EC` 56.53 / R `#CB3A36` 46.97 |
| 遮蔽色 `--cube-masked` `#2B323C` | L\* 20.52；vs 6 个贴纸色的最小 ΔE = **63.85**（vs B 蓝），是 AC-16 阈值 20 的 **3.2 倍** |
| 最危险的一对 | **不是**"冷灰遮蔽色 vs 白色贴纸"，而是"**蓝调遮蔽色 vs 蓝色贴纸**"——深色竞技风的遮蔽色天然带冷蓝，而六色里正好有蓝 |
| 主 CTA 色 | `--accent-primary`（青绿）L\* 75.6 与 F 面绿 L\* 74.0 **只差 1.6**，因此不得用作主按钮填充；主 CTA 改用 `--action-bg`（白实心，15.52:1） |
| 已批准的 fallback | `#3A4152`（vs `--bg-stage` 1.89:1，ΔE 最差 56.48） |

**运行**：文件名前缀 `_` 表示它是**辅助/内部脚本**，不作为门禁。按需运行以复算上表数值。

> **改动遮蔽色或任一夜纸色之前必须重跑本脚本。** AC-16 的断言②是"探针像素 vs 6 个贴纸色的 ΔE ≥ 20"，`--cube-masked` 的取值受这条约束，因此它**不能**作为"配色微调"随意改动。若有人想把遮蔽色调成"更深更蓝"，第一个要测的就是它和 `--cube-B` 的距离。

## 3. 门禁地位

`execution/verification.md` §12 的端到端验证步骤把前两个脚本列为**步骤 0**，在 `npm install` 之前：

```bash
# 0. 引擎算法基线（已通过，改动引擎后必须重跑）
python -B docs/research/permutation-proof.py        # 退出码 0
python -B docs/research/verify-spec-vs-proof.py     # 退出码 0
```

**触发条件**：任何对 `src/ob-cube/src/engine/`（`geometry.ts` / `permutation.ts` / `state.ts` / `slots.ts` / `solved.ts`）的改动。改引擎而不重跑这两个脚本，等于放弃了本项目唯一一处"数学正确性"的机器证据——单元测试能抓住的是"实现与测试预期一致"，抓不住"实现与架构文档的算法一致"，后者正是 `verify-spec-vs-proof.py` 的职责。

**本次迁移未重跑**：2026-10-26 的目录迁移与 v2.0 文档重构**没有改动任何引擎代码**（代码改动仅限 9 处注释，见 `docs/migrations/2026-10-26-directory-migration.md` §4.1），因此基线仍然有效。迁移前的最近一次记录为退出码 0。

## 4. 环境要求

- Python 3（本机为 CPython 3.14，`.pyc` 缓存目录 `__pycache__/` 已在本次迁移中删除，会在下次运行时重新生成）
- 无第三方依赖：三个脚本只用标准库（`math` / `itertools`）
- Windows 下命令用 `python`（**不是 `python3`**——本机 `python3` 会触发 Microsoft Store 的安装提示而不执行）
