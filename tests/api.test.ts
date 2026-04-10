import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { type AddressInfo } from "node:net";
import test from "node:test";
import { createApp } from "../src/application/create-app";
import { InMemoryAnamnesisStore } from "../src/infrastructure/InMemoryAnamnesisStore";
import {
  APPROVED_REVIEW_INPUT,
  LAB_ARTIFACT_INPUT,
  SUMMARY_ARTIFACT_INPUT,
} from "./fixtures";
import { jsonRequest, withServer } from "./helpers";

test("request validation rejects unrecognized fields instead of silently stripping them", async () => {
  await withServer(async (baseUrl) => {
    const response = await jsonRequest<{
      code: string;
      details: Array<{ code: string; keys?: string[] }>;
    }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        patientLabel: "case-extra-fields",
        unexpectedTopLevel: true,
        intake: {
          chiefConcern: "Persistent cough",
          symptomSummary: "Cough has continued for eleven days.",
          historySummary: "No diagnosis has been captured yet.",
          questionsForClinician: [],
          unexpectedNested: "should be rejected",
        },
      },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.code, "invalid_input");
    assert.equal(
      response.body.details.some(
        (issue) => issue.code === "unrecognized_keys" && issue.keys?.includes("unexpectedTopLevel"),
      ),
      true,
    );
    assert.equal(
      response.body.details.some(
        (issue) => issue.code === "unrecognized_keys" && issue.keys?.includes("unexpectedNested"),
      ),
      true,
    );
  });
});

