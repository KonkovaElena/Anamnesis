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
  options?: {
    method?: string;
    body?: unknown;
  },
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options?.method ?? "GET",
    headers: {
      "content-type": "application/json",
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  return {
    status: response.status,
    body: (await response.json()) as T,
  };
}

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
      meta: { totalCases: number };
    }>(baseUrl, "/api/cases");

    assert.equal(listResponse.status, 200);
    assert.equal(listResponse.body.meta.totalCases, 1);
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
    assert.match(metricsText, /personal_doctor_cases_total 2/);
    assert.match(metricsText, /personal_doctor_artifacts_total 1/);
    assert.match(metricsText, /personal_doctor_cases_by_status\{status="READY_FOR_PACKET"\} 1/);
  });
});
