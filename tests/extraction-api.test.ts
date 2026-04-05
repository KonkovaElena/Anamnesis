import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { type AddressInfo } from "node:net";
import test from "node:test";
import { bootstrap } from "../src/bootstrap";

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const { app } = bootstrap({ allowInsecureDevAuth: true });
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

test("POST /api/cases accepts workflowFamily and sample registration enriches packet drafts", async () => {
  await withServer(async (baseUrl) => {
    const caseResponse = await jsonRequest<{
      case: { caseId: string; workflowFamily: string };
    }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        workflowFamily: "MRNA_BOARD_REVIEW",
        patientLabel: "mrna-api-case",
        intake: {
          chiefConcern: "Molecular board preparation",
          symptomSummary: "Board package requires RNA evidence registration.",
          historySummary: "Prior sequencing intake completed.",
          questionsForClinician: ["Is the packet board-ready?"],
        },
      },
    });

    assert.equal(caseResponse.status, 201);
    assert.equal(caseResponse.body.case.workflowFamily, "MRNA_BOARD_REVIEW");

    const caseId = caseResponse.body.case.caseId;

    const sampleResponse = await jsonRequest<{
      case: { samples: Array<{ sampleId: string; sampleType: string; assayType: string }> };
    }>(baseUrl, `/api/cases/${caseId}/samples`, {
      method: "POST",
      body: {
        sampleId: "sample-rna-01",
        sampleType: "TUMOR_RNA",
        assayType: "RNA_SEQ",
        accessionId: "ACC-RNA-01",
        sourceSite: "oncology-lab",
      },
    });

    assert.equal(sampleResponse.status, 201);
    assert.equal(sampleResponse.body.case.samples.length, 1);
    assert.equal(sampleResponse.body.case.samples[0]?.sampleId, "sample-rna-01");

    await jsonRequest(baseUrl, `/api/cases/${caseId}/artifacts`, {
      method: "POST",
      body: {
        artifactType: "summary",
        title: "Tumor RNA ingest bundle",
        summary: "FASTQ bundle registered for board review.",
      },
    });

    const packetResponse = await jsonRequest<{
      packet: { sections: Array<{ label: string; content: string }> };
    }>(baseUrl, `/api/cases/${caseId}/physician-packets`, {
      method: "POST",
      body: {
        requestedBy: "molecular-board@example.test",
      },
    });

    const workflowSection = packetResponse.body.packet.sections.find((section) => section.label === "Workflow family");
    const samplesSection = packetResponse.body.packet.sections.find((section) => section.label === "Registered samples");

    assert.equal(workflowSection?.content, "mRNA board review");
    assert.match(samplesSection?.content ?? "", /TUMOR_RNA \(RNA_SEQ\) accession ACC-RNA-01/);

    const auditResponse = await jsonRequest<{
      events: Array<{ eventType: string }>;
    }>(baseUrl, `/api/cases/${caseId}/audit-events`);

    assert.deepStrictEqual(auditResponse.body.events.map((event) => event.eventType), [
      "case.created",
      "sample.registered",
      "artifact.added",
      "packet.drafted",
    ]);
  });
});

test("POST /api/cases/:caseId/study-context and /qc-summary enrich MRI packet drafts", async () => {
  await withServer(async (baseUrl) => {
    const caseResponse = await jsonRequest<{
      case: { caseId: string; workflowFamily: string };
    }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        workflowFamily: "MRI_SECOND_OPINION",
        patientLabel: "mri-api-case",
        intake: {
          chiefConcern: "MRI second opinion requested",
          symptomSummary: "Outside read was inconclusive.",
          historySummary: "Neurology requested additional review.",
          questionsForClinician: ["Is repeat imaging required?"],
        },
      },
    });

    const caseId = caseResponse.body.case.caseId;

    await jsonRequest(baseUrl, `/api/cases/${caseId}/artifacts`, {
      method: "POST",
      body: {
        artifactType: "imaging-summary",
        title: "Imported MRI study summary",
        summary: "Axial and sagittal sequences available for second-opinion review.",
      },
    });

    const studyContextResponse = await jsonRequest<{
      case: { studyContext?: { studyInstanceUid: string }; qcSummary?: { disposition: string } };
    }>(baseUrl, `/api/cases/${caseId}/study-context`, {
      method: "POST",
      body: {
        source: "internal-ingest",
        studyContext: {
          studyInstanceUid: "1.2.840.10008.1",
          accessionNumber: "MRI-42",
          studyDate: "2026-04-04",
          sourceArchive: "orthanc-neuro",
          series: [
            {
              seriesInstanceUid: "1.2.840.10008.1.1",
              modality: "MR",
              sequenceLabel: "T1",
              instanceCount: 240,
            },
          ],
        },
      },
    });

    assert.equal(studyContextResponse.status, 200);
    assert.equal(studyContextResponse.body.case.studyContext?.studyInstanceUid, "1.2.840.10008.1");
    assert.equal(studyContextResponse.body.case.qcSummary?.disposition, "pending");

    const qcResponse = await jsonRequest<{
      case: { qcSummary?: { disposition: string; issues: string[] } };
    }>(baseUrl, `/api/cases/${caseId}/qc-summary`, {
      method: "POST",
      body: {
        disposition: "warn",
        issues: ["Motion artifact in one sequence"],
        qcSummary: {
          summary: "Study remains reviewable with one degraded sequence.",
          checks: [
            {
              checkId: "motion",
              status: "warn",
              detail: "Mild motion artifact detected",
            },
          ],
        },
      },
    });

    assert.equal(qcResponse.status, 200);
    assert.equal(qcResponse.body.case.qcSummary?.disposition, "warn");
    assert.deepStrictEqual(qcResponse.body.case.qcSummary?.issues, ["Motion artifact in one sequence"]);

    const packetResponse = await jsonRequest<{
      packet: { sections: Array<{ label: string; content: string }> };
    }>(baseUrl, `/api/cases/${caseId}/physician-packets`, {
      method: "POST",
      body: {
        requestedBy: "radiology-ops@example.test",
      },
    });

    const imagingSection = packetResponse.body.packet.sections.find((section) => section.label === "Imaging study context");
    const qcSection = packetResponse.body.packet.sections.find((section) => section.label === "Quality control summary");

    assert.match(imagingSection?.content ?? "", /Study UID: 1.2.840.10008.1/);
    assert.match(qcSection?.content ?? "", /Disposition: warn/);
    assert.match(qcSection?.content ?? "", /Motion artifact in one sequence/);

    const auditResponse = await jsonRequest<{
      events: Array<{ eventType: string }>;
    }>(baseUrl, `/api/cases/${caseId}/audit-events`);

    assert.deepStrictEqual(auditResponse.body.events.map((event) => event.eventType), [
      "case.created",
      "artifact.added",
      "study-context.attached",
      "qc.recorded",
      "packet.drafted",
    ]);
  });
});

