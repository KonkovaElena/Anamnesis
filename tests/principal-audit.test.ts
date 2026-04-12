import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { withServer, jsonRequest } from "./helpers";

const JWT_SECRET = "test-principal-audit-secret";

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

// ---------------------------------------------------------------------------
// Principal → audit trail propagation
// ---------------------------------------------------------------------------

test("JWT principal actorId propagates to audit event on case creation", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = createTestJwt({ sub: "clinician-1", iat: now, exp: now + 3600 });

  await withServer(async (baseUrl) => {
    const { status, body } = await jsonRequest<{ case: { caseId: string } }>(
      baseUrl,
      "/api/cases",
      {
        method: "POST",
        body: {
          intake: {
            chiefConcern: "Test",
            symptomSummary: "Summary",
            historySummary: "History",
          },
        },
        headers: { authorization: `Bearer ${token}` },
      },
    );
    assert.equal(status, 201);

    const auditResponse = await jsonRequest<{
      events: Array<{ actorId?: string; eventType: string }>;
    }>(baseUrl, `/api/cases/${body.case.caseId}/audit-events`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(auditResponse.status, 200);

    const createEvent = auditResponse.body.events.find((e) => e.eventType === "case.created");
    assert.ok(createEvent, "case.created audit event should exist");
    assert.equal(createEvent.actorId, "clinician-1");
  }, { jwtSecret: JWT_SECRET });
});

test("API key auth sets actorId to api-key-holder in audit event", async () => {
  const apiKey = "test-api-key-principal";

  await withServer(async (baseUrl) => {
    const { status, body } = await jsonRequest<{ case: { caseId: string } }>(
      baseUrl,
      "/api/cases",
      {
        method: "POST",
        body: {
          intake: {
            chiefConcern: "Test",
            symptomSummary: "Summary",
            historySummary: "History",
          },
        },
        headers: { authorization: `Bearer ${apiKey}` },
      },
    );
    assert.equal(status, 201);

    const auditResponse = await jsonRequest<{
      events: Array<{ actorId?: string; eventType: string }>;
    }>(baseUrl, `/api/cases/${body.case.caseId}/audit-events`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    assert.equal(auditResponse.status, 200);

    const createEvent = auditResponse.body.events.find((e) => e.eventType === "case.created");
    assert.ok(createEvent, "case.created audit event should exist");
    assert.equal(createEvent.actorId, "api-key-holder");
  }, { apiKey });
});

test("insecure dev mode audit event has no actorId", async () => {
  await withServer(async (baseUrl) => {
    const { status, body } = await jsonRequest<{ case: { caseId: string } }>(
      baseUrl,
      "/api/cases",
      {
        method: "POST",
        body: {
          intake: {
            chiefConcern: "Test",
            symptomSummary: "Summary",
            historySummary: "History",
          },
        },
      },
    );
    assert.equal(status, 201);

    const auditResponse = await jsonRequest<{
      events: Array<{ actorId?: string; eventType: string }>;
    }>(baseUrl, `/api/cases/${body.case.caseId}/audit-events`);
    assert.equal(auditResponse.status, 200);

    const createEvent = auditResponse.body.events.find((e) => e.eventType === "case.created");
    assert.ok(createEvent, "case.created audit event should exist");
    assert.equal(createEvent.actorId, undefined);
  }, { allowInsecureDevAuth: true });
});

test("JWT principal governs review submission actor identity", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = createTestJwt({ sub: "reviewer-42", roles: ["reviewer"], iat: now, exp: now + 3600 });

  await withServer(async (baseUrl) => {
    const headers = { authorization: `Bearer ${token}` };

    const caseRes = await jsonRequest<{ case: { caseId: string } }>(
      baseUrl, "/api/cases",
      {
        method: "POST",
        body: {
          intake: {
            chiefConcern: "Test",
            symptomSummary: "Summary",
            historySummary: "History",
          },
        },
        headers,
      },
    );
    const caseId = caseRes.body.case.caseId;

    await jsonRequest(baseUrl, `/api/cases/${caseId}/artifacts`, {
      method: "POST",
      body: { artifactType: "note", title: "Note", summary: "Content" },
      headers,
    });

    const packetRes = await jsonRequest<{
      packet: { packetId: string };
    }>(baseUrl, `/api/cases/${caseId}/physician-packets`, {
      method: "POST",
      body: {},
      headers,
    });
    const packetId = packetRes.body.packet.packetId;

    await jsonRequest(baseUrl, `/api/cases/${caseId}/physician-packets/${packetId}/reviews`, {
      method: "POST",
      body: { action: "approved" },
      headers,
    });

    const auditRes = await jsonRequest<{
      events: Array<{ actorId?: string; eventType: string }>;
    }>(baseUrl, `/api/cases/${caseId}/audit-events`, { headers });

    const reviewEvent = auditRes.body.events.find((e) => e.eventType === "review.submitted");
    assert.ok(reviewEvent, "review.submitted audit event should exist");
    assert.equal(reviewEvent.actorId, "reviewer-42");
  }, { jwtSecret: JWT_SECRET });
});
