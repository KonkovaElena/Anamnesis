import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { jsonRequest, withServer } from "./helpers";

const JWT_SECRET = "test-case-acl-secret";
const API_KEY = "test-case-acl-api-key";

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function createTestJwt(payload: Record<string, unknown>): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode(
    createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest(),
  );
  return `${header}.${body}.${signature}`;
}

async function createJwtOwnedCase(baseUrl: string, headers: Record<string, string>): Promise<string> {
  const caseRes = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
    method: "POST",
    body: {
      intake: {
        chiefConcern: "Case ACL test",
        symptomSummary: "Summary",
        historySummary: "History",
      },
    },
    headers,
  });

  assert.equal(caseRes.status, 201);
  return caseRes.body.case.caseId;
}

test("JWT-created cases are visible in list only to their owner principal", async () => {
  const now = Math.floor(Date.now() / 1000);
  const ownerToken = createTestJwt({ sub: "owner-1", roles: ["clinician"], iat: now, exp: now + 3600 });
  const outsiderToken = createTestJwt({ sub: "outsider-1", roles: ["clinician"], iat: now, exp: now + 3600 });

  await withServer(async (baseUrl) => {
    const ownerHeaders = { authorization: `Bearer ${ownerToken}` };
    const outsiderHeaders = { authorization: `Bearer ${outsiderToken}` };

    const caseId = await createJwtOwnedCase(baseUrl, ownerHeaders);

    const ownerList = await jsonRequest<{ cases: Array<{ caseId: string }> }>(baseUrl, "/api/cases", {
      headers: ownerHeaders,
    });
    assert.equal(ownerList.status, 200);
    assert.equal(ownerList.body.cases.some((entry) => entry.caseId === caseId), true);

    const outsiderList = await jsonRequest<{ cases: Array<{ caseId: string }> }>(baseUrl, "/api/cases", {
      headers: outsiderHeaders,
    });
    assert.equal(outsiderList.status, 200);
    assert.equal(outsiderList.body.cases.some((entry) => entry.caseId === caseId), false);
  }, { jwtSecret: JWT_SECRET });
});

test("JWT non-owner cannot read or mutate a JWT-owned case", async () => {
  const now = Math.floor(Date.now() / 1000);
  const ownerToken = createTestJwt({ sub: "owner-1", roles: ["clinician"], iat: now, exp: now + 3600 });
  const outsiderToken = createTestJwt({ sub: "outsider-1", roles: ["clinician"], iat: now, exp: now + 3600 });

  await withServer(async (baseUrl) => {
    const ownerHeaders = { authorization: `Bearer ${ownerToken}` };
    const outsiderHeaders = { authorization: `Bearer ${outsiderToken}` };

    const caseId = await createJwtOwnedCase(baseUrl, ownerHeaders);

    const detailRes = await jsonRequest<{ code: string }>(baseUrl, `/api/cases/${caseId}`, {
      headers: outsiderHeaders,
    });
    assert.equal(detailRes.status, 404);
    assert.equal(detailRes.body.code, "case_not_found");

    const artifactRes = await jsonRequest<{ code: string }>(baseUrl, `/api/cases/${caseId}/artifacts`, {
      method: "POST",
      body: { artifactType: "note", title: "Denied", summary: "Denied" },
      headers: outsiderHeaders,
    });
    assert.equal(artifactRes.status, 404);
    assert.equal(artifactRes.body.code, "case_not_found");

    const auditRes = await jsonRequest<{ code: string }>(baseUrl, `/api/cases/${caseId}/audit-events`, {
      headers: outsiderHeaders,
    });
    assert.equal(auditRes.status, 404);
    assert.equal(auditRes.body.code, "case_not_found");
  }, { jwtSecret: JWT_SECRET });
});

test("API key auth retains admin access to JWT-owned cases", async () => {
  const now = Math.floor(Date.now() / 1000);
  const ownerToken = createTestJwt({ sub: "owner-1", roles: ["clinician"], iat: now, exp: now + 3600 });

  await withServer(async (baseUrl) => {
    const ownerHeaders = { authorization: `Bearer ${ownerToken}` };
    const apiKeyHeaders = { authorization: `Bearer ${API_KEY}` };

    const caseId = await createJwtOwnedCase(baseUrl, ownerHeaders);

    const detailRes = await jsonRequest<{ case: { caseId: string } }>(baseUrl, `/api/cases/${caseId}`, {
      headers: apiKeyHeaders,
    });
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.body.case.caseId, caseId);
  }, { jwtSecret: JWT_SECRET, apiKey: API_KEY });
});

test("operations summary is scoped to JWT-accessible cases", async () => {
  const now = Math.floor(Date.now() / 1000);
  const ownerOneToken = createTestJwt({ sub: "owner-1", roles: ["clinician"], iat: now, exp: now + 3600 });
  const ownerTwoToken = createTestJwt({ sub: "owner-2", roles: ["clinician"], iat: now, exp: now + 3600 });

  await withServer(async (baseUrl) => {
    const ownerOneHeaders = { authorization: `Bearer ${ownerOneToken}` };
    const ownerTwoHeaders = { authorization: `Bearer ${ownerTwoToken}` };

    await createJwtOwnedCase(baseUrl, ownerOneHeaders);
    await createJwtOwnedCase(baseUrl, ownerTwoHeaders);

    const ownerOneSummary = await jsonRequest<{ summary: { totalCases: number; totalAuditEvents: number } }>(
      baseUrl,
      "/api/operations/summary",
      { headers: ownerOneHeaders },
    );

    assert.equal(ownerOneSummary.status, 200);
    assert.equal(ownerOneSummary.body.summary.totalCases, 1);
    assert.equal(ownerOneSummary.body.summary.totalAuditEvents, 1);
  }, { jwtSecret: JWT_SECRET });
});