test("malformed JSON bodies return a 400 validation response", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/cases`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: '{"intake":',
    });

    const body = (await response.json()) as { code: string; message: string };

    assert.equal(response.status, 400);
    assert.equal(body.code, "invalid_json");
  });
});

test("adding a new artifact marks existing physician packets as stale", async () => {
  await withServer(async (baseUrl) => {
    const createResponse = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        patientLabel: "case-stale-packet",
        intake: {
          chiefConcern: "Recurring dizziness",
          symptomSummary: "Episodes have increased over the last week.",
          historySummary: "Prior urgent-care summary is available.",
          questionsForClinician: ["Should follow-up labs be prioritized?"],
        },
      },
    });
    const caseId = createResponse.body.case.caseId;

    await jsonRequest(baseUrl, `/api/cases/${caseId}/artifacts`, {
      method: "POST",
      body: {
        ...SUMMARY_ARTIFACT_INPUT,
        artifactType: "summary",
        title: "Urgent care summary",
        summary: "Initial clinician note documented dizziness without diagnosis.",
        sourceDate: "2026-03-28",
      },
    });

    const packetResponse = await jsonRequest<{
      packet: { packetId: string; isStale: boolean; staleAt?: string };
    }>(baseUrl, `/api/cases/${caseId}/physician-packets`, {
      method: "POST",
      body: {
        requestedBy: "user@example.test",
      },
    });

    assert.equal(packetResponse.status, 201);
    assert.equal(packetResponse.body.packet.isStale, false);

    await jsonRequest(baseUrl, `/api/cases/${caseId}/artifacts`, {
      method: "POST",
      body: {
        ...LAB_ARTIFACT_INPUT,
        artifactType: "lab",
        title: "Follow-up lab panel",
        summary: "Additional evidence was registered after the packet draft.",
        sourceDate: "2026-03-29",
      },
    });

    const listPacketsResponse = await jsonRequest<{
      physicianPackets: Array<{ packetId: string; isStale: boolean; staleAt?: string }>;
    }>(baseUrl, `/api/cases/${caseId}/physician-packets`);

    assert.equal(listPacketsResponse.status, 200);
    assert.equal(listPacketsResponse.body.physicianPackets.length, 1);
    assert.equal(listPacketsResponse.body.physicianPackets[0]?.packetId, packetResponse.body.packet.packetId);
    assert.equal(listPacketsResponse.body.physicianPackets[0]?.isStale, true);
    assert.match(listPacketsResponse.body.physicianPackets[0]?.staleAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
  });
});

test("case creation, listing, and detail retrieval work end-to-end", async () => {
  await withServer(async (baseUrl) => {
    const createResponse = await jsonRequest<{ case: { caseId: string; status: string } }>(
      baseUrl,
      "/api/cases",
      {
        method: "POST",
        body: {
          patientLabel: "case-alpha",
          intake: {
            chiefConcern: "Persistent headaches and fatigue",
            symptomSummary: "Three weeks of daily headaches with increasing fatigue.",
            historySummary: "No current diagnosis. Prior urgent-care visit only.",
            questionsForClinician: ["Should blood pressure and labs be reviewed first?"],
          },
        },
      },
    );

    assert.equal(createResponse.status, 201);
    assert.equal(createResponse.body.case.status, "INTAKING");

    const listResponse = await jsonRequest<{
      cases: Array<{ caseId: string }>;
      meta: { returnedCount: number; limit: number; offset: number };
    }>(baseUrl, "/api/cases");

    assert.equal(listResponse.status, 200);
    assert.equal(listResponse.body.meta.returnedCount, 1);
    assert.equal(listResponse.body.cases[0].caseId, createResponse.body.case.caseId);

    const detailResponse = await jsonRequest<{ case: { caseId: string; status: string } }>(
      baseUrl,
      `/api/cases/${createResponse.body.case.caseId}`,
    );

    assert.equal(detailResponse.status, 200);
    assert.equal(detailResponse.body.case.caseId, createResponse.body.case.caseId);
    assert.equal(detailResponse.body.case.status, "INTAKING");
  });
});

test("packet drafting requires evidence first and remains explicitly non-diagnostic", async () => {
  await withServer(async (baseUrl) => {
    const createResponse = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        intake: {
          chiefConcern: "Intermittent abdominal pain",
          symptomSummary: "Pain occurs after meals and has increased over ten days.",
          historySummary: "No recent medication changes.",
          questionsForClinician: ["Are labs or imaging the next step?"],
        },
      },
    });
    const caseId = createResponse.body.case.caseId;

    const blockedPacketResponse = await jsonRequest<{ code: string }>(
      baseUrl,
      `/api/cases/${caseId}/physician-packets`,
      {
        method: "POST",
        body: {
          requestedBy: "user@example.test",
        },
      },
    );

    assert.equal(blockedPacketResponse.status, 409);
    assert.equal(blockedPacketResponse.body.code, "packet_requires_artifact");

    const artifactResponse = await jsonRequest<{ case: { status: string } }>(
      baseUrl,
      `/api/cases/${caseId}/artifacts`,
      {
        method: "POST",
        body: {
          ...LAB_ARTIFACT_INPUT,
          artifactType: "lab",
          title: "CBC results from urgent care",
          summary: "Mild anemia noted. No other current interpretation.",
          sourceDate: "2026-03-28",
        },
      },
    );

    assert.equal(artifactResponse.status, 201);
    assert.equal(artifactResponse.body.case.status, "READY_FOR_PACKET");

    const packetResponse = await jsonRequest<{
      case: { status: string };
      packet: { disclaimer: string; status: string; sections: Array<{ label: string }> };
    }>(
      baseUrl,
      `/api/cases/${caseId}/physician-packets`,
      {
        method: "POST",
        body: {
          requestedBy: "user@example.test",
          focus: "Summarize current symptoms and first available lab evidence",
        },
      },
    );

    assert.equal(packetResponse.status, 201);
    assert.equal(packetResponse.body.case.status, "REVIEW_REQUIRED");
    assert.equal(packetResponse.body.packet.status, "DRAFT_REVIEW_REQUIRED");
    assert.match(packetResponse.body.packet.disclaimer, /not a diagnosis/i);
    assert.equal(
      packetResponse.body.packet.sections.some((section) => section.label === "Registered evidence"),
      true,
    );

    const listPacketsResponse = await jsonRequest<{
      physicianPackets: Array<{ status: string }>;
      meta: { totalPackets: number };
    }>(baseUrl, `/api/cases/${caseId}/physician-packets`);

    assert.equal(listPacketsResponse.status, 200);
    assert.equal(listPacketsResponse.body.meta.totalPackets, 1);
    assert.equal(listPacketsResponse.body.physicianPackets[0].status, "DRAFT_REVIEW_REQUIRED");
  });
});

test("operations summary and metrics reflect the live in-memory state", async () => {
  await withServer(async (baseUrl) => {
    await jsonRequest(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        patientLabel: "case-one",
        intake: {
          chiefConcern: "Sleep disruption",
          symptomSummary: "Reduced sleep quality for two weeks.",
          historySummary: "No acute red-flag symptoms reported.",
          questionsForClinician: [],
        },
      },
    });

    const secondCase = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        patientLabel: "case-two",
        intake: {
          chiefConcern: "Shortness of breath on exertion",
          symptomSummary: "Recent exertional symptoms while climbing stairs.",
          historySummary: "No diagnosis captured in the current intake.",
          questionsForClinician: ["Should cardiology referral be considered?"],
        },
      },
    });

    await jsonRequest(baseUrl, `/api/cases/${secondCase.body.case.caseId}/artifacts`, {
      method: "POST",
      body: {
        ...SUMMARY_ARTIFACT_INPUT,
        artifactType: "summary",
        title: "Home symptom log",
        summary: "User recorded shortness of breath after moderate exertion for four days.",
      },
    });

    const summaryResponse = await jsonRequest<{
      summary: {
        totalCases: number;
        totalArtifacts: number;
        totalPackets: number;
        statusCounts: Record<string, number>;
      };
    }>(baseUrl, "/api/operations/summary");

    assert.equal(summaryResponse.status, 200);
    assert.equal(summaryResponse.body.summary.totalCases, 2);
    assert.equal(summaryResponse.body.summary.totalArtifacts, 1);
    assert.equal(summaryResponse.body.summary.totalPackets, 0);
    assert.equal(summaryResponse.body.summary.statusCounts.INTAKING, 1);
    assert.equal(summaryResponse.body.summary.statusCounts.READY_FOR_PACKET, 1);

    const metricsResponse = await fetch(`${baseUrl}/metrics`);
    const metricsText = await metricsResponse.text();

    assert.equal(metricsResponse.status, 200);
    assert.match(metricsText, /anamnesis_cases_total 2/);
    assert.match(metricsText, /anamnesis_artifacts_total 1/);
    assert.match(metricsText, /anamnesis_cases_by_status\{status="READY_FOR_PACKET"\} 1/);
  });
});

test("operations summary and metrics expose review, finalization, and audit counters", async () => {
  await withServer(async (baseUrl) => {
    const createResponse = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        patientLabel: "case-summary-counters",
        intake: {
          chiefConcern: "Intermittent palpitations",
          symptomSummary: "Palpitations after exertion during the last week.",
          historySummary: "No arrhythmia diagnosis in the current record.",
          questionsForClinician: ["Should ambulatory monitoring be considered?"],
        },
      },
    });
    const caseId = createResponse.body.case.caseId;

    await jsonRequest(baseUrl, `/api/cases/${caseId}/artifacts`, {
      method: "POST",
      body: {
        ...SUMMARY_ARTIFACT_INPUT,
        artifactType: "summary",
        title: "Home symptom summary",
        summary: "Patient logged exertional palpitations for five days.",
      },
    });

    const packetResponse = await jsonRequest<{ packet: { packetId: string } }>(
      baseUrl,
      `/api/cases/${caseId}/physician-packets`,
      {
        method: "POST",
        body: {
          requestedBy: "triage@example.test",
        },
      },
    );
    const packetId = packetResponse.body.packet.packetId;

    await jsonRequest(baseUrl, `/api/cases/${caseId}/physician-packets/${packetId}/reviews`, {
      method: "POST",
      body: {
        ...APPROVED_REVIEW_INPUT,
        reviewerName: "Dr. Review",
        comments: "Complete for downstream handoff.",
      },
    });

    await jsonRequest(baseUrl, `/api/cases/${caseId}/physician-packets/${packetId}/finalize`, {
      method: "POST",
      body: {
        finalizedBy: "Dr. Review",
        reason: "Workflow finalization for clinician handoff.",
      },
    });

    const summaryResponse = await jsonRequest<{
      summary: {
        totalCases: number;
        totalArtifacts: number;
        totalPackets: number;
        totalReviews: number;
        totalFinalizedPackets: number;
        totalAuditEvents: number;
        statusCounts: Record<string, number>;
      };
    }>(baseUrl, "/api/operations/summary");

    assert.equal(summaryResponse.status, 200);
    assert.equal(summaryResponse.body.summary.totalCases, 1);
    assert.equal(summaryResponse.body.summary.totalArtifacts, 1);
    assert.equal(summaryResponse.body.summary.totalPackets, 1);
    assert.equal(summaryResponse.body.summary.totalReviews, 1);
    assert.equal(summaryResponse.body.summary.totalFinalizedPackets, 1);
    assert.equal(summaryResponse.body.summary.totalAuditEvents, 5);
    assert.equal(summaryResponse.body.summary.statusCounts.REVIEW_REQUIRED, 1);

    const metricsResponse = await fetch(`${baseUrl}/metrics`);
    const metricsText = await metricsResponse.text();

    assert.equal(metricsResponse.status, 200);
    assert.match(metricsText, /anamnesis_reviews_total 1/);
    assert.match(metricsText, /anamnesis_finalized_packets_total 1/);
    assert.match(metricsText, /anamnesis_audit_events_total 5/);
  });
});

test("responses include security headers", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/healthz`);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(
      response.headers.has("content-security-policy"),
      "Helmet must set Content-Security-Policy",
    );
  });
});

