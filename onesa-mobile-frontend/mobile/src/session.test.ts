import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "./api.ts";
import {
  inSession,
  SessionBoundary,
  SessionStorage,
  shareSessionDocument,
  StaleSessionError,
  StorageCleanupRequiredError,
  type PrivateStorageAdapter,
} from "./session.ts";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function memoryStorage(): {
  values: Map<string, string>;
  adapter: PrivateStorageAdapter;
} {
  const values = new Map<string, string>();
  return {
    values,
    adapter: {
      async read(key) {
        return values.get(key) ?? null;
      },
      async write(key, value) {
        values.set(key, value);
      },
      async remove(key) {
        values.delete(key);
      },
    },
  };
}

test("a delayed private read cannot populate the replacement account, even when transport ignores abort", async () => {
  const boundary = new SessionBoundary(),
    operation = boundary.capture();
  const response = deferred<string>();
  let displayed = "account A";
  const read = inSession(operation, () => response.promise).then((data) => {
    displayed = data;
  });
  const rejected = assert.rejects(read, StaleSessionError);
  boundary.invalidate();
  displayed = "account B";
  response.resolve("private account A records");
  await rejected;
  assert.equal(operation.signal.aborted, true);
  assert.equal(displayed, "account B");
});

test("an old mutation's delayed 401 is stale work, not an instruction to clear a new identity", async () => {
  const boundary = new SessionBoundary(),
    operation = boundary.capture();
  const response = deferred<void>();
  let newAccountCleared = false;
  const mutation = inSession(operation, () => response.promise).catch(
    (error) => {
      if (error instanceof ApiError && error.status === 401)
        newAccountCleared = true;
      throw error;
    },
  );
  const rejected = assert.rejects(mutation, StaleSessionError);
  const replacement = boundary.invalidate();
  response.reject(new ApiError(401, "SESSION_REVOKED", "Expired old session"));
  await rejected;
  assert.equal(newAccountCleared, false);
  assert.equal(replacement.isCurrent(), true);
});

test("a login response from an unmounted account screen cannot overwrite a new mount's credential", async () => {
  const oldMount = new SessionBoundary(),
    newMount = new SessionBoundary();
  const { values, adapter } = memoryStorage(),
    storage = new SessionStorage(adapter);
  const response = deferred<string>(),
    operation = oldMount.capture();
  const login = inSession(operation, () => response.promise).then(
    (credential) => storage.write(operation, "identity", credential),
  );
  const rejected = assert.rejects(login, StaleSessionError);
  oldMount.dispose();
  await storage.write(newMount.capture(), "identity", "account B token");
  response.resolve("account A token");
  await rejected;
  assert.equal(values.get("identity"), "account B token");
});

for (const key of ["identity", "identity.cache", "identity.flow"]) {
  test(`an uncancellable old ${key} write is removed before the next mount can read it`, async () => {
    const oldMount = new SessionBoundary(),
      newMount = new SessionBoundary();
    const { values, adapter } = memoryStorage();
    const started = deferred<void>(),
      finish = deferred<void>();
    const storage = new SessionStorage({
      ...adapter,
      async write(item, value) {
        if (value === "old private value") {
          started.resolve();
          await finish.promise;
        }
        values.set(item, value);
      },
    });
    const write = storage.write(oldMount.capture(), key, "old private value");
    const rejected = assert.rejects(write, StaleSessionError);
    await started.promise;
    oldMount.dispose();
    // These reads/writes use a distinct component boundary but the same storage queue.
    const nextRead = storage.read(newMount.capture(), [key]);
    const nextWrite = storage.write(
      newMount.capture(),
      key,
      "new private value",
    );
    finish.resolve();
    await rejected;
    assert.deepEqual(await nextRead, [null]);
    await nextWrite;
    assert.equal(values.get(key), "new private value");
  });
}

test("logout drains pending cache writes and deletes all private keys before the next identity commits", async () => {
  const boundary = new SessionBoundary(),
    { values, adapter } = memoryStorage();
  values.set("identity", "account A token");
  values.set("identity.flow", "account A verifier");
  const started = deferred<void>(),
    finish = deferred<void>();
  const storage = new SessionStorage({
    ...adapter,
    async write(key, value) {
      if (key === "identity.cache") {
        started.resolve();
        await finish.promise;
      }
      values.set(key, value);
    },
  });
  const staleWrite = storage.write(
    boundary.capture(),
    "identity.cache",
    "account A records",
  );
  const rejected = assert.rejects(staleWrite, StaleSessionError);
  await started.promise;
  const nextIdentity = boundary.invalidate();
  const clear = storage.clear(["identity", "identity.cache", "identity.flow"]);
  const nextWrite = storage.write(nextIdentity, "identity", "account B token");
  finish.resolve();
  await rejected;
  await clear;
  await nextWrite;
  assert.deepEqual([...values], [["identity", "account B token"]]);
});

