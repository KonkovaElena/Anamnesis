import assert from "node:assert/strict";
import test from "node:test";
import {
  addArtifact,
  createCase,
  draftPhysicianPacket,
  type AnamnesisCase,
} from "../src/domain/anamnesis";

interface IngestDocumentInputView {
  artifactType: "note" | "lab" | "summary" | "report" | "imaging-summary";
  title: string;
  contentType: "text/plain" | "text/markdown";
  content: string;
  filename?: string;
  sourceDate?: string;
  provenance?: string;
}

interface IngestionView {
  contentType: string;
  filename?: string;
  normalizedCharacterCount: number;
  excerptCharacterCount: number;
  truncated: boolean;
  normalizationProfile: string;
}

type IngestResultView = {
  nextCase: AnamnesisCase;
  artifact: { summary: string; provenance?: string };
  ingestion: IngestionView;
};

type IngestDocumentFn = (
  record: AnamnesisCase,
  input: IngestDocumentInputView,
  now?: Date,
) => IngestResultView;

async function loadIngestDocument(): Promise<IngestDocumentFn> {
  const moduleNamespace = (await import("../src/domain/anamnesis")) as Record<string, unknown>;
  const ingestDocument = moduleNamespace.ingestDocument;
  assert.equal(typeof ingestDocument, "function", "ingestDocument export missing");
  return ingestDocument as IngestDocumentFn;
}

function seedPacketCase(): AnamnesisCase {
  let record = createCase({
    patientLabel: "document-ingestion-case",
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

test("ingestDocument normalizes bounded text into an artifact and marks packets stale", async () => {
  const ingestDocument = await loadIngestDocument();
  const record = seedPacketCase();

  const result = ingestDocument(record, {
    artifactType: "report",
    title: "ED discharge note",
    contentType: "text/plain",
    filename: "ed-discharge.txt",
    content: "  First line.\r\n\r\n   Second    line   with  gaps.  \r\nThird line.  ",
    sourceDate: "2026-03-30",
  });

  assert.equal(result.artifact.summary, "First line.\n\nSecond line with gaps.\nThird line.");
  assert.equal(result.ingestion.contentType, "text/plain");
  assert.equal(result.ingestion.normalizationProfile, "document.text.plain.v1");
  assert.equal(result.ingestion.truncated, false);
  assert.equal(result.nextCase.artifacts.length, 2);
  assert.equal(result.nextCase.physicianPackets[0]?.isStale, true);
  assert.match(result.artifact.provenance ?? "", /document-ingestion:text\/plain/);
  assert.match(result.artifact.provenance ?? "", /filename:ed-discharge\.txt/);
});

test("ingestDocument truncates oversized normalized content into a bounded excerpt", async () => {
  const ingestDocument = await loadIngestDocument();
  const record = createCase({
    intake: {
      chiefConcern: "Headache",
      symptomSummary: "Severe headache persists.",
      historySummary: "No known trauma.",
      questionsForClinician: [],
    },
  });

  const content = `${"word ".repeat(1200)}tail`;
  const result = ingestDocument(record, {
    artifactType: "note",
    title: "Long note",
    contentType: "text/markdown",
    content,
  });

  assert.equal(result.ingestion.truncated, true);
  assert.equal(result.ingestion.normalizationProfile, "document.text.markdown.v1");
  assert.ok(result.ingestion.normalizedCharacterCount > result.ingestion.excerptCharacterCount);
  assert.ok(result.artifact.summary.length <= 4000);
  assert.equal(result.artifact.summary.endsWith("…"), true);
});