import type {
  AddArtifactInput,
  CreateCaseInput,
  RegisterSampleInput,
  SubmitReviewInput,
} from "../src/domain/anamnesis";

// ---------------------------------------------------------------------------
// Case creation inputs
// ---------------------------------------------------------------------------

export const GENERAL_INTAKE_INPUT: CreateCaseInput = {
  patientLabel: "fixture-general",
  intake: {
    chiefConcern: "Persistent headaches over the past two weeks.",
    symptomSummary: "Daily occipital headaches with nausea; no visual changes.",
    historySummary: "No prior imaging. Over-the-counter analgesics ineffective.",
    questionsForClinician: [
      "Should we order an MRI before the follow-up?",
      "Are referral labs warranted?",
    ],
  },
};

export const MRI_SECOND_OPINION_INPUT: CreateCaseInput = {
  patientLabel: "fixture-mri",
  workflowFamily: "MRI_SECOND_OPINION",
  intake: {
    chiefConcern: "Equivocal finding on prior brain MRI.",
    symptomSummary: "Intermittent dizziness, referred for second neuroimaging opinion.",
    historySummary: "External MRI report noted possible but uncertain enhancement.",
    questionsForClinician: ["Does the enhancement warrant follow-up contrast study?"],
  },
};

export const MRNA_BOARD_REVIEW_INPUT: CreateCaseInput = {
  patientLabel: "fixture-mrna",
  workflowFamily: "MRNA_BOARD_REVIEW",
  intake: {
    chiefConcern: "Treatment planning support after molecular workup.",
    symptomSummary: "Escalation to board review after sequencing results.",
    historySummary: "Prior pathology and sequencing intake completed.",
    questionsForClinician: ["Is the board-ready evidence set complete?"],
  },
};

// ---------------------------------------------------------------------------
// Artifact inputs
// ---------------------------------------------------------------------------

export const NOTE_ARTIFACT_INPUT: AddArtifactInput = {
  artifactType: "note",
  title: "Triage clinician note",
  summary: "Initial triage note documenting chief concern and history.",
};

export const LAB_ARTIFACT_INPUT: AddArtifactInput = {
  artifactType: "lab",
  title: "CBC panel results",
  summary: "Complete blood count within normal limits.",
  sourceDate: "2026-04-01",
};

export const SUMMARY_ARTIFACT_INPUT: AddArtifactInput = {
  artifactType: "summary",
  title: "Imaging QC summary",
  summary: "All sequences passed automated quality checks.",
  artifactClass: "DERIVED",
  semanticType: "imaging-qc-summary",
};

export const IMAGING_ARTIFACT_INPUT: AddArtifactInput = {
  artifactType: "imaging-summary",
  title: "Brain MRI summary",
  summary: "Axial T2 FLAIR demonstrates no acute abnormality.",
  artifactClass: "SOURCE",
  semanticType: "imaging-study",
  sourceDate: "2026-03-28",
};

export const RNA_FASTQ_ARTIFACT_INPUT: AddArtifactInput = {
  artifactType: "summary",
  artifactClass: "SOURCE",
  semanticType: "tumor-rna-fastq",
  title: "Tumor RNA FASTQ",
  summary: "RNA sequencing FASTQ linked to sample-rna-01.",
  sampleId: "sample-rna-01",
};

// ---------------------------------------------------------------------------
// Sample inputs
// ---------------------------------------------------------------------------

export const TUMOR_RNA_SAMPLE_INPUT: RegisterSampleInput = {
  sampleId: "sample-rna-01",
  sampleType: "TUMOR_RNA",
  assayType: "RNA_SEQ",
  accessionId: "ACC-RNA-01",
  sourceSite: "oncology-lab",
};

export const TUMOR_DNA_SAMPLE_INPUT: RegisterSampleInput = {
  sampleId: "sample-dna-01",
  sampleType: "TUMOR_DNA",
  assayType: "WES",
  accessionId: "ACC-DNA-01",
  sourceSite: "genomics-lab",
};

// ---------------------------------------------------------------------------
// Review inputs
// ---------------------------------------------------------------------------

export const APPROVED_REVIEW_INPUT: SubmitReviewInput = {
  reviewerName: "Dr. Fixture Approver",
  action: "approved",
  comments: "Content is accurate and complete.",
};

export const CHANGES_REQUESTED_REVIEW_INPUT: SubmitReviewInput = {
  reviewerName: "Dr. Fixture Reviewer",
  action: "changes_requested",
  comments: "Lab section needs updated reference range.",
};

