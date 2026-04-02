import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { type AddressInfo } from "node:net";
import test from "node:test";
import { bootstrap } from "../src/bootstrap";

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const { app } = bootstrap();
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

async function jsonRequest<T>(
  baseUrl: string,
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options?.method ?? "GET",
    headers: { "content-type": "application/json" },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  return {
    status: response.status,
    body: (await response.json()) as T,
  };
}

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
        reviewerName: "Dr. Ada",
        action: "approved",
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