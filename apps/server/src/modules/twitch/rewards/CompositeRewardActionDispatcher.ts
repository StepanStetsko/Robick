import type {
  RewardActionDispatcher,
  RewardDispatchContext,
  RewardDispatchResult,
} from "./reward-dispatch.types.js";

export class CompositeRewardActionDispatcher implements RewardActionDispatcher {
  constructor(private readonly dispatchers: RewardActionDispatcher[]) {}

  async dispatch(context: RewardDispatchContext): Promise<RewardDispatchResult> {
    const transports: string[] = [];
    let lastDispatchedAt = new Date().toISOString();

    for (const dispatcher of this.dispatchers) {
      const result = await dispatcher.dispatch(context);
      if (!result.skipped) {
        transports.push(result.transport);
      }
      lastDispatchedAt = result.dispatchedAt;
    }

    return {
      ok: true,
      transport: transports.join("+") || "none",
      dispatchedAt: lastDispatchedAt,
    };
  }
}