test("failed cleanup of a stale native write blocks later mounts until explicit cleanup succeeds", async () => {
  const oldMount = new SessionBoundary(),
    newMount = new SessionBoundary();
  const { values, adapter } = memoryStorage();
  const started = deferred<void>(),
    finish = deferred<void>();
  let removalFails = true;
  const storage = new SessionStorage({
    ...adapter,
    async write(key, value) {
      started.resolve();
      await finish.promise;
      values.set(key, value);
    },
    async remove(key) {
      if (removalFails) throw new Error("Keychain temporarily unavailable");
      values.delete(key);
    },
  });
  const staleWrite = storage.write(
    oldMount.capture(),
    "identity",
    "old account token",
  );
  const blocked = assert.rejects(staleWrite, StorageCleanupRequiredError);
  await started.promise;
  oldMount.dispose();
  finish.resolve();
  await blocked;
  assert.equal(
    values.get("identity"),
    "old account token",
    "the simulated native removal actually failed",
  );
  await assert.rejects(
    storage.read(newMount.capture(), ["identity"]),
    StorageCleanupRequiredError,
  );
  await assert.rejects(
    storage.write(newMount.capture(), "identity", "new account token", [
      "identity",
    ]),
    StorageCleanupRequiredError,
  );
  await assert.rejects(
    storage.clear(["identity"]),
    StorageCleanupRequiredError,
  );
  removalFails = false;
  await storage.clear(["identity", "identity.cache", "identity.flow"]);
  assert.deepEqual(await storage.read(newMount.capture(), ["identity"]), [
    null,
  ]);
  await storage.write(newMount.capture(), "identity", "new account token");
  assert.equal(values.get("identity"), "new account token");
});

test("a queued credential replacement invalidated before it runs never deletes or writes another identity", async () => {
  const boundary = new SessionBoundary(),
    { values, adapter } = memoryStorage();
  const storage = new SessionStorage(adapter),
    operation = boundary.capture();
  values.set("identity", "current identity");
  const pending = storage.write(operation, "identity", "stale identity", [
    "identity",
  ]);
  const rejected = assert.rejects(pending, StaleSessionError);
  boundary.invalidate();
  await rejected;
  assert.equal(values.get("identity"), "current identity");
});

test("an account export completing after logout is deleted without opening the share sheet", async () => {
  const boundary = new SessionBoundary(),
    operation = boundary.capture();
  const download = deferred<void>();
  let shared = false,
    fileExists = true;
  const exporting = shareSessionDocument(operation, {
    download: () => download.promise,
    async share() {
      shared = true;
    },
    cleanup() {
      fileExists = false;
    },
  });
  const rejected = assert.rejects(exporting, StaleSessionError);
  boundary.invalidate();
  download.resolve();
  await rejected;
  assert.equal(operation.signal.aborted, true);
  assert.equal(shared, false);
  assert.equal(fileExists, false);
});

test("current-session documents share once and temporary files are also removed after download failure", async () => {
  const operation = new SessionBoundary().capture();
  const events: string[] = [];
  await shareSessionDocument(operation, {
    async download() {
      events.push("download");
    },
    async share() {
      events.push("share");
    },
    cleanup() {
      events.push("delete");
    },
  });
  assert.deepEqual(events, ["download", "share", "delete"]);
  await assert.rejects(
    shareSessionDocument(operation, {
      async download() {
        throw new Error("Connection interrupted");
      },
      async share() {
        assert.fail("a failed download cannot be shared");
      },
      cleanup() {
        events.push("failed-download-delete");
      },
    }),
    /Connection interrupted/,
  );
  assert.equal(events.at(-1), "failed-download-delete");
});

test("an API lifecycle restart invalidates old operations without reactivating their generation", () => {
  const boundary = new SessionBoundary(),
    old = boundary.capture();
  boundary.dispose();
  assert.equal(old.isCurrent(), false);
  assert.equal(boundary.isActive, false);
  const restarted = boundary.activate();
  assert.equal(restarted.isCurrent(), true);
  assert.equal(old.isCurrent(), false);
  assert.throws(() => old.assertCurrent(), StaleSessionError);
});
