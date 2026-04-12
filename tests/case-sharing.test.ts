import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { jsonRequest, withServer } from "./helpers";

const JWT_SECRET = "test-case-sharing-secret";
const API_KEY = "test-case-sharing-api-key";

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
        chiefConcern: "Case sharing test",
        symptomSummary: "Summary",
        historySummary: "History",
      },
    },
    headers,
  });
  assert.equal(caseRes.status, 201);
  return caseRes.body.case.caseId;
}

async function grantCaseAccess(
  baseUrl: string,
  caseId: string,
  principalId: string,
  headers: Record<string, string>,
) {
  return jsonRequest<{ case: { accessControl?: { allowedPrincipalIds: string[] } } }>(
    baseUrl,
    `/api/cases/${caseId}/access-grants`,
    {
      method: "POST",
      body: { principalId },
      headers,
    },
  );
}

test("case owner can grant access and shared principal gains workflow access", async () => {
  const now = Math.floor(Date.now() / 1000);
  const ownerToken = createTestJwt({ sub: "owner-1", roles: ["clinician"], iat: now, exp: now + 3600 });
  const sharedToken = createTestJwt({ sub: "shared-1", roles: ["clinician"], iat: now, exp: now + 3600 });

  await withServer(async (baseUrl) => {
    const ownerHeaders = { authorization: `Bearer ${ownerToken}` };
    const sharedHeaders = { authorization: `Bearer ${sharedToken}` };
    const caseId = await createJwtOwnedCase(baseUrl, ownerHeaders);

    const shareRes = await grantCaseAccess(baseUrl, caseId, "shared-1", ownerHeaders);
    assert.equal(shareRes.status, 200);
    assert.equal(shareRes.body.case.accessControl?.allowedPrincipalIds.includes("shared-1"), true);

    const listRes = await jsonRequest<{ cases: Array<{ caseId: string }> }>(baseUrl, "/api/cases", {
      headers: sharedHeaders,
    });
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.cases.some((entry) => entry.caseId === caseId), true);

    const detailRes = await jsonRequest<{ case: { caseId: string } }>(baseUrl, `/api/cases/${caseId}`, {
      headers: sharedHeaders,
    });
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.body.case.caseId, caseId);

    const artifactRes = await jsonRequest<{ case: { caseId: string } }>(baseUrl, `/api/cases/${caseId}/artifacts`, {
      method: "POST",
      body: { artifactType: "note", title: "Shared note", summary: "Shared access works" },
      headers: sharedHeaders,
    });
    assert.equal(artifactRes.status, 201);
  }, { jwtSecret: JWT_SECRET });
});

test("shared non-owner cannot grant case access to a third principal", async () => {
  const now = Math.floor(Date.now() / 1000);
  const ownerToken = createTestJwt({ sub: "owner-1", roles: ["clinician"], iat: now, exp: now + 3600 });
  const sharedToken = createTestJwt({ sub: "shared-1", roles: ["clinician"], iat: now, exp: now + 3600 });

  await withServer(async (baseUrl) => {
    const ownerHeaders = { authorization: `Bearer ${ownerToken}` };
    const sharedHeaders = { authorization: `Bearer ${sharedToken}` };
    const caseId = await createJwtOwnedCase(baseUrl, ownerHeaders);

    const firstGrant = await grantCaseAccess(baseUrl, caseId, "shared-1", ownerHeaders);
    assert.equal(firstGrant.status, 200);

    const secondGrant = await grantCaseAccess(baseUrl, caseId, "third-1", sharedHeaders);
    assert.equal(secondGrant.status, 403);
  }, { jwtSecret: JWT_SECRET });
});

test("API key operator can grant access to a JWT principal", async () => {
  const now = Math.floor(Date.now() / 1000);
  const ownerToken = createTestJwt({ sub: "owner-1", roles: ["clinician"], iat: now, exp: now + 3600 });
  const sharedToken = createTestJwt({ sub: "shared-1", roles: ["clinician"], iat: now, exp: now + 3600 });

  await withServer(async (baseUrl) => {
    const ownerHeaders = { authorization: `Bearer ${ownerToken}` };
    const apiKeyHeaders = { authorization: `Bearer ${API_KEY}` };
    const sharedHeaders = { authorization: `Bearer ${sharedToken}` };
    const caseId = await createJwtOwnedCase(baseUrl, ownerHeaders);

    const shareRes = await grantCaseAccess(baseUrl, caseId, "shared-1", apiKeyHeaders);
    assert.equal(shareRes.status, 200);

    const detailRes = await jsonRequest<{ case: { caseId: string } }>(baseUrl, `/api/cases/${caseId}`, {
      headers: sharedHeaders,
    });
    assert.equal(detailRes.status, 200);
  }, { jwtSecret: JWT_SECRET, apiKey: API_KEY });
});

test("shared principal can still read deleted-case audit history after access was granted", async () => {
  const now = Math.floor(Date.now() / 1000);
  const ownerToken = createTestJwt({ sub: "owner-1", roles: ["clinician"], iat: now, exp: now + 3600 });
  const sharedToken = createTestJwt({ sub: "shared-1", roles: ["clinician"], iat: now, exp: now + 3600 });

  await withServer(async (baseUrl) => {
    const ownerHeaders = { authorization: `Bearer ${ownerToken}` };
    const sharedHeaders = { authorization: `Bearer ${sharedToken}` };
    const caseId = await createJwtOwnedCase(baseUrl, ownerHeaders);

    const shareRes = await grantCaseAccess(baseUrl, caseId, "shared-1", ownerHeaders);
    assert.equal(shareRes.status, 200);

    const deleteRes = await fetch(`${baseUrl}/api/cases/${caseId}`, {
      method: "DELETE",
      headers: ownerHeaders,
    });
    assert.equal(deleteRes.status, 204);

    const auditRes = await jsonRequest<{
      events: Array<{ eventType: string; details?: { sharedPrincipalId?: string } }>;
    }>(baseUrl, `/api/cases/${caseId}/audit-events`, {
      headers: sharedHeaders,
    });

    assert.equal(auditRes.status, 200);
    assert.equal(auditRes.body.events.some((event) => event.eventType === "case.shared"), true);
    assert.equal(
      auditRes.body.events.some((event) => event.details?.sharedPrincipalId === "shared-1"),
      true,
    );
    assert.equal(auditRes.body.events.at(-1)?.eventType, "case.deleted");
  }, { jwtSecret: JWT_SECRET });
});