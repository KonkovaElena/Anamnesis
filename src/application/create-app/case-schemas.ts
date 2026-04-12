import { z } from "zod";
import { artifactTypeSchema, sourceDateSchema } from "./shared-schemas";

const workflowFamilySchema = z.enum(["GENERAL_INTAKE", "MRI_SECOND_OPINION", "MRNA_BOARD_REVIEW"]);
const artifactClassSchema = z.enum(["SOURCE", "DERIVED", "REVIEW_PACKET", "HANDOFF_PACKET"]);
const sourceArtifactSemanticTypeSchema = z.enum([
  "clinical-note",
  "lab-panel",
  "clinical-summary",
  "imaging-study",
  "imaging-qc-summary",
  "tumor-dna-fastq",
  "normal-dna-fastq",
  "tumor-rna-fastq",
  "board-evidence-bundle",
]);
const sampleTypeSchema = z.enum(["TUMOR_DNA", "NORMAL_DNA", "TUMOR_RNA", "FOLLOW_UP"]);
const assayTypeSchema = z.enum(["WES", "WGS", "RNA_SEQ", "PANEL", "OTHER"]);
const qcCheckStatusSchema = z.enum(["pass", "warn", "reject"]);
const studyContextSourceSchema = z.enum(["public-api", "internal-ingest"]);

export const createCaseSchema = z.strictObject({
  patientLabel: z.string().trim().min(1).max(120).optional(),
  workflowFamily: workflowFamilySchema.optional(),
  intake: z.strictObject({
    chiefConcern: z.string().trim().min(1).max(200),
    symptomSummary: z.string().trim().min(1).max(4000),
    historySummary: z.string().trim().min(1).max(4000),
    questionsForClinician: z.array(z.string().trim().min(1).max(300)).max(12).default([]),
  }),
});

export const grantCaseAccessSchema = z.strictObject({
  principalId: z.string().trim().min(1).max(200),
});

export const addArtifactSchema = z.strictObject({
  artifactType: artifactTypeSchema,
  artifactClass: artifactClassSchema.optional(),
  semanticType: sourceArtifactSemanticTypeSchema.optional(),
  sampleId: z.string().trim().min(1).max(120).optional(),
  artifactHash: z.string().trim().min(1).max(300).optional(),
  storageUri: z.string().trim().min(1).max(1000).optional(),
  mediaType: z.string().trim().min(1).max(160).optional(),
  derivedFromArtifactIds: z.array(z.string().uuid()).min(1).max(64).optional(),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(4000),
  sourceDate: sourceDateSchema.optional(),
  provenance: z.string().trim().min(1).max(300).optional(),
});

export const registerSampleSchema = z.strictObject({
  sampleId: z.string().trim().min(1).max(120),
  sampleType: sampleTypeSchema,
  assayType: assayTypeSchema,
  accessionId: z.string().trim().min(1).max(120),
  sourceSite: z.string().trim().min(1).max(160),
});

const studySeriesSchema = z.strictObject({
  seriesInstanceUid: z.string().trim().min(1).max(200),
  seriesDescription: z.string().trim().min(1).max(300).optional(),
  modality: z.string().trim().min(1).max(32).optional(),
  sequenceLabel: z.string().trim().min(1).max(120).optional(),
  instanceCount: z.number().int().min(0).optional(),
  volumeDownloadUrl: z.string().trim().url().max(1000).optional(),
});

const studyContextSchema = z.strictObject({
  studyInstanceUid: z.string().trim().min(1).max(200).optional(),
  accessionNumber: z.string().trim().min(1).max(120).optional(),
  studyDate: sourceDateSchema.optional(),
  sourceArchive: z.string().trim().min(1).max(160).optional(),
  dicomWebBaseUrl: z.string().trim().url().max(1000).optional(),
  metadataSummary: z.array(z.string().trim().min(1).max(300)).max(32).optional(),
  series: z.array(studySeriesSchema).max(64).optional(),
});

export const attachStudyContextSchema = z.strictObject({
  source: studyContextSourceSchema,
  studyContext: studyContextSchema.optional(),
});

const qcMetricSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  value: z.number(),
  unit: z.string().trim().min(1).max(32).optional(),
});

const qcCheckSchema = z.strictObject({
  checkId: z.string().trim().min(1).max(120),
  status: qcCheckStatusSchema,
  detail: z.string().trim().min(1).max(500),
});

export const recordQcSummarySchema = z.strictObject({
  disposition: qcCheckStatusSchema,
  issues: z.array(z.string().trim().min(1).max(300)).max(32).optional(),
  qcSummary: z.strictObject({
    summary: z.string().trim().min(1).max(4000).optional(),
    checks: z.array(qcCheckSchema).max(64).optional(),
    metrics: z.array(qcMetricSchema).max(64).optional(),
  }).optional(),
});