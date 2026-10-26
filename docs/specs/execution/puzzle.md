# 执行契约 · 可复现题目系统

> 所属：**执行侧文档树** `docs/specs/execution/`。产品口径见 [`../PRD.md`](../PRD.md)，架构总纲见 [`CONTRACT.md`](CONTRACT.md)，设计总纲见 [`UIUX.md`](UIUX.md)。
> 权威级别：**实现契约（How）**。与 `../prd/` 冲突时以 PRD 为准；AC 编号一律以 [`../prd/11-appendix.md`](../prd/11-appendix.md) 附录 C 为唯一真源。
> 来源：原 `ARCHITECTURE.md` v1.4 §6（可复现题目系统），**seed 长度与生成方式已修订**
> 本文件独占的主题：PRNG 选型、seed 接受格式、challengeId 生成规则、题目记录字段、随机状态 vs 随机操作、复现方式裁决、指纹参数（FNV-1a）。**其他文件不得重述，只能链接到此处。**

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
| `string` | 去除首尾空白后长度 1..32（v2.0 修订，见下方说明），UTF-8 字节内 `FNV-1a 32` 得到 `seed32`；长度不合法 `E_SEED_INVALID` |

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
    mode: 'random_moves' | 'imported';   // v1 只产出 'random_moves'
    uniform_random_state: false;        // 恒为 false，字段存在是为了不给未来留谎报空间
    filter_policy: 'no-same-axis';      // 冗余过滤策略，影响序列，必须记录
    gen_version: 1;
  };
  seed_text: string | null;      // 用户原始输入（imported 时为 null）
  seed_u32_hex: string | null;   // 规范化后的 seed32
  scramble_length: number;
  scramble: string[];            // 归一化后的单步记法数组，复现的唯一依据
  scramble_fingerprint: string;  // fp32(scramble.join(' '))
  initial_state_fingerprint: string; // fp32(初始状态 char 序列)，用于重放校验
  notation_version: 'ss-2';
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
4. 对评测可比性的影响必须写进 PRD：**随机操作打乱的题目难度上限由 L 决定**。要保证跨 Agent 可比，只能固定 `L`、固定 `filter_policy`、固定 `gen_version`，让所有 Agent 面对同一个分布。默认值建议 `L = 11 / 20 / 30`（2/3/4 阶），理由：3 阶 God's number 为 20，`L=20` 已足以越过「浅层易解区」，而 4 阶的解长度量级更大，`L=30` 与之匹配。
5. 冗余过滤策略 `no-same-axis`（禁止相邻两步同面、禁止相邻两步共轴）会影响序列与分布，因此**它进指纹**。不加过滤会产生大量 `R R'`、`U D U` 这类可消去片段，实际有效长度远小于名义 L——这是「打乱长度不等于难度」的直接原因。

### 6.6 复现方式裁决

**结论：保存打乱序列重放，不保存最终状态快照；同时保存最终状态指纹作为校验位。**

理由：

1. **快照解决不了观察问题**。观察权限、事件日志、回放都需要「从已还原状态一步步推演」，而不是「导入一个静态局面」。序列重放天然支持前向推演与逐步回放；快照则需要额外实现「从快照出发的合法性校验」。
2. **序列更小、更易读、可人工核对**。30 步 4 阶打乱约 200 字节；快照要 96 个颜色值加元信息。
3. **算法升级后的旧题目仍可复现**，因为复现路径不依赖 PRNG，只依赖「记法解析 + 置换生成」这两层。真正会导致旧题目失效的只有**记法语义或置换语义的破坏性变更**，而那类变更必须升 `notation_version` / `gen_version`，并且 §11 的回归用例会锁住「3 阶 `2R` = `M'`」（**注：2 阶自 ss-2 起拒绝一切层前缀，`2R` 在 2 阶非法，AC-07；原「2 阶 `2R` = `L'`」不变式已作废**）这类跨版本不变式。
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

