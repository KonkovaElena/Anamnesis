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

test("POST /document-ingestions creates a bounded artifact, stales packets, and records a dedicated audit event", async () => {
  await withServer(async (baseUrl) => {
    const caseResponse = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        patientLabel: "ingestion-api-case",
        intake: {
          chiefConcern: "Chest discomfort",
          symptomSummary: "Intermittent discomfort after exercise.",
          historySummary: "Urgent-care discharge paperwork exists.",
          questionsForClinician: ["Should ECG records be reviewed?"],
        },
      },
    });
    const caseId = caseResponse.body.case.caseId;

    await jsonRequest(baseUrl, `/api/cases/${caseId}/artifacts`, {
      method: "POST",
      body: {
        artifactType: "summary",
        title: "Manual intake summary",
        summary: "Initial symptoms captured during intake.",
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
    assert.ok(packetResponse.body.packet.packetId);

    const ingestionResponse = await jsonRequest<{
      case: { physicianPackets: Array<{ isStale: boolean }> };
      artifact: { summary: string };
      ingestion: { contentType: string; truncated: boolean };
    }>(baseUrl, `/api/cases/${caseId}/document-ingestions`, {
      method: "POST",
      body: {
        artifactType: "report",
        title: "Discharge note",
        contentType: "text/plain",
        filename: "discharge.txt",
        content: "Discharged home after evaluation.\n\nFollow-up with PCP recommended.",
        sourceDate: "2026-03-30",
      },
    });

    assert.equal(ingestionResponse.status, 201);
    assert.equal(ingestionResponse.body.ingestion.contentType, "text/plain");
    assert.equal(ingestionResponse.body.ingestion.truncated, false);
    assert.equal(
      ingestionResponse.body.artifact.summary,
      "Discharged home after evaluation.\n\nFollow-up with PCP recommended.",
    );
    assert.equal(ingestionResponse.body.case.physicianPackets[0]?.isStale, true);

    const auditResponse = await jsonRequest<{
      events: Array<{ eventType: string }>;
      meta: { totalEvents: number };
    }>(baseUrl, `/api/cases/${caseId}/audit-events`);

    assert.deepStrictEqual(auditResponse.body.events.map((event) => event.eventType), [
      "case.created",
      "artifact.added",
      "packet.drafted",
      "document.ingested",
    ]);
    assert.equal(auditResponse.body.meta.totalEvents, 4);

    const summaryResponse = await jsonRequest<{
      summary: { totalArtifacts: number; totalPackets: number; totalAuditEvents: number };
    }>(baseUrl, "/api/operations/summary");

    assert.equal(summaryResponse.body.summary.totalArtifacts, 2);
    assert.equal(summaryResponse.body.summary.totalPackets, 1);
    assert.equal(summaryResponse.body.summary.totalAuditEvents, 4);
  });
});

test("POST /document-ingestions rejects unsupported content types", async () => {
  await withServer(async (baseUrl) => {
    const caseResponse = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        intake: {
          chiefConcern: "Fatigue",
          symptomSummary: "Persistent fatigue for one week.",
          historySummary: "No recent illness.",
          questionsForClinician: [],
        },
      },
    });
    const caseId = caseResponse.body.case.caseId;

    const response = await jsonRequest<{ code: string }>(baseUrl, `/api/cases/${caseId}/document-ingestions`, {
      method: "POST",
      body: {
        artifactType: "report",
        title: "Unsupported document",
        contentType: "application/pdf",
        content: "%PDF-1.7",
      },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.code, "invalid_input");
  });
});