test("POST /api/cases/:caseId/qc-summary returns a domain conflict before study context exists", async () => {
  await withServer(async (baseUrl) => {
    const caseResponse = await jsonRequest<{
      case: { caseId: string };
    }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        workflowFamily: "MRI_SECOND_OPINION",
        intake: {
          chiefConcern: "QC gating",
          symptomSummary: "Study context must exist first.",
          historySummary: "No imaging study attached yet.",
          questionsForClinician: [],
        },
      },
    });

    const response = await jsonRequest<{
      code: string;
      message: string;
    }>(baseUrl, `/api/cases/${caseResponse.body.case.caseId}/qc-summary`, {
      method: "POST",
      body: {
        disposition: "pass",
      },
    });

    assert.equal(response.status, 409);
    assert.equal(response.body.code, "study_context_required");
  });
});

test("POST /api/cases/:caseId/samples rejects duplicate sample ids", async () => {
  await withServer(async (baseUrl) => {
    const caseResponse = await jsonRequest<{
      case: { caseId: string };
    }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        workflowFamily: "MRNA_BOARD_REVIEW",
        intake: {
          chiefConcern: "Duplicate sample protection",
          symptomSummary: "Same accession should not be double-registered.",
          historySummary: "Board packet prep is in progress.",
          questionsForClinician: [],
        },
      },
    });

    const caseId = caseResponse.body.case.caseId;

    await jsonRequest(baseUrl, `/api/cases/${caseId}/samples`, {
      method: "POST",
      body: {
        sampleId: "sample-rna-01",
        sampleType: "TUMOR_RNA",
        assayType: "RNA_SEQ",
        accessionId: "ACC-RNA-01",
        sourceSite: "oncology-lab",
      },
    });

    const duplicateResponse = await jsonRequest<{
      code: string;
    }>(baseUrl, `/api/cases/${caseId}/samples`, {
      method: "POST",
      body: {
        sampleId: "sample-rna-01",
        sampleType: "TUMOR_RNA",
        assayType: "RNA_SEQ",
        accessionId: "ACC-RNA-01",
        sourceSite: "oncology-lab",
      },
    });

    assert.equal(duplicateResponse.status, 409);
    assert.equal(duplicateResponse.body.code, "sample_already_registered");
  });
});

