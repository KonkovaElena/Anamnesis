import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { type AddressInfo } from "node:net";
import test from "node:test";
import { createApp } from "../src/application/create-app";
import { createAuthMiddleware } from "../src/application/auth-middleware";
import { bootstrap } from "../src/bootstrap";
import { InMemoryAuditTrailStore } from "../src/infrastructure/InMemoryAuditTrailStore";
import { InMemoryAnamnesisStore } from "../src/infrastructure/InMemoryAnamnesisStore";

const TEST_API_KEY = "test-secret-key-for-auth-tests";

async function withAuthServer(
  apiKey: string | undefined,
  run: (baseUrl: string) => Promise<void>,
) {
  const store = new InMemoryAnamnesisStore();
  const auditStore = new InMemoryAuditTrailStore();
  const authMiddleware = apiKey
    ? createAuthMiddleware({
        apiKey,
        skipPaths: new Set(["/healthz", "/readyz", "/metrics"]),
      })
    : undefined;

  const app = createApp({ store, auditStore, authMiddleware });
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
  }
}

test("request without Authorization header returns 401", async () => {
  await withAuthServer(TEST_API_KEY, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/cases`);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("www-authenticate"), "Bearer");
    const body = (await response.json()) as { code: string };
    assert.equal(body.code, "unauthorized");
  });
});

test("request with wrong Bearer token returns 401", async () => {
  await withAuthServer(TEST_API_KEY, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/cases`, {
      headers: { authorization: "Bearer wrong-key" },
    });
    assert.equal(response.status, 401);
    const body = (await response.json()) as { code: string };
    assert.equal(body.code, "unauthorized");
  });
});

test("request with correct Bearer token succeeds", async () => {
  await withAuthServer(TEST_API_KEY, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/cases`, {
      headers: { authorization: `Bearer ${TEST_API_KEY}` },
    });
    assert.equal(response.status, 200);
  });
});

test("healthz bypasses auth", async () => {
  await withAuthServer(TEST_API_KEY, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/healthz`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { status: string };
    assert.equal(body.status, "ok");
  });
});

test("readyz bypasses auth", async () => {
  await withAuthServer(TEST_API_KEY, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/readyz`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { status: string };
    assert.equal(body.status, "ready");
  });
});

test("metrics bypasses auth", async () => {
  await withAuthServer(TEST_API_KEY, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/metrics`);
    assert.equal(response.status, 200);
  });
});

test("createApp allows requests when no auth middleware is wired", async () => {
  await withAuthServer(undefined, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/cases`);
    assert.equal(response.status, 200);
  });
});

test("bootstrap rejects missing API_KEY unless insecure dev auth is explicitly enabled", () => {
  assert.throws(
    () => bootstrap(),
    /ALLOW_INSECURE_DEV_AUTH/i,
  );
});

test("bootstrap allows missing API_KEY when insecure dev auth is explicitly enabled", () => {
  const result = bootstrap({
    allowInsecureDevAuth: true,
  });

  assert.ok(result.app);
  result.closeStore?.();
});

test("bootstrap rejects insecure dev auth when node environment is production", () => {
  assert.throws(
    () =>
      bootstrap({
        allowInsecureDevAuth: true,
        nodeEnv: "production",
      }),
    /production/i,
  );
});