test("validation rejects empty required strings", async () => {
  await withServer(async (baseUrl) => {
    const response = await jsonRequest<{ code: string }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        intake: {
          chiefConcern: "",
          symptomSummary: "Some symptoms present.",
          historySummary: "No prior diagnosis.",
        },
      },
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.code, "invalid_input");
  });
});

test("validation rejects strings exceeding maximum length", async () => {
  await withServer(async (baseUrl) => {
    const response = await jsonRequest<{ code: string }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        intake: {
          chiefConcern: "x".repeat(201),
          symptomSummary: "Some symptoms present.",
          historySummary: "No prior diagnosis.",
        },
      },
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.code, "invalid_input");
  });
});

test("validation rejects invalid artifact type enum values", async () => {
  await withServer(async (baseUrl) => {
    const createResult = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        intake: {
          chiefConcern: "Test concern",
          symptomSummary: "Test symptoms documented.",
          historySummary: "No prior diagnosis available.",
        },
      },
    });
    const response = await jsonRequest<{ code: string }>(
      baseUrl,
      `/api/cases/${createResult.body.case.caseId}/artifacts`,
      {
        method: "POST",
        body: {
          artifactType: "x-ray",
          title: "Some imaging result",
          summary: "Summary of the imaging result.",
        },
      },
    );
    assert.equal(response.status, 400);
    assert.equal(response.body.code, "invalid_input");
  });
});

