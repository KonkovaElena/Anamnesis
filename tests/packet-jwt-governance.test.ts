import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { jsonRequest, withServer } from "./helpers";

const JWT_SECRET = "test-packet-jwt-governance-secret";

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

async function createCaseWithArtifact(baseUrl: string, headers: Record<string, string>) {
  const caseRes = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
    method: "POST",
    body: {
      intake: {
        chiefConcern: "Test",
        symptomSummary: "Summary",
        historySummary: "History",
      },
    },
    headers,
  });
  assert.equal(caseRes.status, 201);
  const caseId = caseRes.body.case.caseId;

  const artifactRes = await jsonRequest(baseUrl, `/api/cases/${caseId}/artifacts`, {
    method: "POST",
    body: { artifactType: "note", title: "Note", summary: "Content" },
    headers,
  });
  assert.equal(artifactRes.status, 201);

  return { caseId };
}

test("JWT packet draft binds requestedBy to subject when omitted", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = createTestJwt({ sub: "operator-1", roles: ["operator"], iat: now, exp: now + 3600 });
  const headers = { authorization: `Bearer ${token}` };

  await withServer(async (baseUrl) => {
    const { caseId } = await createCaseWithArtifact(baseUrl, headers);

    const packetRes = await jsonRequest<{ packet: { requestedBy?: string } }>(
      baseUrl,
      `/api/cases/${caseId}/physician-packets`,
      {
        method: "POST",
        body: {},
        headers,
      },
    );

    assert.equal(packetRes.status, 201);
    assert.equal(packetRes.body.packet.requestedBy, "operator-1");
  }, { jwtSecret: JWT_SECRET });
});

test("JWT packet draft rejects requestedBy mismatch", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = createTestJwt({ sub: "operator-1", roles: ["operator"], iat: now, exp: now + 3600 });
  const headers = { authorization: `Bearer ${token}` };

  await withServer(async (baseUrl) => {
    const { caseId } = await createCaseWithArtifact(baseUrl, headers);

    const packetRes = await jsonRequest<{ code: string }>(
      baseUrl,
      `/api/cases/${caseId}/physician-packets`,
      {
        method: "POST",
        body: { requestedBy: "spoofed-user" },
        headers,
      },
    );

    assert.equal(packetRes.status, 400);
    assert.equal(packetRes.body.code, "invalid_input");
  }, { jwtSecret: JWT_SECRET });
});

test("JWT review binds reviewerName to subject when omitted", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = createTestJwt({ sub: "reviewer-1", roles: ["reviewer"], iat: now, exp: now + 3600 });
  const headers = { authorization: `Bearer ${token}` };

  await withServer(async (baseUrl) => {
    const { caseId } = await createCaseWithArtifact(baseUrl, headers);

    const packetRes = await jsonRequest<{ packet: { packetId: string } }>(
      baseUrl,
      `/api/cases/${caseId}/physician-packets`,
      {
        method: "POST",
        body: {},
        headers,
      },
    );
    const packetId = packetRes.body.packet.packetId;

    const reviewRes = await jsonRequest<{ review: { reviewerName: string } }>(
      baseUrl,
      `/api/cases/${caseId}/physician-packets/${packetId}/reviews`,
      {
        method: "POST",
        body: { action: "approved" },
        headers,
      },
    );

    assert.equal(reviewRes.status, 201);
    assert.equal(reviewRes.body.review.reviewerName, "reviewer-1");
  }, { jwtSecret: JWT_SECRET });
});

test("JWT review rejects reviewerName mismatch", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = createTestJwt({ sub: "reviewer-1", roles: ["reviewer"], iat: now, exp: now + 3600 });
  const headers = { authorization: `Bearer ${token}` };

  await withServer(async (baseUrl) => {
    const { caseId } = await createCaseWithArtifact(baseUrl, headers);

    const packetRes = await jsonRequest<{ packet: { packetId: string } }>(
      baseUrl,
      `/api/cases/${caseId}/physician-packets`,
      {
        method: "POST",
        body: {},
        headers,
      },
    );
    const packetId = packetRes.body.packet.packetId;

    const reviewRes = await jsonRequest<{ code: string }>(
      baseUrl,
      `/api/cases/${caseId}/physician-packets/${packetId}/reviews`,
      {
        method: "POST",
        body: { action: "approved", reviewerName: "spoofed-reviewer" },
        headers,
      },
    );

    assert.equal(reviewRes.status, 400);
    assert.equal(reviewRes.body.code, "invalid_input");
  }, { jwtSecret: JWT_SECRET });
});

test("JWT review rejects missing reviewer role", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = createTestJwt({ sub: "operator-1", roles: ["operator"], iat: now, exp: now + 3600 });
  const headers = { authorization: `Bearer ${token}` };

  await withServer(async (baseUrl) => {
    const { caseId } = await createCaseWithArtifact(baseUrl, headers);

    const packetRes = await jsonRequest<{ packet: { packetId: string } }>(
      baseUrl,
      `/api/cases/${caseId}/physician-packets`,
      {
        method: "POST",
        body: {},
        headers,
      },
    );
    const packetId = packetRes.body.packet.packetId;

    const reviewRes = await jsonRequest<{ code: string }>(
      baseUrl,
      `/api/cases/${caseId}/physician-packets/${packetId}/reviews`,
      {
        method: "POST",
        body: { action: "approved" },
        headers,
      },
    );

    assert.equal(reviewRes.status, 403);
    assert.equal(reviewRes.body.code, "forbidden");
  }, { jwtSecret: JWT_SECRET });
});

