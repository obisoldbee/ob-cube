# 执行契约 · Agent API 实现契约

> 所属：**执行侧文档树** `docs/specs/execution/`。产品口径见 [`../PRD.md`](../PRD.md)，架构总纲见 [`CONTRACT.md`](CONTRACT.md)，设计总纲见 [`UIUX.md`](UIUX.md)。
> 权威级别：**实现契约（How）**。与 `../prd/` 冲突时以 PRD 为准；AC 编号一律以 [`../prd/11-appendix.md`](../prd/11-appendix.md) 附录 C 为唯一真源。
> 来源：原 `ARCHITECTURE.md` v1.4 §7（Agent API 契约），**失败形状与错误码已按 v2.0 裁定修订**
> 本文件独占的主题：TS 类型定义、camelCase↔snake_case 转换、方法契约、`observation_id` 生成、**错误码全名 ↔ PRD 短名映射表（全项目唯一权威）**、幂等、观察权限模型、蒙尘门控落地、180° 开放事件、真实观察示例。**其他文件不得重述，只能链接到此处。**

---

## 7. Agent API 契约

### 7.1 传输形态

`window.cubeAgent`。所有方法同步返回 `ApiResult`，不返回 Promise，不抛异常。

- **为什么不抛异常**：调用方主要是 LLM 驱动的自动化（Playwright / DevTools / 浏览器类 MCP）。返回值里带结构化错误码，比捕获异常更可靠、也更容易被写进日志做统计分析。
- **为什么全同步**：引擎与规则层全是纯内存计算（单步 `O(6N²)` 整数运算）。真正的异步只存在于「动画播放」与「渲染」，而 Agent 不应等待动画——动画与状态提交解耦（§8.3），所以契约层可以保持完全同步。这个能力是「Agent 与人类共用同一引擎」这一原则的直接收益。

```ts
// 成功分支是「payload 平铺在根对象上」，不是包在 data 里。
// 依据 PRD AC-42：applyMove 的返回值必须能在根上直接取到全部字段。
// 若包一层 data，这些断言全部落空。
type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: ApiError };

interface ApiError {
  code: ErrorCode;
  message: string;          // 人类可读，一句话
  hint: string;             // 可执行的下一步建议
  retryable: boolean;
  details?: Record<string, unknown>;
}
```