test("validation rejects impossible calendar dates in sourceDate", async () => {
  await withServer(async (baseUrl) => {
    const createResult = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        intake: {
          chiefConcern: "Test concern",
          symptomSummary: "Test symptoms documented.",
          historySummary: "No prior diagnosis available.",
        },
      },
    });
    const response = await jsonRequest<{ code: string }>(
      baseUrl,
      `/api/cases/${createResult.body.case.caseId}/artifacts`,
      {
        method: "POST",
        body: {
          artifactType: "lab",
          title: "Lab panel",
          summary: "Lab results from an impossible date.",
          sourceDate: "2026-02-30",
        },
      },
    );
    assert.equal(response.status, 400);
    assert.equal(response.body.code, "invalid_input");
  });
});

test("DELETE /api/cases/:caseId/artifacts/:artifactId removes artifact and marks packets stale", async () => {
  await withServer(async (baseUrl) => {
    const createResult = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        intake: {
          chiefConcern: "Knee pain after running",
          symptomSummary: "Sharp pain in left knee during and after running.",
          historySummary: "No prior injury. Active runner for three years.",
        },
      },
    });
    const caseId = createResult.body.case.caseId;

    await jsonRequest(baseUrl, `/api/cases/${caseId}/artifacts`, {
      method: "POST",
      body: {
        ...SUMMARY_ARTIFACT_INPUT,
        artifactType: "summary",
        title: "Initial assessment notes",
        summary: "Runner with acute left knee pain, no swelling.",
      },
    });

    const addSecond = await jsonRequest<{ case: { artifacts: Array<{ artifactId: string }> } }>(
      baseUrl,
      `/api/cases/${caseId}/artifacts`,
      {
        method: "POST",
        body: {
          ...LAB_ARTIFACT_INPUT,
          artifactType: "lab",
          title: "Blood panel",
          summary: "Standard panel results within normal limits.",
        },
      },
    );

    await jsonRequest(baseUrl, `/api/cases/${caseId}/physician-packets`, {
      method: "POST",
      body: { requestedBy: "test@example.test" },
    });

    const artifactId = addSecond.body.case.artifacts[1]?.artifactId;
    const deleteResult = await jsonRequest<{
      case: { artifacts: Array<{ artifactId: string }>; physicianPackets: Array<{ isStale: boolean }> };
    }>(baseUrl, `/api/cases/${caseId}/artifacts/${artifactId}`, {
      method: "DELETE",
    });

    assert.equal(deleteResult.status, 200);
    assert.equal(deleteResult.body.case.artifacts.length, 1);
    assert.equal(deleteResult.body.case.physicianPackets[0]?.isStale, true);
  });
});

