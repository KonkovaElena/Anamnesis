import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { type AddressInfo } from "node:net";
import test from "node:test";
import { createApp } from "../src/application/create-app";
import { InMemoryAnamnesisStore } from "../src/infrastructure/InMemoryAnamnesisStore";

async function withRateLimitedServer(
  maxRequests: number,
  run: (baseUrl: string) => Promise<void>,
) {
  const store = new InMemoryAnamnesisStore();
  const app = createApp({ store, rateLimitRpm: maxRequests });
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

test("rate limiter returns 429 after exceeding maxRequests", async () => {
  const maxRequests = 3;
  await withRateLimitedServer(maxRequests, async (baseUrl) => {
    for (let i = 0; i < maxRequests; i++) {
      const response = await fetch(`${baseUrl}/api/cases`);
      assert.equal(response.status, 200, `Request ${i + 1} should succeed`);
    }

    const blocked = await fetch(`${baseUrl}/api/cases`);
    assert.equal(blocked.status, 429);
    const body = (await blocked.json()) as { code: string };
    assert.equal(body.code, "rate_limited");
    assert.ok(blocked.headers.get("retry-after"), "429 response must include Retry-After header");
  });
});

test("healthz and readyz are exempt from rate limiting", async () => {
  await withRateLimitedServer(1, async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/cases`);
    assert.equal(first.status, 200);

    const healthz = await fetch(`${baseUrl}/healthz`);
    assert.equal(healthz.status, 200);

    const readyz = await fetch(`${baseUrl}/readyz`);
    assert.equal(readyz.status, 200);

    const blocked = await fetch(`${baseUrl}/api/cases`);
    assert.equal(blocked.status, 429);
  });
});