export const REJECTED_REVIEW_INPUT: SubmitReviewInput = {
  reviewerName: "Dr. Fixture Rejecter",
  action: "rejected",
  comments: "Insufficient evidence for the stated concern.",
};

// ---------------------------------------------------------------------------
// Document ingestion payloads
// ---------------------------------------------------------------------------

export const PLAIN_TEXT_DOCUMENT = {
  artifactType: "note" as const,
  title: "Admission note",
  contentType: "text/plain" as const,
  content: "Patient presented with acute onset headache. No prior imaging available.",
};

export const MARKDOWN_DOCUMENT = {
  artifactType: "summary" as const,
  title: "Clinical summary",
  contentType: "text/markdown" as const,
  content: "# Summary\n\nPatient has a **two-week history** of headaches.\n\n## Plan\n\n- Order MRI brain\n- Follow-up in 7 days",
  filename: "summary.md",
};

// ---------------------------------------------------------------------------
// FHIR resources
// ---------------------------------------------------------------------------

export function fhirBinaryResource(
  content = "SGVsbG8gd29ybGQ=",
  contentType = "text/plain",
): Record<string, unknown> {
  return {
    resourceType: "Binary",
    contentType,
    data: content,
  };
}

export function fhirDocumentReferenceResource(options?: {
  title?: string;
  contentType?: string;
  data?: string;
  url?: string;
  date?: string;
}): Record<string, unknown> {
  const attachment: Record<string, unknown> = {};
  if (options?.contentType) attachment.contentType = options.contentType;
  if (options?.data) attachment.data = options.data;
  if (options?.url) attachment.url = options.url;

  return {
    resourceType: "DocumentReference",
    status: "current",
    date: options?.date ?? "2026-04-01T00:00:00Z",
    description: options?.title ?? "Fixture DocumentReference",
    content: [{ attachment }],
  };
}

export function fhirDocumentBundle(entries?: Record<string, unknown>[]): Record<string, unknown> {
  const defaultEntries = [
    {
      resource: {
        resourceType: "Composition",
        title: "Fixture Document Bundle Composition",
        status: "final",
        date: "2026-04-01T00:00:00Z",
        type: { text: "Progress note" },
      },
    },
    {
      resource: {
        resourceType: "DocumentReference",
        status: "current",
        date: "2026-04-01T00:00:00Z",
        description: "Inline clinical note",
        content: [
          {
            attachment: {
              contentType: "text/plain",
              data: "UHJvZ3Jlc3Mgbm90ZSBjb250ZW50",
            },
          },
        ],
      },
    },
    {
      resource: {
        resourceType: "Binary",
        contentType: "text/plain",
        data: "QmluYXJ5IGRhdGE=",
      },
    },
  ];

  return {
    resourceType: "Bundle",
    type: "document",
    identifier: { value: "fixture-doc-bundle-001" },
    timestamp: "2026-04-01T00:00:00Z",
    entry: entries ?? defaultEntries,
  };
}

export function fhirCollectionBundle(entries?: Record<string, unknown>[]): Record<string, unknown> {
  const defaultEntries = [
    {
      resource: {
        resourceType: "DocumentReference",
        status: "current",
        date: "2026-04-01T00:00:00Z",
        description: "Collection entry 1",
        content: [
          {
            attachment: {
              contentType: "text/plain",
              data: "Q29sbGVjdGlvbiBlbnRyeSBvbmU=",
            },
          },
        ],
      },
    },
  ];

  return {
    resourceType: "Bundle",
    type: "collection",
    entry: entries ?? defaultEntries,
  };
}

// ---------------------------------------------------------------------------
// API request bodies (for HTTP-level tests)
// ---------------------------------------------------------------------------

export const API_CREATE_CASE_BODY = {
  intake: {
    chiefConcern: "Persistent headaches.",
    symptomSummary: "Daily occipital headaches.",
    historySummary: "No prior imaging.",
    questionsForClinician: ["Should we order an MRI?"],
  },
};

export const API_ADD_ARTIFACT_BODY = {
  artifactType: "summary",
  title: "Test artifact",
  summary: "Fixture artifact for API tests.",
};

export const API_INGEST_DOCUMENT_BODY = {
  artifactType: "note",
  title: "API ingestion fixture",
  contentType: "text/plain",
  content: "Plain text content for API-level ingestion testing.",
};

export const API_SUBMIT_REVIEW_BODY = {
  reviewerName: "Dr. API Reviewer",
  action: "approved",
  comments: "Approved via API fixture.",
};