> ### ⚠️ v2.0 修订：上面的 `ApiResult<T>` 判别联合**已被废除**，不要照它实现
>
> 裁定见 [`../prd/07-agent-api.md`](../prd/07-agent-api.md) §7.3：**失败一律抛 `CubeError`，不返回 `{ok:false, ...}`**。三形状曾并存（PRD v1.10 的 `{ok:false,error_code}` / 本文的 `{ok:false,error:{code,hint,retryable}}` / SPEC 的"抛"），v2.0 收敛到实现口径。
>
> 现行形状（字面真源 `src/ob-cube/src/contracts.ts`）：
>
> ```ts
> // 成功：payload 直接平铺在根上返回，无 ok 键（不抛即成功）
> // 失败：throw new CubeError(code, message, hint)
> class CubeError extends Error {
>   readonly code: ErrorCode;   // E_ 前缀全名，见 §7.6
>   readonly hint: string;      // 可执行的下一步建议
> }
> ```
>
> 与 `ApiError` 的差异：**没有 `ok` 判别键、没有 `retryable`、没有 `details`**；`message` 由 `Error` 基类承载。`retryable` 的语义信息在 §7.6 错误码表的最后一列里作为**文档属性**保留（供 Agent 开发者查阅），但不是运行时字段。
>
> 选抛异常而非返回值的理由：① 已交付且被 `tests/` 与四轮评审覆盖；② 调用方无法"忽略"一个异常，契合"校验全部前置、失败绝不改状态"；③ 三形状并存本身就是缺陷，必须收敛到一个。
>
> **另一处与实现不符**：本节说"转换只允许出现在 `agent/to-wire.ts` 一个文件中"，但 **`agent/to-wire.ts` 不存在**——实际是 `src/agent/index.ts` 直接产出 snake_case 对象（`contracts.ts` 里的公开类型本来就是 snake_case，没有 camelCase→snake_case 的转换层）。`CONTRACT.md` §9.1 的目录树同此问题，见该文件的 v2.0 修订说明。

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
type Notation = string;                     // 归一化后的 ss-2 记法，单步

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
  | 'ended_invalid'  // 累计 3 次 NOT_SOLVED（AC-29）
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
  notation_version: 'ss-2';
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
  notation_version: 'ss-2';
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
  // ---- AC-42 要求平铺在根上的字段（v2.0 修订为 13 个，原注释写 8）----
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
    gen_version: string;          // v2.0 修订：原 algorithm_version: number
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
| `observe(opts?)` | `{ requested_faces?: FaceId[] }` | `Observation` | `status ∈ {running, solved_pending}` | 未开始 `E_CHALLENGE_NOT_STARTED`；已结束 `E_CHALLENGE_ENDED`；暂停 `E_CHALLENGE_PAUSED`；请求含未授权面时**不报错、只在 `face_colors` 里省略该面**（AC-19：未授权面以缺失键表达；`E_OBSERVATION_DENIED` 是 ARCHITECTURE 虚构的码，`ERROR_CODES` 里不存在，v2.0 删除）；次数用尽 `E_OBSERVATION_BUDGET_EXHAUSTED`；`after_move` 模式未操作即观察 `E_OBSERVATION_REQUIRES_MOVE` |
| `rotateView(req)` | `RotateViewRequest` | `ViewState` + 本次产生的 `ViewEvent` | `status ∈ {ready, running, solved_pending}`（v1.10：ready 放开，预观察需要转视角） | 未开始 `E_CHALLENGE_NOT_STARTED`；暂停 `E_CHALLENGE_PAUSED`；`up` 与 `front` 共线 `E_VIEW_ORIENTATION_INVALID`；面标识非法 `E_VIEW_FACE_UNKNOWN` |
| `applyMove(move, opts?)` | 单步记法 + `{ op_id?, channel? }` | `MoveResult`（含 AC-42 的 **13** 个字段（v2.0 修订）） | `status === 'running'` | §5.4 全部记法错误；`x/y/z` → `E_NOTATION_ORIENTATION_NOT_MOVABLE`；`solved_pending` → `E_CUBE_ALREADY_SOLVED`；已结束 `E_CHALLENGE_ENDED`；暂停 `E_CHALLENGE_PAUSED`；超时 `E_DEADLINE_EXCEEDED`；步数用尽 `E_MOVE_LIMIT_REACHED`；单帧超频 `E_RATE_LIMITED` |
| `getProgress()` | — | `Progress` + `status` | 无 | 无（无挑战时 `E_NO_ACTIVE_CHALLENGE`）；暂停时仍可用（AC-73） |
| `getLastActionResult(op_id?)` | 可选 opId | `MoveResult \| null` | 已有操作 | 指定 opId 不存在 `E_OP_ID_NOT_FOUND` |
| `submitSolution(note?)` | 可选说明 | `SubmitResult` | `status ∈ {running, solved_pending}`（`running` 下未还原返回 `E_NOT_SOLVED`；`solved_pending` 下成功结算） | 未还原 `E_NOT_SOLVED`（**不终止**，累计第 3 次转 `ended_invalid`，AC-29）；已结束 `E_CHALLENGE_ENDED`；暂停 `E_CHALLENGE_PAUSED`；未开始 `E_CHALLENGE_NOT_STARTED` |
| `getChallengeResult(challenge_id, run_id?)` | 挑战 ID + 可选运行 ID | `ChallengeResult` | 该运行已结束 | 未结束 `E_RUN_NOT_FINISHED`；不存在 `E_RUN_NOT_FOUND` |
| `abandonChallenge(reason?)` | 可选原因 | `RunSummary`（`ended_reason === 'aborted'`） | `status ∈ {running, paused}` | 已结束 `E_CHALLENGE_ENDED`；未开始 `E_CHALLENGE_NOT_STARTED` |

**AC-41 的边界（钉死）**：`window.cubeAgent` 的自有属性集合必须**恰好**等于上表 9 个方法名，不得多也不得少。具体禁止：挂 `engine` / `state` / `scramble` 等对象型属性；挂 `getDebugState` / `getSolution` / `getScramble` / `getFullState`（AC-64 会逐个断言不存在）；挂 `parseNotation`（见 §7.2）；挂 `pause` / `resume`（AC-58：Agent 模式不支持暂停）。用 `Object.freeze` 冻结这个对象，并配一条单测断言 `Object.keys(window.cubeAgent).sort()` 等于硬编码的 9 个名字（T-32）。

`abandonChallenge` 是「主动结束」的唯一入口，对应 PRD AC-30 的人类「放弃」按钮。它不检查是否已还原，也不校验步数；调用后 `ended_reason === 'aborted'`，此前全部事件保留。

