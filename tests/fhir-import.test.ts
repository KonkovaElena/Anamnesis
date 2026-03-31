import assert from "node:assert/strict";
import test from "node:test";
import {
  PersonalDoctorDomainError,
  addArtifact,
  createCase,
  draftPhysicianPacket,
  type PersonalDoctorCase,
} from "../src/domain/personal-doctor";

interface FhirImportInputView {
  artifactType?: "note" | "lab" | "summary" | "report" | "imaging-summary";
  title?: string;
  sourceDate?: string;
  provenance?: string;
  resource: Record<string, unknown>;
}

interface FhirImportView {
  resourceType: string;
  transportContentType: string;
  sourceContentType: string;
  title: string;
  sourceDate?: string;
}

interface IngestionView {
  contentType: string;
  filename?: string;
  normalizedCharacterCount: number;
  excerptCharacterCount: number;
  truncated: boolean;
}

type FhirImportResultView = {
  nextCase: PersonalDoctorCase;
  artifact: { title: string; summary: string; provenance?: string; sourceDate?: string };
  ingestion: IngestionView;
  fhirImport: FhirImportView;
};

type IngestFhirResourceFn = (
  record: PersonalDoctorCase,
  input: FhirImportInputView,
  now?: Date,
) => FhirImportResultView;

async function loadIngestFhirResource(): Promise<IngestFhirResourceFn> {
  const moduleNamespace = (await import("../src/domain/personal-doctor")) as Record<string, unknown>;
  const ingestFhirResource = moduleNamespace.ingestFhirResource;
  assert.equal(typeof ingestFhirResource, "function", "ingestFhirResource export missing");
  return ingestFhirResource as IngestFhirResourceFn;
}

function seedPacketCase(): PersonalDoctorCase {
  let record = createCase({
    patientLabel: "fhir-import-case",
    intake: {
      chiefConcern: "Persistent cough",
      symptomSummary: "Symptoms have continued for two weeks.",
      historySummary: "Prior urgent-care note exists.",
      questionsForClinician: ["Should imaging be considered?"],
    },
  });

  record = addArtifact(record, {
    artifactType: "summary",
    title: "Manual intake summary",
    summary: "Initial symptoms were entered manually.",
    sourceDate: "2026-03-28",
  });

  const packetResult = draftPhysicianPacket(record, {
    requestedBy: "triage@example.test",
  });

  return packetResult.nextCase;
}

test("ingestFhirResource imports an inline DocumentReference into a bounded artifact and marks packets stale", async () => {
  const ingestFhirResource = await loadIngestFhirResource();
  const record = seedPacketCase();

  const result = ingestFhirResource(record, {
    artifactType: "report",
    resource: {
      resourceType: "DocumentReference",
      status: "current",
      description: "ED discharge note",
      date: "2026-03-30T12:00:00Z",
      content: [
        {
          attachment: {
            contentType: "text/plain; charset=UTF-8",
            data: Buffer.from("  First line.\r\n\r\n Second   line here.  ", "utf8").toString("base64"),
          },
        },
      ],
    },
  });

  assert.equal(result.artifact.title, "ED discharge note");
  assert.equal(result.artifact.summary, "First line.\n\nSecond line here.");
  assert.equal(result.artifact.sourceDate, "2026-03-30");
  assert.equal(result.ingestion.contentType, "text/plain");
  assert.equal(result.ingestion.truncated, false);
  assert.equal(result.fhirImport.resourceType, "DocumentReference");
  assert.equal(result.fhirImport.transportContentType, "application/fhir+json");
  assert.equal(result.fhirImport.sourceContentType, "text/plain");
  assert.equal(result.fhirImport.sourceDate, "2026-03-30");
  assert.equal(result.nextCase.physicianPackets[0]?.isStale, true);
  assert.match(result.artifact.provenance ?? "", /fhir-import:DocumentReference/);
  assert.match(result.artifact.provenance ?? "", /document-ingestion:text\/plain/);
});

test("ingestFhirResource imports an inline Binary resource with text markdown content", async () => {
  const ingestFhirResource = await loadIngestFhirResource();
  const record = createCase({
    intake: {
      chiefConcern: "Headache",
      symptomSummary: "Severe headache persists.",
      historySummary: "No known trauma.",
      questionsForClinician: [],
    },
  });

  const result = ingestFhirResource(record, {
    artifactType: "note",
    title: "Imported markdown note",
    resource: {
      resourceType: "Binary",
      contentType: "text/markdown; charset=UTF-8",
      data: Buffer.from("# Visit Note\n\nSymptoms remain stable.", "utf8").toString("base64"),
    },
  });

  assert.equal(result.artifact.title, "Imported markdown note");
  assert.equal(result.artifact.summary, "# Visit Note\n\nSymptoms remain stable.");
  assert.equal(result.ingestion.contentType, "text/markdown");
  assert.equal(result.fhirImport.resourceType, "Binary");
  assert.equal(result.fhirImport.sourceContentType, "text/markdown");
  assert.match(result.artifact.provenance ?? "", /fhir-import:Binary/);
});

test("ingestFhirResource rejects DocumentReference imports that only expose external attachment urls", async () => {
  const ingestFhirResource = await loadIngestFhirResource();
  const record = createCase({
    intake: {
      chiefConcern: "Fatigue",
      symptomSummary: "Persistent fatigue for one week.",
      historySummary: "No recent illness.",
      questionsForClinician: [],
    },
  });

  assert.throws(
    () =>
      ingestFhirResource(record, {
        resource: {
          resourceType: "DocumentReference",
          status: "current",
          content: [
            {
              attachment: {
                contentType: "text/plain",
                url: "https://example.test/discharge.txt",
              },
            },
          ],
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof PersonalDoctorDomainError);
      assert.equal(error.code, "fhir_import_requires_inline_data");
      return true;
    },
  );
});