test("DELETE artifact on a missing case returns 404", async () => {
  await withServer(async (baseUrl) => {
    const response = await jsonRequest<{ code: string }>(
      baseUrl,
      "/api/cases/nonexistent-case-id/artifacts/nonexistent-artifact",
      { method: "DELETE" },
    );
    assert.equal(response.status, 404);
    assert.equal(response.body.code, "case_not_found");
  });
});

test("DELETE artifact with a wrong artifactId returns 404", async () => {
  await withServer(async (baseUrl) => {
    const createResult = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        intake: {
          chiefConcern: "Fatigue",
          symptomSummary: "Chronic fatigue lasting two months.",
          historySummary: "No relevant prior diagnosis.",
        },
      },
    });
    const caseId = createResult.body.case.caseId;

    await jsonRequest(baseUrl, `/api/cases/${caseId}/artifacts`, {
      method: "POST",
      body: {
        artifactType: "note",
        title: "Clinician note",
        summary: "Patient reports fatigue but no other symptoms.",
      },
    });

    const response = await jsonRequest<{ code: string }>(
      baseUrl,
      `/api/cases/${caseId}/artifacts/wrong-artifact-id`,
      { method: "DELETE" },
    );
    assert.equal(response.status, 404);
    assert.equal(response.body.code, "artifact_not_found");
  });
});