`paused` 状态下，`observe` / `applyMove` / `rotateView` / `submitSolution` 一律返回 `E_CHALLENGE_PAUSED`；`getProgress` 与 `getChallengeInfo` 仍可用（否则 Agent 无法判断自己处在什么状态）。**真暂停冻结计时**（`pause_stops_clock: true`）：`elapsed_ms` 扣除暂停段，`remaining_ms` 不变；错误文案必须含「计时已冻结」（PRD §7.2.1 / AC-73）。

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

### 7.6 错误码表（全项目唯一权威）

命名口径与 [`../prd/09-contract-nfr.md`](../prd/09-contract-nfr.md) §12.1 一致：PRD 用无前缀短名便于叙述，实现与 API 一律用 `E_` 前缀。**`CubeError.code` 永远是 `E_` 形式**，短名只用于文档交叉引用。

**字面真源是 `src/ob-cube/src/contracts.ts` 的 `ERROR_CODES`（30 码）。** 本表与它逐项核对过：30 个真实码全部在下表登记，无遗漏。

> #### ⚠️ 幽灵码登记（文档里出现过、但 `ERROR_CODES` 里不存在的名字）
>
> v2.0 对全部执行侧文档做了一次错误码集合差分（`grep -oE '\bE_[A-Z_]+'` vs `ERROR_CODES`），查出 **8 个幽灵码**。**在本表下方或其他执行侧文档里读到它们时，一律按本登记处理，不要当成真实存在的码去 catch。**
>
> | 幽灵码 | 出现处 | 真实情况 | 处理 |
> |---|---|---|---|
> | `E_PAUSED` | ARCHITECTURE v1.4 多处 | 实名 **`E_CHALLENGE_PAUSED`** | 本文已全量替换 |
> | `E_INVALID_MOVE` | ARCHITECTURE §5.4 | 实名 **`E_NOTATION_MALFORMED`**（另有细分 `E_NOTATION_LOWERCASE` / `E_NOTATION_MULTIPLE_MOVES`） | 见下表记法错误组 |
> | `E_OBSERVATION_DENIED` | 本文 §7.4 / §7.8 原文 | **不存在**。实现把观察拒绝拆成三码：`E_OBSERVATION_BUDGET_EXHAUSTED`（次数用尽）/ `E_OBSERVATION_REQUIRES_MOVE`（`after_move` 档未转动）/ `E_STALE_OBSERVATION`（严格档观察过期）。而"`requested_faces` 含未授权面"**根本不报错**——AC-19 要求未授权面以缺失键表达，`face_colors` 里直接省略 | 本文 §7.4 已改；下方表中该行标 `[幽灵]` |
> | `E_INVALID_STATE` | `engine.md` §3.4、`persistence.md`、`puzzle.md`、`verification.md` T-31、本文下表 | **不存在**。题面非法在生成期由 `puzzle` 层拒绝（不经错误码通道）；镜像配色在提交期以 `SubmitResult.mismatch.reason === 'invalid-scheme'` 区分 | **P1 待补**。AC-12 / AC-26 已按此修订，见 [`../prd/10-acceptance.md`](../prd/10-acceptance.md) |
> | `E_INVALID_SUBMISSION` | 本文下表 | **不存在**。`ended_invalid` 是**终态**（`ChallengeStatus`），不是错误码；累计 3 次 `E_NOT_SOLVED` 后转入该终态 | 下方表中该行标 `[幽灵]` |
> | `E_IMPORT_TOO_LARGE` / `E_IMPORT_UNSAFE_KEY` / `E_SCHEMA_AHEAD` | `verification.md` T-31、`persistence.md` §10.3 | **规划中的未来码**，导入功能不在范围（`../prd/01-product-scope.md` §4），因此当前不存在 | 保留为 P1/P2 导入路径的设计占位，读到时不要当成现有码 |

