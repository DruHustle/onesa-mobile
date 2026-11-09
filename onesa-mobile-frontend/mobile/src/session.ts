/** A result from a previous identity, API lifecycle or component mount is unusable. */
export class StaleSessionError extends Error {
  constructor() {
    super("The account changed. Retry from the current account.");
    this.name = "StaleSessionError";
  }
}

export interface SessionOperation {
  readonly signal: AbortSignal;
  isCurrent(): boolean;
  assertCurrent(): void;
}

/** One cancellation boundary for all work belonging to the current local identity. */
export class SessionBoundary {
  private revision = 0;
  private alive = true;
  private controller = new AbortController();

  get isActive(): boolean {
    return this.alive;
  }

  capture(): SessionOperation {
    const revision = this.revision;
    const signal = this.controller.signal;
    const isCurrent = () =>
      this.alive && this.revision === revision && !signal.aborted;
    return {
      signal,
      isCurrent,
      assertCurrent() {
        if (!isCurrent()) throw new StaleSessionError();
      },
    };
  }

  invalidate(): SessionOperation {
    this.controller.abort();
    this.revision++;
    this.controller = new AbortController();
    return this.capture();
  }

  activate(): SessionOperation {
    this.alive = true;
    return this.invalidate();
  }

  dispose(): void {
    this.alive = false;
    this.invalidate();
  }
}

/** Guard both successful and failed completion, including transports that ignore abort. */
export async function inSession<T>(
  operation: SessionOperation,
  action: () => Promise<T>,
): Promise<T> {
  operation.assertCurrent();
  try {
    const value = await action();
    operation.assertCurrent();
    return value;
  } catch (error) {
    operation.assertCurrent();
    throw error;
  }
}

export interface PrivateStorageAdapter {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class StorageCleanupRequiredError extends Error {
  constructor() {
    super("Private account storage must be cleared before signing in again.");
    this.name = "StorageCleanupRequiredError";
  }
}

/**
 * Instantiate once outside React so old and new mounts share the same queue.
 * Native secure-storage writes cannot be cancelled. A stale write is removed
 * before a later identity can read or write the same storage.
 */
export class SessionStorage {
  private tail: Promise<unknown> = Promise.resolve();
  private readonly adapter: PrivateStorageAdapter;
  private readonly pendingCleanup = new Set<string>();

  constructor(adapter: PrivateStorageAdapter) {
    this.adapter = adapter;
  }

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action, action);
    this.tail = result.catch(() => undefined);
    return result;
  }

  private assertClean(keys: readonly string[]): void {
    if (keys.some((key) => this.pendingCleanup.has(key)))
      throw new StorageCleanupRequiredError();
  }

  private async removeAll(keys: readonly string[]): Promise<void> {
    for (const key of keys) this.pendingCleanup.add(key);
    let failed = false;
    // Finish every native removal before the next queued identity can proceed.
    for (const key of keys) {
      try {
        await this.adapter.remove(key);
      } catch {
        failed = true;
      }
    }
    if (failed) throw new StorageCleanupRequiredError();
    for (const key of keys) this.pendingCleanup.delete(key);
  }

  read(
    operation: SessionOperation,
    keys: readonly string[],
  ): Promise<(string | null)[]> {
    return this.enqueue(() =>
      inSession(operation, () => {
        this.assertClean(keys);
        return Promise.all(keys.map((key) => this.adapter.read(key)));
      }),
    );
  }

  write(
    operation: SessionOperation,
    key: string,
    value: string,
    clearFirst: readonly string[] = [],
  ): Promise<void> {
    return this.enqueue(async () => {
      operation.assertCurrent();
      this.assertClean([key, ...clearFirst]);
      if (clearFirst.length) {
        await this.removeAll(clearFirst);
        operation.assertCurrent();
      }
      try {
        await this.adapter.write(key, value);
      } finally {
        // No later queued operation can have written this key yet.
        if (!operation.isCurrent()) await this.removeAll([key]);
      }
      operation.assertCurrent();
    });
  }

  clear(keys: readonly string[], operation?: SessionOperation): Promise<void> {
    return this.enqueue(async () => {
      operation?.assertCurrent();
      await this.removeAll(keys);
      operation?.assertCurrent();
    });
  }
}

/** Never present a completed old-account download, and always remove its temporary file. */
export async function shareSessionDocument(
  operation: SessionOperation,
  actions: {
    download(): Promise<unknown>;
    share(): Promise<unknown>;
    cleanup(): void | Promise<void>;
  },
): Promise<void> {
  try {
    await inSession(operation, actions.download);
    await inSession(operation, actions.share);
  } finally {
    await actions.cleanup();
  }
}
