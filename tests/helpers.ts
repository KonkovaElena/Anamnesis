import { once } from "node:events";
import { createServer } from "node:http";
import { type AddressInfo } from "node:net";
import { bootstrap } from "../src/bootstrap";
import type { BootstrapOptions } from "../src/bootstrap";

export async function withServer(
  run: (baseUrl: string) => Promise<void>,
  options?: Partial<BootstrapOptions>,
) {
  const { app, closeStore } = bootstrap({ allowInsecureDevAuth: true, ...options });
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    server.close();
    await once(server, "close");
    closeStore?.();
  }
}

export async function jsonRequest<T>(
  baseUrl: string,
  path: string,
  options?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  },
): Promise<{ status: number; body: T; headers: Headers }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options?.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...options?.headers,
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  return {
    status: response.status,
    body: (await response.json()) as T,
    headers: response.headers,
  };
}

export async function textRequest(
  baseUrl: string,
  path: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
  },
): Promise<{ status: number; body: string; headers: Headers }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options?.method ?? "GET",
    headers: options?.headers,
  });

  return {
    status: response.status,
    body: await response.text(),
    headers: response.headers,
  };
}
