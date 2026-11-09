export class StaleWorkspaceOperationError extends Error {
  constructor() {
    super('The account session changed. Review the current workspace before continuing.');
    this.name = 'StaleWorkspaceOperationError';
  }
}

/** Business-request results belong to the identity that started them. Abort is
 * only a transport hint: completed responses can still be queued for delivery. */
export function createSessionOperationScope() {
  let generation = 0;
  const pending = new Set();
  return {
    invalidate() {
      generation++;
      for (const controller of pending) controller.abort();
      pending.clear();
    },
    begin() {
      const started = generation, controller = new AbortController();
      pending.add(controller);
      const isCurrent = () => started === generation && !controller.signal.aborted;
      const assertCurrent = () => { if (!isCurrent()) throw new StaleWorkspaceOperationError(); };
      return {
        signal: controller.signal,
        isCurrent,
        assertCurrent,
        finish() { pending.delete(controller); },
        /** @template T @param {() => Promise<T>} action @returns {Promise<T>} */
        async wait(action) {
          assertCurrent();
          try {
            const result = await action();
            assertCurrent();
            return result;
          } catch (error) {
            assertCurrent();
            throw error;
          }
        },
      };
    },
  };
}
