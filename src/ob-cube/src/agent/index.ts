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

import { CubeError } from '../contracts';
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
      // AC-64：ready 态 seed 与 scramble 必须为 null——seed 能重建题面，
      // 属蒙尘门控范围。开始后题面本身已可观察，seed 才允许出现。
      const hidden = session.status === 'ready' || session.status === 'idle';
      return {
        ...rules,
        seed: hidden ? null : rules.seed,
        scramble: null,
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
        session.tick();
        const result = session.applyMoveNotation(move, opts?.op_id);
        return {
          ok: true,
          ...result,
          observation_id: result.next_observation.observation_id,
          based_on_observation_id: opts?.based_on_observation_id ?? null,
        };
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
    getChallengeResult(challengeId: string, _runId?: string) {
      if (challengeId !== session.rules.challenge_id) {
        throw new CubeError('E_RUN_NOT_FOUND', `找不到挑战 ${challengeId}`, '请核对 challenge_id');
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
