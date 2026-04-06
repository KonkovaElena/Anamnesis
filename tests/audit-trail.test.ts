import assert from "node:assert/strict";
import test from "node:test";
import { API_ADD_ARTIFACT_BODY, API_SUBMIT_REVIEW_BODY } from "./fixtures";
import { jsonRequest, withServer } from "./helpers";

async function createApprovedPacket(baseUrl: string): Promise<{ caseId: string; packetId: string }> {
  const caseResponse = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
    method: "POST",
    body: {
      patientLabel: "audit-flow",
      intake: {
        chiefConcern: "Shortness of breath",
        symptomSummary: "Symptoms persist after exertion.",
        historySummary: "No recent imaging recorded.",
        questionsForClinician: ["Should chest imaging be prioritized?"],
      },
    },
  });
  const caseId = caseResponse.body.case.caseId;

  await jsonRequest(baseUrl, `/api/cases/${caseId}/artifacts`, {
    method: "POST",
    body: {
      ...API_ADD_ARTIFACT_BODY,
      artifactType: "report",
      title: "Initial intake report",
      summary: "Reported dyspnea after mild exertion.",
      sourceDate: "2026-03-30",
    },
  });

  const packetResponse = await jsonRequest<{ packet: { packetId: string } }>(
    baseUrl,
    `/api/cases/${caseId}/physician-packets`,
    {
      method: "POST",
      body: { requestedBy: "nurse@example.test" },
    },
  );
  const packetId = packetResponse.body.packet.packetId;

  const reviewResponse = await jsonRequest<{ review: { action: string } }>(
    baseUrl,
    `/api/cases/${caseId}/physician-packets/${packetId}/reviews`,
    {
      method: "POST",
      body: {
        ...API_SUBMIT_REVIEW_BODY,
        reviewerName: "Dr. Ada",
        comments: "Ready for explicit sign-off.",
      },
    },
  );
  assert.equal(reviewResponse.status, 201);

  return { caseId, packetId };
}

test("POST finalize transitions an approved packet and GET audit-events returns append-only flow", async () => {
  await withServer(async (baseUrl) => {
    const { caseId, packetId } = await createApprovedPacket(baseUrl);

    const finalizeResponse = await jsonRequest<{
      packet: { status: string; finalizedBy?: string; finalizedFingerprint?: string };
    }>(baseUrl, `/api/cases/${caseId}/physician-packets/${packetId}/finalize`, {
      method: "POST",
      body: {
        finalizedBy: "Dr. Ada",
        reason: "Completed clinician review cycle.",
      },
    });

    assert.equal(finalizeResponse.status, 200);
    assert.equal(finalizeResponse.body.packet.status, "FINALIZED");
    assert.equal(finalizeResponse.body.packet.finalizedBy, "Dr. Ada");
    assert.ok(finalizeResponse.body.packet.finalizedFingerprint);

    const auditResponse = await jsonRequest<{
      events: Array<{ eventType: string }>;
      meta: { totalEvents: number };
    }>(baseUrl, `/api/cases/${caseId}/audit-events`);

    assert.equal(auditResponse.status, 200);
    assert.deepStrictEqual(auditResponse.body.events.map((event) => event.eventType), [
      "case.created",
      "artifact.added",
      "packet.drafted",
      "review.submitted",
      "packet.finalized",
    ]);
    assert.equal(auditResponse.body.meta.totalEvents, 5);
  });
});

test("audit events keep the originating request correlation id", async () => {
  await withServer(async (baseUrl) => {
    const caseResponse = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        patientLabel: "correlation-check",
        intake: {
          chiefConcern: "Fatigue",
          symptomSummary: "Persistent fatigue after ordinary activity.",
          historySummary: "No prior cardiology workup in the record.",
          questionsForClinician: ["What follow-up tests are appropriate?"],
        },
      },
    });

    const caseId = caseResponse.body.case.caseId;
    const requestCorrelationId = caseResponse.headers.get("x-request-id");
    assert.ok(requestCorrelationId);

    const auditResponse = await jsonRequest<{
      events: Array<{ auditId: string; eventId: string; correlationId: string; schemaVersion: number }>;
    }>(baseUrl, `/api/cases/${caseId}/audit-events`);

    assert.equal(auditResponse.body.events[0]?.correlationId, requestCorrelationId);
    assert.equal(auditResponse.body.events[0]?.schemaVersion, 1);
    assert.equal(auditResponse.body.events[0]?.auditId, auditResponse.body.events[0]?.eventId);
  });
});

test("audit trail survives case deletion and metrics expose finalized packet and audit totals", async () => {
  await withServer(async (baseUrl) => {
    const { caseId, packetId } = await createApprovedPacket(baseUrl);

    await jsonRequest(baseUrl, `/api/cases/${caseId}/physician-packets/${packetId}/finalize`, {
      method: "POST",
      body: {
        finalizedBy: "Dr. Ada",
      },
    });

    const metricsBeforeDelete = await fetch(`${baseUrl}/metrics`);
    const metricsBeforeDeleteText = await metricsBeforeDelete.text();
    assert.match(metricsBeforeDeleteText, /anamnesis_audit_events_total 5/);
    assert.match(metricsBeforeDeleteText, /anamnesis_finalized_packets_total 1/);

    const deleteResponse = await fetch(`${baseUrl}/api/cases/${caseId}`, { method: "DELETE" });
    assert.equal(deleteResponse.status, 204);

    const auditResponse = await jsonRequest<{
      events: Array<{ eventType: string }>;
      meta: { totalEvents: number };
    }>(baseUrl, `/api/cases/${caseId}/audit-events`);

    assert.equal(auditResponse.status, 200);
    assert.equal(auditResponse.body.events.at(-1)?.eventType, "case.deleted");
    assert.equal(auditResponse.body.meta.totalEvents, 6);

    const metricsResponse = await fetch(`${baseUrl}/metrics`);
    const metricsText = await metricsResponse.text();
    assert.match(metricsText, /anamnesis_audit_events_total 6/);
    assert.match(metricsText, /anamnesis_finalized_packets_total 0/);
  });
});