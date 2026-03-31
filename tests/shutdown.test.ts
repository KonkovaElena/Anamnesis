import assert from "node:assert/strict";
import test from "node:test";
import { createGracefulShutdownHandler } from "../src/graceful-shutdown";

test("graceful shutdown drains first and force closes active HTTP connections after timeout", () => {
  const calls: string[] = [];
  const writes: string[] = [];
  const cleared: unknown[] = [];
  let closeCallback: (() => void) | undefined;
  let scheduledTask:
    | {
        callback: () => void;
        delayMs: number;
        handle: {
          unrefCalled: boolean;
          unref: () => void;
        };
      }
    | undefined;

  const server = {
    close(callback?: (error?: Error) => void) {
      calls.push("close");
      closeCallback = () => {
        calls.push("close-callback");
        callback?.();
      };
      return this;
    },
    closeIdleConnections() {
      calls.push("closeIdleConnections");
    },
    closeAllConnections() {
      calls.push("closeAllConnections");
    },
  };

  const shutdown = createGracefulShutdownHandler(server, {
    forceCloseTimeoutMs: 250,
    writeStdout: (message) => {
      writes.push(message);
    },
    setTimeoutImpl: (callback, delayMs) => {
      const handle = {
        unrefCalled: false,
        unref() {
          this.unrefCalled = true;
        },
      };
      scheduledTask = { callback, delayMs, handle };
      return handle;
    },
    clearTimeoutImpl: (handle) => {
      cleared.push(handle);
    },
  });

  shutdown("SIGTERM");

  assert.deepEqual(calls, ["close", "closeIdleConnections"]);
  assert.equal(scheduledTask?.delayMs, 250);
  assert.equal(scheduledTask?.handle.unrefCalled, true);
  assert.match(writes[0] ?? "", /SIGTERM received/i);

  scheduledTask?.callback();

  assert.deepEqual(calls, ["close", "closeIdleConnections", "closeAllConnections"]);
  assert.match(writes.at(-1) ?? "", /force closing active HTTP connections/i);

  closeCallback?.();

  assert.equal(cleared.length, 1);
  assert.match(writes.at(-1) ?? "", /server closed/i);
});

test("graceful shutdown ignores repeated signals once draining has started", () => {
  let closeCalls = 0;
  let scheduledCount = 0;

  const shutdown = createGracefulShutdownHandler(
    {
      close() {
        closeCalls += 1;
        return this;
      },
    },
    {
      setTimeoutImpl: () => {
        scheduledCount += 1;
        return {};
      },
      clearTimeoutImpl: () => {},
    },
  );

  shutdown("SIGTERM");
  shutdown("SIGINT");

  assert.equal(closeCalls, 1);
  assert.equal(scheduledCount, 1);
});
