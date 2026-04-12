import assert from "node:assert/strict";
import test from "node:test";
import { withServer, jsonRequest } from "./helpers";

// ---------------------------------------------------------------------------
// GET /api/audit-chain/verify endpoint
// ---------------------------------------------------------------------------

test("audit chain verify returns valid for a normal case", async () => {
  await withServer(async (baseUrl) => {
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
      },
    );
    assert.equal(caseRes.status, 201);
    const caseId = caseRes.body.case.caseId;

    // Add an artifact to generate a second audit event
    await jsonRequest(baseUrl, `/api/cases/${caseId}/artifacts`, {
      method: "POST",
      body: { artifactType: "note", title: "Note", summary: "Content" },
    });

    const verifyRes = await jsonRequest<{
      result: { valid: boolean; verifiedCount: number };
    }>(baseUrl, `/api/audit-chain/verify?caseId=${caseId}`);

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.result.valid, true);
    assert.equal(verifyRes.body.result.verifiedCount, 2);
  });
});

test("audit chain verify returns valid with zero events for unknown case", async () => {
  await withServer(async (baseUrl) => {
    const verifyRes = await jsonRequest<{
      result: { valid: boolean; verifiedCount: number };
    }>(baseUrl, "/api/audit-chain/verify?caseId=nonexistent-case-id");

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.result.valid, true);
    assert.equal(verifyRes.body.result.verifiedCount, 0);
  });
});

test("audit chain verify returns 400 without caseId parameter", async () => {
  await withServer(async (baseUrl) => {
    const verifyRes = await jsonRequest<{ code: string }>(
      baseUrl, "/api/audit-chain/verify",
    );

    assert.equal(verifyRes.status, 400);
    assert.equal(verifyRes.body.code, "missing_case_id");
  });
});

test("audit chain verify returns 400 for empty caseId", async () => {
  await withServer(async (baseUrl) => {
    const verifyRes = await jsonRequest<{ code: string }>(
      baseUrl, "/api/audit-chain/verify?caseId=",
    );

    assert.equal(verifyRes.status, 400);
    assert.equal(verifyRes.body.code, "missing_case_id");
  });
});

test("audit chain verify counts multiple operations correctly", async () => {
  await withServer(async (baseUrl) => {
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
      },
    );
    const caseId = caseRes.body.case.caseId;

    // Add artifact
    await jsonRequest(baseUrl, `/api/cases/${caseId}/artifacts`, {
      method: "POST",
      body: { artifactType: "note", title: "Note 1", summary: "Content 1" },
    });

    // Add another artifact
    await jsonRequest(baseUrl, `/api/cases/${caseId}/artifacts`, {
      method: "POST",
      body: { artifactType: "lab", title: "Lab 1", summary: "Lab content" },
    });

    // Draft a packet
    await jsonRequest(baseUrl, `/api/cases/${caseId}/physician-packets`, {
      method: "POST",
      body: {},
    });

    const verifyRes = await jsonRequest<{
      result: { valid: boolean; verifiedCount: number };
    }>(baseUrl, `/api/audit-chain/verify?caseId=${caseId}`);

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.result.valid, true);
    assert.equal(verifyRes.body.result.verifiedCount, 4); // create + 2 artifacts + packet
  });
});