| code | PRD 短名 | httpLike | 触发条件 | Agent 应如何处理 | retryable |
|---|---|---|---|---|---|
| `E_NO_ACTIVE_CHALLENGE` | — | 409 | 尚未创建挑战 | 先创建挑战 | false |
| `E_CHALLENGE_NOT_STARTED` | `NOT_STARTED` | 409 | `status ∈ {idle, ready}`（**`configuring` 不存在**，见规则 G5） | 调用开始（人类点「开始」或自动化触发） | false |
| `E_CHALLENGE_ENDED` | `ALREADY_FINISHED` | 409 | 已进入 `ended_*` | 改调 `getChallengeResult` | false |
| `E_CHALLENGE_PAUSED` | `PAUSED` | 409 | `status === 'paused'` | 等待恢复；计时已冻结 | true |
| `E_CUBE_ALREADY_SOLVED` | `ALREADY_SOLVED` | 409 | `status === 'solved_pending'` | 立即 `submitSolution` | false |
| `E_DEADLINE_EXCEEDED` | `TIMEOUT` | 408 | 剩余时间 ≤ 0，且 `status !== 'solved_pending'` | 停止操作，`getChallengeResult` | false |
| `E_MOVE_LIMIT_REACHED` | `MOVE_LIMIT` | 409 | 步数已达上限 | 尝试 `submitSolution`；若未还原则本局失败 | false |
| `E_RATE_LIMITED` | `RATE_LIMITED` | 429 | 单帧 API 调用超过 60 次 | 降低频率；这是防 Agent 死循环打爆主线程的护栏 | true |
| `E_NOT_SOLVED` | `NOT_SOLVED` | 422 | 提交时未还原 | 继续操作；累计 3 次后挑战以 `ended_invalid` 终止 | true |
| ~~`E_INVALID_SUBMISSION`~~ `[幽灵]` | — | — | **该码不存在**。已达 3 次 `E_NOT_SOLVED` 后转入**终态** `ended_invalid`（`ChallengeStatus`），不是错误码 | 本局作废，改调 `getChallengeResult` | false |
| `E_INVALID_STATE` `[幽灵·P1 待补]` | `INVALID_STATE` | 422 | 导入题面不可还原；或 §3.4 手性检查得到 `det = -1`。**当前不在 `ERROR_CODES` 里**：生成期由 `puzzle` 层直接拒绝，提交期以 `SubmitResult.mismatch.reason === 'invalid-scheme'` 区分 | 换题面；不得在本局继续 | false |
| `E_NOTATION_MALFORMED` | `INVALID_MOVE` | 422 | 语法不匹配 | 读 `hint`，可先 `parseNotation` 试跑 | true |
| `E_NOTATION_LOWERCASE` | `INVALID_MOVE` | 422 | 小写面字母 | 改大写 | true |
| `E_NOTATION_MULTIPLE_MOVES` | `INVALID_MOVE` | 422 | 单次传入多步 | 拆成多次 `applyMove` | true |
| `E_NOTATION_ORIENTATION_NOT_MOVABLE` | `ORIENTATION_NOT_MOVABLE` | 422 | 传了 `x/y/z` | 改调 `rotateView` | true |
| `E_MOVE_LAYER_OUT_OF_RANGE` | `INVALID_LAYER` | 422 | 层号越界 | 读 `allowed_actions.layer_indices` | true |
| `E_MOVE_COVERS_ALL_LAYERS` | `INVALID_LAYER` | 422 | 覆盖全 N 层 | 若意图是改朝向，用 `rotateView` | true |
| `E_SLICE_NOT_AVAILABLE` | `INVALID_MOVE` | 422 | 偶数阶用 `M/E/S` | 改用 `nF` 内层写法 | true |
| ~~`E_OBSERVATION_DENIED`~~ `[幽灵]` | ~~`OBSERVATION_DENIED`~~ | — | **该码不存在**。`requested_faces` 含未授权面时**不报错**，`face_colors` 里直接省略该面（AC-19）。观察拒绝实际用三码：`E_OBSERVATION_BUDGET_EXHAUSTED` / `E_OBSERVATION_REQUIRES_MOVE` / `E_STALE_OBSERVATION` | 按三码分别处理：无预算则停止观察、需先转动则 `applyMove`、过期则重新 `observe` | 见各码 |
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
| `E_SEED_INVALID` | — | 422 | seed 文本长度非法 | 用 1..32 字符（v2.0 修订） | true |
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

- `scramble` 序列、`seed`、以及 `generation` 的全部字段（含 `gen_version`、`filter_policy`）
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

**v2.0 修订**：原文写"`requested_faces` 含未授权面则整个请求被拒绝，返回 `E_OBSERVATION_DENIED`"——**该码不存在，且该语义与 AC-19 冲突**。现行口径：**未授权面不报错，只在 `face_colors` 里以缺失键表达**；`visible_faces` 给出本次实际授权的面集合。请求含未授权面不会导致整个请求失败（这样 Agent 不必先猜哪些面被授权才能观察）。

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
    "notation_version": "ss-2",
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
    "notation_version": "ss-2",
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
    "notation_version": "ss-2",
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

