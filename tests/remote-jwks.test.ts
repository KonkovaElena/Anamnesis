import assert from "node:assert/strict";
import { createPublicKey, createSign, generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { RemoteJwtJwksProvider } from "../src/infrastructure/RemoteJwtJwksProvider";
import { withServer, jsonRequest } from "./helpers";

const {
  publicKey: PRIMARY_PUBLIC_KEY_PEM,
  privateKey: PRIMARY_PRIVATE_KEY_PEM,
} = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const {
  publicKey: SECONDARY_PUBLIC_KEY_PEM,
} = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const PRIMARY_PUBLIC_JWK = {
  ...(createPublicKey(PRIMARY_PUBLIC_KEY_PEM).export({ format: "jwk" }) as JsonWebKey),
  alg: "RS256",
  use: "sig",
  kid: "rotation-primary",
};

const SECONDARY_PUBLIC_JWK = {
  ...(createPublicKey(SECONDARY_PUBLIC_KEY_PEM).export({ format: "jwk" }) as JsonWebKey),
  alg: "RS256",
  use: "sig",
  kid: "rotation-secondary",
};

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function createRs256KidJwt(
  payload: Record<string, unknown>,
  options?: {
    kid?: string;
    privateKeyPem?: string;
    typ?: string;
  },
): string {
  const header = base64UrlEncode(JSON.stringify({
    alg: "RS256",
    typ: options?.typ ?? "JWT",
    ...(options?.kid ? { kid: options.kid } : {}),
  }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = createSign("RSA-SHA256")
    .update(`${header}.${body}`)
    .end()
    .sign(options?.privateKeyPem ?? PRIMARY_PRIVATE_KEY_PEM);
  return `${header}.${body}.${base64UrlEncode(signature)}`;
}

test("RemoteJwtJwksProvider caches a fresh JWKS response using Cache-Control max-age", async () => {
  let fetchCalls = 0;
  const provider = new RemoteJwtJwksProvider({
    issuer: "https://issuer.example.test",
    jwksUrl: "https://issuer.example.test/.well-known/jwks.json",
    fetchImplementation: async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ keys: [PRIMARY_PUBLIC_JWK] }), {
        status: 200,
        headers: {
          "content-type": "application/jwk-set+json",
          "cache-control": "max-age=60",
        },
      });
    },
  });

  const first = await provider.getJwks({ requiredKid: "rotation-primary" });
  const second = await provider.getJwks({ requiredKid: "rotation-primary" });

  assert.equal(fetchCalls, 1);
  assert.equal(first.keys[0]?.kid, "rotation-primary");
  assert.equal(second.keys[0]?.kid, "rotation-primary");
});

test("RemoteJwtJwksProvider refreshes immediately when the requested kid is missing from the cached JWKS", async () => {
  let fetchCalls = 0;
  const provider = new RemoteJwtJwksProvider({
    issuer: "https://issuer.example.test",
    jwksUrl: "https://issuer.example.test/.well-known/jwks.json",
    fetchImplementation: async () => {
      fetchCalls += 1;
      return new Response(
        JSON.stringify({
          keys: fetchCalls === 1 ? [PRIMARY_PUBLIC_JWK] : [PRIMARY_PUBLIC_JWK, SECONDARY_PUBLIC_JWK],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/jwk-set+json",
            "cache-control": "max-age=300",
          },
        },
      );
    },
  });

  await provider.getJwks({ requiredKid: "rotation-primary" });
  const refreshed = await provider.getJwks({ requiredKid: "rotation-secondary" });

  assert.equal(fetchCalls, 2);
  assert.equal(refreshed.keys.some((candidate) => candidate.kid === "rotation-secondary"), true);
});

test("RemoteJwtJwksProvider revalidates stale JWKS responses with ETag and honors 304 Not Modified", async () => {
  let nowMs = 0;
  let fetchCalls = 0;
  let ifNoneMatchHeader: string | null = null;
  const provider = new RemoteJwtJwksProvider({
    issuer: "https://issuer.example.test",
    jwksUrl: "https://issuer.example.test/.well-known/jwks.json",
    now: () => nowMs,
    fetchImplementation: async (_input, init) => {
      fetchCalls += 1;
      const headers = new Headers(init?.headers as HeadersInit | undefined);
      ifNoneMatchHeader = headers.get("if-none-match");
      if (fetchCalls === 1) {
        return new Response(JSON.stringify({ keys: [PRIMARY_PUBLIC_JWK] }), {
          status: 200,
          headers: {
            "content-type": "application/jwk-set+json",
            "cache-control": "max-age=5",
            etag: '"jwks-v1"',
          },
        });
      }

      return new Response(null, {
        status: 304,
        headers: {
          "cache-control": "max-age=60",
        },
      });
    },
  });

  await provider.getJwks({ requiredKid: "rotation-primary" });
  nowMs = 6_000;
  await provider.getJwks({ requiredKid: "rotation-primary" });
  await provider.getJwks({ requiredKid: "rotation-primary" });

  assert.equal(fetchCalls, 2);
  assert.equal(ifNoneMatchHeader, '"jwks-v1"');
});

test("remote JWKS mode authenticates HTTP requests and binds validation to the configured issuer", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = createRs256KidJwt(
    { sub: "clinician-remote", iss: "https://issuer.example.test", iat: now, exp: now + 3600 },
    { kid: "rotation-primary" },
  );

  let fetchCalls = 0;

  await withServer(async (baseUrl) => {
    const response = await jsonRequest<{ cases: unknown[] }>(baseUrl, "/api/cases", {
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(response.status, 200);
    assert.equal(fetchCalls, 1);
  }, {
    jwtIssuer: "https://issuer.example.test",
    jwtJwksUrl: "https://issuer.example.test/.well-known/jwks.json",
    jwtJwksFetchImplementation: async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ keys: [PRIMARY_PUBLIC_JWK] }), {
        status: 200,
        headers: {
          "content-type": "application/jwk-set+json",
          "cache-control": "max-age=60",
        },
      });
    },
  });
});