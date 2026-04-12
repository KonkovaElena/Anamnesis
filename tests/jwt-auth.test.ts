import assert from "node:assert/strict";
import { createHmac, createSign, generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { verifyJwt, JwtVerificationError } from "../src/core/jwt-verification";
import { withServer, jsonRequest } from "./helpers";

const TEST_JWT_SECRET = "test-jwt-secret-for-unit-tests-only";
const {
  publicKey: RS256_PUBLIC_KEY_PEM,
  privateKey: RS256_PRIVATE_KEY_PEM,
} = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const {
  publicKey: RS256_OTHER_PUBLIC_KEY_PEM,
} = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const {
  publicKey: RS256_WEAK_PUBLIC_KEY_PEM,
  privateKey: RS256_WEAK_PRIVATE_KEY_PEM,
} = generateKeyPairSync("rsa", {
  modulusLength: 1024,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function createTestJwt(
  payload: Record<string, unknown>,
  secret: string = TEST_JWT_SECRET,
  alg: string = "HS256",
  typ: string = "JWT",
): string {
  const header = base64UrlEncode(JSON.stringify({ alg, typ }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode(
    createHmac("sha256", secret).update(`${header}.${body}`).digest(),
  );
  return `${header}.${body}.${signature}`;
}

function createRs256Jwt(
  payload: Record<string, unknown>,
  privateKeyPem: string = RS256_PRIVATE_KEY_PEM,
  typ: string = "JWT",
): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = createSign("RSA-SHA256").update(`${header}.${body}`).end().sign(privateKeyPem);
  return `${header}.${body}.${base64UrlEncode(signature)}`;
}

// ---------------------------------------------------------------------------
// Unit tests for verifyJwt
// ---------------------------------------------------------------------------

test("verifyJwt succeeds with valid HS256 token", () => {
  const now = Math.floor(Date.now() / 1000);
  const token = createTestJwt({ sub: "user-1", iat: now, exp: now + 3600 });
  const payload = verifyJwt(token, { secret: TEST_JWT_SECRET });
  assert.equal(payload.sub, "user-1");
});

test("verifyJwt succeeds with valid RS256 token", () => {
  const now = Math.floor(Date.now() / 1000);
  const token = createRs256Jwt({ sub: "user-1", iat: now, exp: now + 3600 });
  const payload = verifyJwt(token, { publicKeyPem: RS256_PUBLIC_KEY_PEM });
  assert.equal(payload.sub, "user-1");
});

test("verifyJwt rejects token with wrong secret", () => {
  const token = createTestJwt({ sub: "user-1" });
  assert.throws(
    () => verifyJwt(token, { secret: "wrong-secret" }),
    (error: unknown) => error instanceof JwtVerificationError && error.code === "invalid_signature",
  );
});

test("verifyJwt rejects RS256 token with wrong public key", () => {
  const token = createRs256Jwt({ sub: "user-1" });
  assert.throws(
    () => verifyJwt(token, { publicKeyPem: RS256_OTHER_PUBLIC_KEY_PEM }),
    (error: unknown) => error instanceof JwtVerificationError && error.code === "invalid_signature",
  );
});

test("verifyJwt rejects RS256 token when configured public key is too small", () => {
  const token = createRs256Jwt({ sub: "user-1" }, RS256_WEAK_PRIVATE_KEY_PEM);
  assert.throws(
    () => verifyJwt(token, { publicKeyPem: RS256_WEAK_PUBLIC_KEY_PEM }),
    (error: unknown) => error instanceof JwtVerificationError && error.code === "weak_verification_key",
  );
});

test("verifyJwt rejects expired token", () => {
  const past = Math.floor(Date.now() / 1000) - 3600;
  const token = createTestJwt({ sub: "user-1", exp: past - 60 });
  assert.throws(
    () => verifyJwt(token, { secret: TEST_JWT_SECRET }),
    (error: unknown) => error instanceof JwtVerificationError && error.code === "token_expired",
  );
});

test("verifyJwt rejects future iat beyond tolerance", () => {
  const future = Math.floor(Date.now() / 1000) + 3600;
  const token = createTestJwt({ sub: "user-1", iat: future });
  assert.throws(
    () => verifyJwt(token, { secret: TEST_JWT_SECRET }),
    (error: unknown) => error instanceof JwtVerificationError && error.code === "token_not_yet_valid",
  );
});

test("verifyJwt rejects future nbf beyond tolerance", () => {
  const future = Math.floor(Date.now() / 1000) + 3600;
  const token = createTestJwt({ sub: "user-1", nbf: future });
  assert.throws(
    () => verifyJwt(token, { secret: TEST_JWT_SECRET }),
    (error: unknown) => error instanceof JwtVerificationError && error.code === "token_not_yet_valid",
  );
});

test("verifyJwt rejects missing subject", () => {
  const token = createTestJwt({ iss: "anamnesis", aud: "anamnesis-api" });
  assert.throws(
    () => verifyJwt(token, { secret: TEST_JWT_SECRET }),
    (error: unknown) => error instanceof JwtVerificationError && error.code === "invalid_subject",
  );
});

test("verifyJwt rejects wrong issuer", () => {
  const token = createTestJwt({ sub: "user-1", iss: "bad-issuer" });
  assert.throws(
    () => verifyJwt(token, { secret: TEST_JWT_SECRET, issuer: "expected-issuer" }),
    (error: unknown) => error instanceof JwtVerificationError && error.code === "invalid_issuer",
  );
});

test("verifyJwt accepts matching issuer", () => {
  const token = createTestJwt({ sub: "user-1", iss: "anamnesis" });
  const payload = verifyJwt(token, { secret: TEST_JWT_SECRET, issuer: "anamnesis" });
  assert.equal(payload.iss, "anamnesis");
});

test("verifyJwt rejects wrong audience", () => {
  const token = createTestJwt({ sub: "user-1", aud: "other-service" });
  assert.throws(
    () => verifyJwt(token, { secret: TEST_JWT_SECRET, audience: "anamnesis-api" }),
    (error: unknown) => error instanceof JwtVerificationError && error.code === "invalid_audience",
  );
});

test("verifyJwt accepts matching audience in array", () => {
  const token = createTestJwt({ sub: "user-1", aud: ["anamnesis-api", "other"] });
  const payload = verifyJwt(token, { secret: TEST_JWT_SECRET, audience: "anamnesis-api" });
  assert.deepStrictEqual(payload.aud, ["anamnesis-api", "other"]);
});

test("verifyJwt rejects malformed token (not 3 parts)", () => {
  assert.throws(
    () => verifyJwt("not.a.valid.jwt.token", { secret: TEST_JWT_SECRET }),
    (error: unknown) => error instanceof JwtVerificationError && error.code === "malformed_token",
  );
});

test("verifyJwt rejects unsupported PS256 algorithm", () => {
  const header = base64UrlEncode(JSON.stringify({ alg: "PS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify({ sub: "user-1" }));
  const signature = base64UrlEncode(
    createHmac("sha256", TEST_JWT_SECRET).update(`${header}.${body}`).digest(),
  );
  assert.throws(
    () => verifyJwt(`${header}.${body}.${signature}`, { secret: TEST_JWT_SECRET }),
    (error: unknown) => error instanceof JwtVerificationError && error.code === "unsupported_algorithm",
  );
});

test("verifyJwt extracts custom roles claim", () => {
  const token = createTestJwt({ sub: "clinician-1", roles: ["clinician", "reviewer"] });
  const payload = verifyJwt(token, { secret: TEST_JWT_SECRET });
  assert.deepStrictEqual(payload.roles, ["clinician", "reviewer"]);
});

test("verifyJwt rejects malformed roles claim", () => {
  const token = createTestJwt({ sub: "clinician-1", roles: ["clinician", 42] });
  assert.throws(
    () => verifyJwt(token, { secret: TEST_JWT_SECRET }),
    (error: unknown) => error instanceof JwtVerificationError && error.code === "invalid_roles",
  );
});

test("verifyJwt rejects unexpected typ when explicit type is configured", () => {
  const token = createTestJwt({ sub: "clinician-1" }, TEST_JWT_SECRET, "HS256", "other+jwt");
  assert.throws(
    () => verifyJwt(token, { secret: TEST_JWT_SECRET, expectedTyp: "anamnesis+jwt" }),
    (error: unknown) => error instanceof JwtVerificationError && error.code === "invalid_type",
  );
});

test("verifyJwt accepts matching typ when explicit type is configured", () => {
  const token = createTestJwt({ sub: "clinician-1" }, TEST_JWT_SECRET, "HS256", "anamnesis+jwt");
  const payload = verifyJwt(token, { secret: TEST_JWT_SECRET, expectedTyp: "anamnesis+jwt" });
  assert.equal(payload.sub, "clinician-1");
});

// ---------------------------------------------------------------------------
// Integration tests: JWT auth through the HTTP stack
// ---------------------------------------------------------------------------

test("JWT Bearer token authenticates against the API", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = createTestJwt({ sub: "clinician-1", iat: now, exp: now + 3600 });

  await withServer(async (baseUrl) => {
    const response = await jsonRequest<{ cases: unknown[] }>(baseUrl, "/api/cases", {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
  }, { jwtSecret: TEST_JWT_SECRET });
});

test("RS256 JWT Bearer token authenticates against the API", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = createRs256Jwt({ sub: "clinician-1", iat: now, exp: now + 3600 });

  await withServer(async (baseUrl) => {
    const unauthorized = await jsonRequest<{ code: string }>(baseUrl, "/api/cases");
    assert.equal(unauthorized.status, 401);

    const response = await jsonRequest<{ cases: unknown[] }>(baseUrl, "/api/cases", {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
  }, { jwtPublicKey: RS256_PUBLIC_KEY_PEM });
});

test("expired JWT returns 401", async () => {
  const past = Math.floor(Date.now() / 1000) - 7200;
  const token = createTestJwt({ sub: "clinician-1", exp: past - 60 });

  await withServer(async (baseUrl) => {
    const response = await jsonRequest<{ code: string }>(baseUrl, "/api/cases", {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 401);
    assert.equal(response.body.code, "unauthorized");
  }, { jwtSecret: TEST_JWT_SECRET });
});

test("JWT with wrong secret returns 401", async () => {
  const token = createTestJwt({ sub: "clinician-1" }, "wrong-secret");

  await withServer(async (baseUrl) => {
    const response = await jsonRequest<{ code: string }>(baseUrl, "/api/cases", {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 401);
    assert.equal(response.body.code, "unauthorized");
  }, { jwtSecret: TEST_JWT_SECRET });
});

test("JWT without subject returns 401 through auth middleware", async () => {
  const token = createTestJwt({ iss: "anamnesis" });

  await withServer(async (baseUrl) => {
    const response = await jsonRequest<{ code: string }>(baseUrl, "/api/cases", {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 401);
    assert.equal(response.body.code, "unauthorized");
  }, { jwtSecret: TEST_JWT_SECRET });
});

test("JWT typ mismatch returns 401 when explicit type is configured", async () => {
  const token = createTestJwt({ sub: "clinician-1" }, TEST_JWT_SECRET, "HS256", "JWT");

  await withServer(async (baseUrl) => {
    const response = await jsonRequest<{ code: string }>(baseUrl, "/api/cases", {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 401);
    assert.equal(response.body.code, "unauthorized");
  }, { jwtSecret: TEST_JWT_SECRET, jwtTyp: "anamnesis+jwt" });
});

test("API key still works when both JWT and API key are configured", async () => {
  const apiKey = "dual-auth-api-key";

  await withServer(async (baseUrl) => {
    const response = await jsonRequest<{ cases: unknown[] }>(baseUrl, "/api/cases", {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    assert.equal(response.status, 200);
  }, { apiKey, jwtSecret: TEST_JWT_SECRET });
});

test("healthz bypasses JWT auth", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/healthz`);
    assert.equal(response.status, 200);
  }, { jwtSecret: TEST_JWT_SECRET });
});
