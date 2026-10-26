/**
 * agent/index.ts —— window.cubeAgent 契约投影。
 *
 * 白名单是**穷举**：恰好 9 个方法，多一个即违反 AC-41。
 * 因此这里**没有** createChallenge / startChallenge / parseNotation / pause / resume /
 * getFullState / getSolution / getScramble。
 *
 * 挑战由宿主页面创建（URL 参数或人类点击），Agent 只操作已创建的挑战。
 * 这是刻意的能力最小化：能读内存的人总能作弊，但 API 不该主动递刀子。
 *
 * 字段命名 snake_case（PRD §6.2），方法命名 camelCase（AC-41）。
 */

import { CubeError, isEnded } from '../contracts';
import type { ChallengeSession } from '../challenge';
import type { ViewState } from '../contracts';

/**
 * @param onMutate 变更型方法（applyMove / rotateView / submitSolution / abandonChallenge）
 * 返回后的宿主回调。UI 侧用它做同帧同步：API 驱动的状态迁移（尤其结束态）不能
 * 依赖 rAF/interval——后台标签页的定时器会被浏览器节流甚至暂停，而 Agent 脚本
 * 恰恰常在页面不可见时运行。
 */
export function createCubeAgent(session: ChallengeSession, onMutate?: () => void) {
  const after = (): void => {
    onMutate?.();
  };
  const api = {
    getChallengeInfo() {
      const rules = session.rules;
      // AC-64 / AC-77 / PRD §8.2 C3-C4：**整个未结束阶段**（ready / running / paused /
      // solved_pending）都必须隐藏题面字段。旧实现只在 ready / idle 隐藏，
      // 于是「开始挑战」后一调 getChallengeInfo 就能拿到 seed，配合确定性生成器
      // 直接重建打乱序列——评测要测的观察与还原过程被整个绕过。
      // 打乱序列的唯一出口是结束后的 getChallengeResult()。
      const hidden = !isEnded(session.status);
      return {
        ...rules,
        seed: hidden ? null : rules.seed,
        scramble: hidden ? null : session.record.scramble.join(' '),
        facelet_string: null,
        state_fingerprint: null,
        status: session.status,
        move_catalog: session.peekObservation().allowed_actions.notation,
      };
    },
    observe(_opts?: { requested_faces?: string[] }) {
      // observe 内部的 tick 可能把超时结算掉（Agent 常轮询 observe 而不是 getProgress）。
      // 只读方法本不触发宿主回调，但状态翻转必须让 UI 同帧跟上（AC-28）。
      const before = session.status;
      try {
        return session.observe();
      } finally {
        if (session.status !== before) after();
      }
    },
    rotateView(req: ViewState) {
      const result = session.rotateView(req);
      after();
      return result;
    },
    applyMove(move: string, opts?: { op_id?: string; based_on_observation_id?: string }) {
      try {
        // AC-42（v2.0 修订）：**恰好 13 个平铺字段**。这里不再额外塞 `ok` 与根级
        // `observation_id`——失败一律抛异常，观察 id 在 `next_observation` 里，
        // 「依据哪次观察」落进事件（`based_on_observation_id`），不放返回值。
        // 旧实现返回 16 个字段，对外契约与 PRD 逐字不符。
        return session.applyMoveNotation(move, opts?.op_id, opts?.based_on_observation_id ?? null);
      } finally {
        after();
      }
    },
    getLastActionResult(opId?: string) {
      if (opId === undefined) return session.getLastActionResult();
      const cached = session.getActionResult(opId);
      if (cached === null) {
        throw new CubeError('E_OP_ID_NOT_FOUND', `找不到操作 ${opId}`, '请核对 op_id');
      }
      return cached;
    },
    getProgress() {
      // 同 observe：getProgress 的 tick 若结算了超时，UI 不能等用户下一次操作才体现。
      const before = session.status;
      const result = session.getProgress();
      if (session.status !== before) after();
      return result;
    },
    submitSolution(note?: string) {
      try {
        return session.submitSolution(note);
      } finally {
        after();
      }
    },
    getChallengeResult(challengeId: string, runId?: string) {
      if (challengeId !== session.rules.challenge_id) {
        throw new CubeError('E_RUN_NOT_FOUND', `找不到挑战 ${challengeId}`, '请核对 challenge_id');
      }
      // R09：同题可以跑多轮。指定了 run_id 就必须按它校验，不能默默返回当前这轮
      // ——旧实现把 runId 参数整个忽略，"查第一轮"会返回第二轮的步数与耗时。
      if (runId !== undefined && runId !== session.rules.run_id) {
        throw new CubeError(
          'E_RUN_NOT_FOUND',
          `找不到运行 ${runId}`,
          '本会话只保留当前 run；历史各轮请从结果页或本地记录里按 run_id 查',
        );
      }
      return session.getChallengeResult();
    },
    abandonChallenge(note?: string) {
      try {
        session.abandon(note);
        return session.getChallengeResult();
      } finally {
        after();
      }
    },
  };
  return Object.freeze(api);
}

export type CubeAgentApi = ReturnType<typeof createCubeAgent>;

declare global {
  interface Window {
    cubeAgent?: CubeAgentApi;
  }
}

/** 由 main.ts 调用一次。重复挂载直接覆盖，不产生第二个会话。 */
export function mountCubeAgent(session: ChallengeSession, onMutate?: () => void): CubeAgentApi {
  const api = createCubeAgent(session, onMutate);
  window.cubeAgent = api;
  return api;
}
