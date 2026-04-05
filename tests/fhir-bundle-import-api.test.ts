import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { type AddressInfo } from "node:net";
import test from "node:test";
import { bootstrap } from "../src/bootstrap";

async function withServer(
  run: (baseUrl: string) => Promise<void>,
  options?: Record<string, unknown>,
) {
  const { app } = bootstrap({
    allowInsecureDevAuth: true,
    ...(options ?? {}),
  } as never);
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

test("POST /fhir-bundle-imports creates multiple artifacts, stales packets, and records a dedicated audit event", async () => {
  await withServer(async (baseUrl) => {
    const caseResponse = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        patientLabel: "fhir-bundle-api-case",
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

    await jsonRequest(baseUrl, `/api/cases/${caseId}/physician-packets`, {
      method: "POST",
      body: { requestedBy: "nurse@example.test" },
    });

    const importResponse = await jsonRequest<{
      case: { physicianPackets: Array<{ isStale: boolean }> };
      artifacts: Array<{ title: string; summary: string }>;
      ingestions: Array<{ contentType: string; truncated: boolean; normalizationProfile: string }>;
      bundleImport: { resourceType: string; bundleType: string; artifactCount: number; bundleProfile: string; entryProfiles: string[] };
    }>(baseUrl, `/api/cases/${caseId}/fhir-bundle-imports`, {
      method: "POST",
      body: {
        artifactType: "report",
        resource: {
          resourceType: "Bundle",
          type: "document",
          identifier: { system: "urn:ietf:rfc:3986", value: "urn:uuid:document-bundle-1" },
          timestamp: "2026-03-30T12:00:00Z",
          entry: [
            {
              resource: {
                resourceType: "Composition",
                status: "final",
              },
            },
            {
              resource: {
                resourceType: "DocumentReference",
                status: "current",
                description: "Discharge note",
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
            {
              resource: {
                resourceType: "Binary",
                contentType: "text/markdown",
                data: Buffer.from("# Visit Note\n\nSymptoms remain stable.", "utf8").toString("base64"),
              },
            },
          ],
        },
      },
    });

    assert.equal(importResponse.status, 201);
    assert.equal(importResponse.body.artifacts.length, 2);
    assert.deepStrictEqual(
      importResponse.body.artifacts.map((artifact) => artifact.title),
      ["Discharge note", "FHIR Binary import"],
    );
    assert.equal(importResponse.body.ingestions.length, 2);
    assert.deepStrictEqual(importResponse.body.ingestions.map((item) => item.normalizationProfile), [
      "document.text.plain.v1",
      "document.text.markdown.v1",
    ]);
    assert.equal(importResponse.body.bundleImport.resourceType, "Bundle");
    assert.equal(importResponse.body.bundleImport.bundleType, "document");
    assert.equal(importResponse.body.bundleImport.bundleProfile, "fhir.bundle.document.v1");
    assert.equal(importResponse.body.bundleImport.artifactCount, 2);
    assert.deepStrictEqual(importResponse.body.bundleImport.entryProfiles, [
      "fhir.document-reference.inline.text.v1",
      "fhir.binary.inline.text.v1",
    ]);
    assert.equal(importResponse.body.case.physicianPackets[0]?.isStale, true);

    const auditResponse = await jsonRequest<{
      events: Array<{ eventType: string }>;
      meta: { totalEvents: number };
    }>(baseUrl, `/api/cases/${caseId}/audit-events`);

    assert.deepStrictEqual(auditResponse.body.events.map((event) => event.eventType), [
      "case.created",
      "artifact.added",
      "packet.drafted",
      "fhir.bundle.imported",
    ]);
    assert.equal(auditResponse.body.meta.totalEvents, 4);

    const summaryResponse = await jsonRequest<{
      summary: { totalArtifacts: number; totalPackets: number; totalAuditEvents: number };
    }>(baseUrl, "/api/operations/summary");

    assert.equal(summaryResponse.body.summary.totalArtifacts, 3);
    assert.equal(summaryResponse.body.summary.totalPackets, 1);
    assert.equal(summaryResponse.body.summary.totalAuditEvents, 4);
  });
});

test("POST /fhir-bundle-imports rejects unsupported bundle types", async () => {
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

    const response = await jsonRequest<{ code: string }>(
      baseUrl,
      `/api/cases/${caseId}/fhir-bundle-imports`,
      {
        method: "POST",
        body: {
          resource: {
            resourceType: "Bundle",
            type: "transaction",
            entry: [],
          },
        },
      },
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.code, "fhir_import_bundle_type_unsupported");
  });
});

test("POST /fhir-bundle-imports rejects document bundles without the required document envelope", async () => {
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

    const response = await jsonRequest<{ code: string }>(
      baseUrl,
      `/api/cases/${caseId}/fhir-bundle-imports`,
      {
        method: "POST",
        body: {
          resource: {
            resourceType: "Bundle",
            type: "document",
            entry: [
              {
                resource: {
                  resourceType: "DocumentReference",
                  status: "current",
                  content: [
                    {
                      attachment: {
                        contentType: "text/plain",
                        data: Buffer.from("Bundle body", "utf8").toString("base64"),
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.code, "fhir_import_bundle_document_composition_required");
  });
});

test("POST /fhir-bundle-imports imports url-only attachments when external fetch is explicitly enabled", async () => {
  const fetchedUrls: string[] = [];

  await withServer(
    async (baseUrl) => {
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

      const response = await jsonRequest<{
        artifacts: Array<{ title: string; summary: string }>;
        bundleImport: { usedExternalAttachmentFetch: boolean; bundleProfile: string; entryProfiles: string[] };
      }>(baseUrl, `/api/cases/${caseId}/fhir-bundle-imports`, {
        method: "POST",
        body: {
          allowExternalAttachmentFetch: true,
          resource: {
            resourceType: "Bundle",
            type: "collection",
            entry: [
              {
                resource: {
                  resourceType: "DocumentReference",
                  status: "current",
                  description: "Remote discharge note",
                  content: [
                    {
                      attachment: {
                        contentType: "text/plain",
                        url: "https://example.test/discharge.txt",
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      });

      assert.equal(response.status, 201);
      assert.deepStrictEqual(fetchedUrls, ["https://example.test/discharge.txt"]);
      assert.equal(response.body.artifacts.length, 1);
      assert.equal(response.body.artifacts[0]?.summary, "Fetched document text from remote source.");
      assert.equal(response.body.bundleImport.usedExternalAttachmentFetch, true);
      assert.equal(response.body.bundleImport.bundleProfile, "fhir.bundle.collection.v1");
      assert.deepStrictEqual(response.body.bundleImport.entryProfiles, [
        "fhir.document-reference.external.text.v1",
      ]);
    },
    {
      externalAttachmentFetcher: async (url: string) => {
        fetchedUrls.push(url);
        return {
          contentType: "text/plain; charset=UTF-8",
          content: "Fetched document text from remote source.",
        };
      },
    },
  );
});