test("JWT finalize binds finalizedBy to clinician subject when omitted", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = createTestJwt({ sub: "clinician-1", roles: ["clinician"], iat: now, exp: now + 3600 });
  const headers = { authorization: `Bearer ${token}` };

  await withServer(async (baseUrl) => {
    const { caseId } = await createCaseWithArtifact(baseUrl, headers);

    const packetRes = await jsonRequest<{ packet: { packetId: string } }>(
      baseUrl,
      `/api/cases/${caseId}/physician-packets`,
      {
        method: "POST",
        body: {},
        headers,
      },
    );
    const packetId = packetRes.body.packet.packetId;

    const reviewRes = await jsonRequest(baseUrl, `/api/cases/${caseId}/physician-packets/${packetId}/reviews`, {
      method: "POST",
      body: { action: "approved" },
      headers,
    });
    assert.equal(reviewRes.status, 201);

    const finalizeRes = await jsonRequest<{ packet: { finalizedBy?: string; status: string } }>(
      baseUrl,
      `/api/cases/${caseId}/physician-packets/${packetId}/finalize`,
      {
        method: "POST",
        body: { reason: "Clinician sign-off." },
        headers,
      },
    );

    assert.equal(finalizeRes.status, 200);
    assert.equal(finalizeRes.body.packet.status, "FINALIZED");
    assert.equal(finalizeRes.body.packet.finalizedBy, "clinician-1");
  }, { jwtSecret: JWT_SECRET });
});

test("JWT finalize rejects finalizedBy mismatch", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = createTestJwt({ sub: "clinician-1", roles: ["clinician"], iat: now, exp: now + 3600 });
  const headers = { authorization: `Bearer ${token}` };

  await withServer(async (baseUrl) => {
    const { caseId } = await createCaseWithArtifact(baseUrl, headers);

    const packetRes = await jsonRequest<{ packet: { packetId: string } }>(
      baseUrl,
      `/api/cases/${caseId}/physician-packets`,
      {
        method: "POST",
        body: {},
        headers,
      },
    );
    const packetId = packetRes.body.packet.packetId;

    const reviewRes = await jsonRequest(baseUrl, `/api/cases/${caseId}/physician-packets/${packetId}/reviews`, {
      method: "POST",
      body: { action: "approved" },
      headers,
    });
    assert.equal(reviewRes.status, 201);

    const finalizeRes = await jsonRequest<{ code: string }>(
      baseUrl,
      `/api/cases/${caseId}/physician-packets/${packetId}/finalize`,
      {
        method: "POST",
        body: { finalizedBy: "spoofed-finalizer", reason: "Attempted spoof." },
        headers,
      },
    );

    assert.equal(finalizeRes.status, 400);
    assert.equal(finalizeRes.body.code, "invalid_input");
  }, { jwtSecret: JWT_SECRET });
});

test("JWT finalize rejects missing clinician role", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = createTestJwt({ sub: "reviewer-1", roles: ["reviewer"], iat: now, exp: now + 3600 });
  const headers = { authorization: `Bearer ${token}` };

  await withServer(async (baseUrl) => {
    const { caseId } = await createCaseWithArtifact(baseUrl, headers);

    const packetRes = await jsonRequest<{ packet: { packetId: string } }>(
      baseUrl,
      `/api/cases/${caseId}/physician-packets`,
      {
        method: "POST",
        body: {},
        headers,
      },
    );
    const packetId = packetRes.body.packet.packetId;

    const reviewRes = await jsonRequest(baseUrl, `/api/cases/${caseId}/physician-packets/${packetId}/reviews`, {
      method: "POST",
      body: { action: "approved" },
      headers,
    });
    assert.equal(reviewRes.status, 201);

    const finalizeRes = await jsonRequest<{ code: string }>(
      baseUrl,
      `/api/cases/${caseId}/physician-packets/${packetId}/finalize`,
      {
        method: "POST",
        body: { reason: "Attempted finalization." },
        headers,
      },
    );

    assert.equal(finalizeRes.status, 403);
    assert.equal(finalizeRes.body.code, "forbidden");
  }, { jwtSecret: JWT_SECRET });
});

test("non-JWT finalize rejects missing finalizedBy", async () => {
  await withServer(async (baseUrl) => {
    const caseRes = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        intake: {
          chiefConcern: "Test",
          symptomSummary: "Summary",
          historySummary: "History",
        },
      },
    });
    const caseId = caseRes.body.case.caseId;

    await jsonRequest(baseUrl, `/api/cases/${caseId}/artifacts`, {
      method: "POST",
      body: { artifactType: "note", title: "Note", summary: "Content" },
    });

    const packetRes = await jsonRequest<{ packet: { packetId: string } }>(baseUrl, `/api/cases/${caseId}/physician-packets`, {
      method: "POST",
      body: { requestedBy: "triage@example.test" },
    });
    const packetId = packetRes.body.packet.packetId;

    const reviewRes = await jsonRequest(baseUrl, `/api/cases/${caseId}/physician-packets/${packetId}/reviews`, {
      method: "POST",
      body: { reviewerName: "Dr. Ada", action: "approved" },
    });
    assert.equal(reviewRes.status, 201);

    const finalizeRes = await jsonRequest<{ code: string }>(baseUrl, `/api/cases/${caseId}/physician-packets/${packetId}/finalize`, {
      method: "POST",
      body: { reason: "Missing finalizer." },
    });

    assert.equal(finalizeRes.status, 400);
    assert.equal(finalizeRes.body.code, "invalid_input");
  });
});
