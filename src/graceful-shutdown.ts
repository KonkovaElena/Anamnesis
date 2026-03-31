export interface GracefulShutdownTimer {
  unref?: () => void;
}

export interface GracefulShutdownServer {
  close: (callback?: (error?: Error) => void) => unknown;
  closeIdleConnections?: () => void;
  closeAllConnections?: () => void;
}

export interface GracefulShutdownOptions {
  forceCloseTimeoutMs?: number;
  writeStdout?: (message: string) => void;
  writeStderr?: (message: string) => void;
  setTimeoutImpl?: (callback: () => void, delayMs: number) => GracefulShutdownTimer;
  clearTimeoutImpl?: (handle: GracefulShutdownTimer) => void;
}

const DEFAULT_FORCE_CLOSE_TIMEOUT_MS = 10_000;

export function createGracefulShutdownHandler(
  server: GracefulShutdownServer,
  options: GracefulShutdownOptions = {},
) {
  const forceCloseTimeoutMs = options.forceCloseTimeoutMs ?? DEFAULT_FORCE_CLOSE_TIMEOUT_MS;
  const writeStdout = options.writeStdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = options.writeStderr ?? ((message: string) => process.stderr.write(message));
  const setTimeoutImpl = options.setTimeoutImpl ?? ((callback: () => void, delayMs: number) => setTimeout(callback, delayMs));
  const clearTimeoutImpl = options.clearTimeoutImpl ?? ((handle: GracefulShutdownTimer) => clearTimeout(handle as NodeJS.Timeout));

  let shutdownStarted = false;
  let forceCloseTimer: GracefulShutdownTimer | undefined;

  return (signal: string) => {
    if (shutdownStarted) {
      return;
    }

    shutdownStarted = true;
    writeStdout(`\n${signal} received — closing server\n`);

    forceCloseTimer = setTimeoutImpl(() => {
      writeStdout("shutdown drain timeout reached — force closing active HTTP connections\n");
      server.closeAllConnections?.();
    }, forceCloseTimeoutMs);

    forceCloseTimer.unref?.();

    server.close((error?: Error) => {
      if (forceCloseTimer) {
        clearTimeoutImpl(forceCloseTimer);
      }

      if (error) {
        writeStderr(`${error.message}\n`);
        return;
      }

      writeStdout("server closed\n");
    });

    server.closeIdleConnections?.();
  };
}