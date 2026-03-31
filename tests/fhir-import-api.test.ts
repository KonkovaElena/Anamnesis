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

test("POST /fhir-imports creates a bounded artifact, stales packets, and records a dedicated audit event", async () => {
  await withServer(async (baseUrl) => {
    const caseResponse = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        patientLabel: "fhir-import-api-case",
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

    const importResponse = await jsonRequest<{
      case: { physicianPackets: Array<{ isStale: boolean }> };
      artifact: { title: string; summary: string };
      ingestion: { contentType: string; truncated: boolean };
      fhirImport: { resourceType: string; sourceContentType: string; title: string };
    }>(baseUrl, `/api/cases/${caseId}/fhir-imports`, {
      method: "POST",
      body: {
        artifactType: "report",
        resource: {
          resourceType: "DocumentReference",
          status: "current",
          description: "Discharge note",
          date: "2026-03-30T12:00:00Z",
          content: [
            {
              attachment: {
                contentType: "text/plain; charset=UTF-8",
                data: Buffer.from(
                  "Discharged home after evaluation.\n\nFollow-up with PCP recommended.",
                  "utf8",
                ).toString("base64"),
              },
            },
          ],
        },
      },
    });

    assert.equal(importResponse.status, 201);
    assert.equal(importResponse.body.artifact.title, "Discharge note");
    assert.equal(importResponse.body.fhirImport.resourceType, "DocumentReference");
    assert.equal(importResponse.body.fhirImport.sourceContentType, "text/plain");
    assert.equal(importResponse.body.fhirImport.title, "Discharge note");
    assert.equal(importResponse.body.ingestion.contentType, "text/plain");
    assert.equal(importResponse.body.ingestion.truncated, false);
    assert.equal(
      importResponse.body.artifact.summary,
      "Discharged home after evaluation.\n\nFollow-up with PCP recommended.",
    );
    assert.equal(importResponse.body.case.physicianPackets[0]?.isStale, true);

    const auditResponse = await jsonRequest<{
      events: Array<{ eventType: string }>;
      meta: { totalEvents: number };
    }>(baseUrl, `/api/cases/${caseId}/audit-events`);

    assert.deepStrictEqual(auditResponse.body.events.map((event) => event.eventType), [
      "case.created",
      "artifact.added",
      "packet.drafted",
      "fhir.imported",
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

test("POST /fhir-imports rejects unsupported FHIR resource types", async () => {
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

    const response = await jsonRequest<{ code: string }>(baseUrl, `/api/cases/${caseId}/fhir-imports`, {
      method: "POST",
      body: {
        resource: {
          resourceType: "Observation",
          status: "final",
        },
      },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.code, "fhir_import_resource_unsupported");
  });
});