test("DELETE last artifact reverts case status to INTAKING", async () => {
  await withServer(async (baseUrl) => {
    const createResult = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        intake: {
          chiefConcern: "Lower back pain",
          symptomSummary: "Persistent lower back pain for one week.",
          historySummary: "No prior injury or imaging performed.",
        },
      },
    });
    const caseId = createResult.body.case.caseId;

    const addResult = await jsonRequest<{
      case: { status: string; artifacts: Array<{ artifactId: string }> };
    }>(baseUrl, `/api/cases/${caseId}/artifacts`, {
      method: "POST",
      body: {
        ...LAB_ARTIFACT_INPUT,
        artifactType: "lab",
        title: "CBC panel",
        summary: "Results within normal ranges.",
      },
    });

    assert.equal(addResult.body.case.status, "READY_FOR_PACKET");
    const artifactId = addResult.body.case.artifacts[0]?.artifactId;

    const deleteResult = await jsonRequest<{ case: { status: string; artifacts: Array<unknown> } }>(
      baseUrl,
      `/api/cases/${caseId}/artifacts/${artifactId}`,
      { method: "DELETE" },
    );

    assert.equal(deleteResult.status, 200);
    assert.equal(deleteResult.body.case.status, "INTAKING");
    assert.equal(deleteResult.body.case.artifacts.length, 0);
  });
});

test("DELETE /api/cases/:caseId removes case and returns 204", async () => {
  await withServer(async (baseUrl) => {
    const createResult = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        intake: {
          chiefConcern: "Seasonal allergy symptoms",
          symptomSummary: "Sneezing and congestion for two weeks.",
          historySummary: "Known allergy history managed with OTC medications.",
        },
      },
    });
    const caseId = createResult.body.case.caseId;

    const deleteResponse = await fetch(`${baseUrl}/api/cases/${caseId}`, { method: "DELETE" });
    assert.equal(deleteResponse.status, 204);

    const detailResponse = await jsonRequest<{ code: string }>(baseUrl, `/api/cases/${caseId}`);
    assert.equal(detailResponse.status, 404);
    assert.equal(detailResponse.body.code, "case_not_found");
  });
});

test("DELETE /api/cases/:caseId returns 404 for missing case", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/cases/nonexistent-case-id`, { method: "DELETE" });
    assert.equal(response.status, 404);
    const body = (await response.json()) as { code: string };
    assert.equal(body.code, "case_not_found");
  });
});

test("/readyz returns 503 when the server is shutting down", async () => {
  let shuttingDown = false;
  const store = new InMemoryAnamnesisStore();
  const app = createApp({ store, isShuttingDown: () => shuttingDown });

  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const readyResponse = await fetch(`${baseUrl}/readyz`);
    const readyBody = (await readyResponse.json()) as { status: string };
    assert.equal(readyResponse.status, 200);
    assert.equal(readyBody.status, "ready");

    shuttingDown = true;

    const drainingResponse = await fetch(`${baseUrl}/readyz`);
    const drainingBody = (await drainingResponse.json()) as { status: string };
    assert.equal(drainingResponse.status, 503);
    assert.equal(drainingBody.status, "shutting_down");
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("sourceDate in the future is rejected with 400", async () => {
  await withServer(async (baseUrl) => {
    const createResponse = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        patientLabel: "case-future-date",
        intake: {
          chiefConcern: "Headache",
          symptomSummary: "Intermittent headache for two days.",
          historySummary: "No prior diagnosis.",
          questionsForClinician: [],
        },
      },
    });
    const caseId = createResponse.body.case.caseId;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const futureDate = tomorrow.toISOString().slice(0, 10);

    const artifactResponse = await jsonRequest<{ code: string }>(
      baseUrl,
      `/api/cases/${caseId}/artifacts`,
      {
        method: "POST",
        body: {
          artifactType: "summary",
          title: "Future-dated note",
          summary: "This should be rejected.",
          sourceDate: futureDate,
        },
      },
    );

    assert.equal(artifactResponse.status, 400);
    assert.equal(artifactResponse.body.code, "invalid_input");
  });
});
