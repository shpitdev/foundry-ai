import * as Effect from 'effect/Effect';

/** Placeholder body for a public API whose implementation phase has not landed. Delete with the last stub. */
export const notImplemented = (api: string): Effect.Effect<never> =>
  Effect.die(`${api} is not implemented yet. See packages/foundry-effect-ai/docs/PLAN.md.`);
