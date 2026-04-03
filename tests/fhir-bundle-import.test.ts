import assert from "node:assert/strict";
import test from "node:test";
import {
  AnamnesisDomainError,
  addArtifact,
  createCase,
  draftPhysicianPacket,
  type AnamnesisCase,
} from "../src/domain/anamnesis";

interface FhirBundleImportInputView {
  artifactType?: "note" | "lab" | "summary" | "report" | "imaging-summary";
  sourceDate?: string;
  provenance?: string;
  allowExternalAttachmentFetch?: boolean;
  resource: Record<string, unknown>;
}

interface BundleImportView {
  resourceType: string;
  bundleType: string;
  artifactCount: number;
  transportContentType: string;
  usedExternalAttachmentFetch: boolean;
  bundleProfile: string;
  entryProfiles: string[];
}

interface IngestionView {
  contentType: string;
  normalizedCharacterCount: number;
  excerptCharacterCount: number;
  truncated: boolean;
  normalizationProfile: string;
}

interface ExternalAttachmentView {
  contentType: string;
  content: string;
}

type ExternalAttachmentFetcherView = (url: string) => Promise<ExternalAttachmentView>;

type FhirBundleImportResultView = {
  nextCase: AnamnesisCase;
  artifacts: Array<{ title: string; summary: string; provenance?: string; sourceDate?: string }>;
  ingestions: IngestionView[];
  bundleImport: BundleImportView;
};

type IngestFhirBundleFn = (
  record: AnamnesisCase,
  input: FhirBundleImportInputView,
  dependencies?: { externalAttachmentFetcher?: ExternalAttachmentFetcherView },
  now?: Date,
) => Promise<FhirBundleImportResultView>;

async function loadIngestFhirBundle(): Promise<IngestFhirBundleFn> {
  const moduleNamespace = (await import("../src/domain/anamnesis")) as Record<string, unknown>;
  const ingestFhirBundle = moduleNamespace.ingestFhirBundle;
  assert.equal(typeof ingestFhirBundle, "function", "ingestFhirBundle export missing");
  return ingestFhirBundle as IngestFhirBundleFn;
}

function seedPacketCase(): AnamnesisCase {
  let record = createCase({
    patientLabel: "fhir-bundle-case",
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

test("ingestFhirBundle imports supported document bundle entries into bounded artifacts and marks packets stale", async () => {
  const ingestFhirBundle = await loadIngestFhirBundle();
  const record = seedPacketCase();

  const result = await ingestFhirBundle(record, {
    artifactType: "report",
    resource: {
      resourceType: "Bundle",
      type: "document",
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
        },
        {
          resource: {
            resourceType: "Binary",
            contentType: "text/markdown; charset=UTF-8",
            data: Buffer.from("# Visit Note\n\nSymptoms remain stable.", "utf8").toString("base64"),
          },
        },
      ],
    },
  });

  assert.equal(result.artifacts.length, 2);
  assert.deepStrictEqual(
    result.artifacts.map((artifact) => artifact.title),
    ["ED discharge note", "FHIR Binary import"],
  );
  assert.equal(result.artifacts[0]?.summary, "First line.\n\nSecond line here.");
  assert.equal(result.artifacts[1]?.summary, "# Visit Note\n\nSymptoms remain stable.");
  assert.equal(result.ingestions.length, 2);
  assert.deepStrictEqual(result.ingestions.map((ingestion) => ingestion.normalizationProfile), [
    "document.text.plain.v1",
    "document.text.markdown.v1",
  ]);
  assert.equal(result.bundleImport.resourceType, "Bundle");
  assert.equal(result.bundleImport.bundleType, "document");
  assert.equal(result.bundleImport.bundleProfile, "fhir.bundle.document.v1");
  assert.equal(result.bundleImport.artifactCount, 2);
  assert.deepStrictEqual(result.bundleImport.entryProfiles, [
    "fhir.document-reference.inline.text.v1",
    "fhir.binary.inline.text.v1",
  ]);
  assert.equal(result.bundleImport.transportContentType, "application/fhir+json");
  assert.equal(result.bundleImport.usedExternalAttachmentFetch, false);
  assert.equal(result.nextCase.physicianPackets[0]?.isStale, true);
  assert.equal(result.nextCase.artifacts.length, 3);
});

test("ingestFhirBundle rejects unsupported bundle types", async () => {
  const ingestFhirBundle = await loadIngestFhirBundle();
  const record = createCase({
    intake: {
      chiefConcern: "Fatigue",
      symptomSummary: "Persistent fatigue for one week.",
      historySummary: "No recent illness.",
      questionsForClinician: [],
    },
  });

  await assert.rejects(
    () =>
      ingestFhirBundle(record, {
        resource: {
          resourceType: "Bundle",
          type: "transaction",
          entry: [],
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof AnamnesisDomainError);
      assert.equal(error.code, "fhir_import_bundle_type_unsupported");
      return true;
    },
  );
});

test("ingestFhirBundle rejects url-only DocumentReference entries when external fetch is not enabled", async () => {
  const ingestFhirBundle = await loadIngestFhirBundle();
  const record = createCase({
    intake: {
      chiefConcern: "Fatigue",
      symptomSummary: "Persistent fatigue for one week.",
      historySummary: "No recent illness.",
      questionsForClinician: [],
    },
  });

  await assert.rejects(
    () =>
      ingestFhirBundle(record, {
        resource: {
          resourceType: "Bundle",
          type: "collection",
          entry: [
            {
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
            },
          ],
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof AnamnesisDomainError);
      assert.equal(error.code, "fhir_import_requires_inline_data");
      return true;
    },
  );
});

test("ingestFhirBundle dereferences url-only attachments when external fetch is explicitly enabled", async () => {
  const ingestFhirBundle = await loadIngestFhirBundle();
  const record = createCase({
    intake: {
      chiefConcern: "Fatigue",
      symptomSummary: "Persistent fatigue for one week.",
      historySummary: "No recent illness.",
      questionsForClinician: [],
    },
  });

  const fetchedUrls: string[] = [];
  const externalAttachmentFetcher: ExternalAttachmentFetcherView = async (url) => {
    fetchedUrls.push(url);
    return {
      contentType: "text/plain; charset=UTF-8",
      content: "Fetched document text from remote source.",
    };
  };

  const result = await ingestFhirBundle(
    record,
    {
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
    { externalAttachmentFetcher },
  );

  assert.deepStrictEqual(fetchedUrls, ["https://example.test/discharge.txt"]);
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0]?.title, "Remote discharge note");
  assert.equal(result.artifacts[0]?.summary, "Fetched document text from remote source.");
  assert.equal(result.bundleImport.usedExternalAttachmentFetch, true);
  assert.equal(result.bundleImport.bundleProfile, "fhir.bundle.collection.v1");
  assert.deepStrictEqual(result.bundleImport.entryProfiles, [
    "fhir.document-reference.external.text.v1",
  ]);
});