test("POST /api/cases/:caseId/artifacts accepts derived artifact metadata and packet drafts render evidence lineage", async () => {
  await withServer(async (baseUrl) => {
    const caseResponse = await jsonRequest<{
      case: { caseId: string };
    }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        intake: {
          chiefConcern: "Evidence lineage API test",
          symptomSummary: "Derived evidence should remain traceable through the public API.",
          historySummary: "A source artifact is promoted into a derived review bundle.",
          questionsForClinician: [],
        },
      },
    });

    const caseId = caseResponse.body.case.caseId;

    const sourceArtifactResponse = await jsonRequest<{
      case: { artifacts: Array<{ artifactId: string; artifactClass?: string; semanticType?: string }> };
    }>(baseUrl, `/api/cases/${caseId}/artifacts`, {
      method: "POST",
      body: {
        artifactType: "lab",
        artifactClass: "SOURCE",
        semanticType: "lab-panel",
        artifactHash: "sha256:source",
        title: "Baseline lab panel",
        summary: "Source evidence for downstream synthesis.",
      },
    });

    const sourceArtifact = sourceArtifactResponse.body.case.artifacts[0];
    assert.ok(sourceArtifact?.artifactId);
    assert.equal(sourceArtifact?.artifactClass, "SOURCE");
    assert.equal(sourceArtifact?.semanticType, "lab-panel");

    const derivedArtifactResponse = await jsonRequest<{
      case: { artifacts: Array<{ artifactClass?: string; semanticType?: string; derivedFromArtifactIds?: string[] }> };
    }>(baseUrl, `/api/cases/${caseId}/artifacts`, {
      method: "POST",
      body: {
        artifactType: "report",
        artifactClass: "DERIVED",
        semanticType: "board-evidence-bundle",
        artifactHash: "sha256:derived",
        derivedFromArtifactIds: [sourceArtifact.artifactId],
        title: "Derived evidence bundle",
        summary: "Compiled from the baseline source evidence.",
      },
    });

    const derivedArtifact = derivedArtifactResponse.body.case.artifacts[1];
    assert.equal(derivedArtifact?.artifactClass, "DERIVED");
    assert.equal(derivedArtifact?.semanticType, "board-evidence-bundle");
    assert.deepStrictEqual(derivedArtifact?.derivedFromArtifactIds, [sourceArtifact.artifactId]);

    const packetResponse = await jsonRequest<{
      packet: { sections: Array<{ label: string; content: string }> };
    }>(baseUrl, `/api/cases/${caseId}/physician-packets`, {
      method: "POST",
      body: {},
    });

    const lineageSection = packetResponse.body.packet.sections.find((section) => section.label === "Evidence lineage");
    assert.match(lineageSection?.content ?? "", /Links: 1/);
    assert.match(lineageSection?.content ?? "", /Baseline lab panel/);
    assert.match(lineageSection?.content ?? "", /Derived evidence bundle/);
  });
});

test("GET /api/cases/:caseId/evidence-lineage returns graph structure and artifact metadata", async () => {
  await withServer(async (baseUrl) => {
    const caseResponse = await jsonRequest<{
      case: { caseId: string };
    }>(baseUrl, "/api/cases", {
      method: "POST",
      body: {
        intake: {
          chiefConcern: "Evidence lineage endpoint test",
          symptomSummary: "Derived evidence should be visible through a dedicated read-only route.",
          historySummary: "A review bundle was produced from a source artifact.",
          questionsForClinician: [],
        },
      },
    });

    const caseId = caseResponse.body.case.caseId;

    const sourceResponse = await jsonRequest<{
      case: { artifacts: Array<{ artifactId: string }> };
    }>(baseUrl, `/api/cases/${caseId}/artifacts`, {
      method: "POST",
      body: {
        artifactType: "lab",
        artifactClass: "SOURCE",
        semanticType: "lab-panel",
        title: "Primary lab panel",
        summary: "Source evidence for a review bundle.",
      },
    });

    const sourceArtifactId = sourceResponse.body.case.artifacts[0]?.artifactId;
    assert.ok(sourceArtifactId);

    await jsonRequest(baseUrl, `/api/cases/${caseId}/artifacts`, {
      method: "POST",
      body: {
        artifactType: "report",
        artifactClass: "DERIVED",
        semanticType: "board-evidence-bundle",
        derivedFromArtifactIds: [sourceArtifactId],
        title: "Board review bundle",
        summary: "Derived synthesis for multidisciplinary review.",
      },
    });

    const lineageResponse = await jsonRequest<{
      lineage: {
        edges: Array<{ producerArtifactId: string; consumerArtifactId: string }>;
        roots: string[];
        terminal: string[];
      };
      artifacts: Array<{ artifactId: string; title: string; artifactClass?: string; semanticType?: string }>;
      meta: { artifactCount: number; edgeCount: number };
    }>(baseUrl, `/api/cases/${caseId}/evidence-lineage`);

    assert.equal(lineageResponse.status, 200);
    assert.equal(lineageResponse.body.meta.artifactCount, 2);
    assert.equal(lineageResponse.body.meta.edgeCount, 1);
    assert.equal(lineageResponse.body.lineage.edges.length, 1);
    assert.deepStrictEqual(lineageResponse.body.lineage.roots, [sourceArtifactId]);
    assert.equal(lineageResponse.body.artifacts[0]?.title, "Primary lab panel");
    assert.equal(lineageResponse.body.artifacts[1]?.title, "Board review bundle");
    assert.equal(lineageResponse.body.artifacts[1]?.artifactClass, "DERIVED");
    assert.equal(lineageResponse.body.artifacts[1]?.semanticType, "board-evidence-bundle");
  });
});

test("GET /api/cases/:caseId/evidence-lineage returns 404 for a missing case", async () => {
  await withServer(async (baseUrl) => {
    const response = await jsonRequest<{
      code: string;
    }>(baseUrl, "/api/cases/00000000-0000-0000-0000-000000000000/evidence-lineage");

    assert.equal(response.status, 404);
    assert.equal(response.body.code, "case_not_found");
  });
});