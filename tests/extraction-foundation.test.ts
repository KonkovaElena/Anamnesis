import assert from "node:assert/strict";
import test from "node:test";
import {
  addArtifact,
  anonymousPrincipal,
  attachStudyContext,
  buildArtifactEvidenceLineage,
  createAnonymousAuditContext,
  createCase,
  draftPhysicianPacket,
  recordQcSummary,
  registerSample,
  stableClinicalReviewSignature,
  toAuditContext,
} from "../src/domain/anamnesis";

test("mRNA extraction surfaces enrich packet drafts with workflow family and registered samples", () => {
  let record = createCase({
    workflowFamily: "MRNA_BOARD_REVIEW",
    patientLabel: "mrna-case",
    intake: {
      chiefConcern: "Treatment planning support",
      symptomSummary: "Escalation to board review after molecular workup.",
      historySummary: "Prior pathology and sequencing intake completed.",
      questionsForClinician: ["Is board-ready evidence complete?"],
    },
  });

  record = registerSample(record, {
    sampleId: "sample-rna-01",
    sampleType: "TUMOR_RNA",
    assayType: "RNA_SEQ",
    accessionId: "ACC-RNA-01",
    sourceSite: "oncology-lab",
  });

  record = addArtifact(record, {
    artifactType: "summary",
    artifactClass: "SOURCE",
    semanticType: "tumor-rna-fastq",
    sampleId: "sample-rna-01",
    title: "Tumor RNA ingest bundle",
    summary: "FASTQ bundle registered for board review.",
  });

  const drafted = draftPhysicianPacket(record, {
    requestedBy: "molecular-board@example.test",
  });

  const workflowSection = drafted.packet.sections.find((section) => section.label === "Workflow family");
  const samplesSection = drafted.packet.sections.find((section) => section.label === "Registered samples");
  const evidenceSection = drafted.packet.sections.find((section) => section.label === "Registered evidence");

  assert.equal(workflowSection?.content, "mRNA board review");
  assert.match(samplesSection?.content ?? "", /TUMOR_RNA \(RNA_SEQ\) accession ACC-RNA-01/);
  assert.match(evidenceSection?.content ?? "", /SOURCE\/tumor-rna-fastq: Tumor RNA ingest bundle/);
});

test("MRI extraction surfaces add imaging study and QC summaries to packet drafts", () => {
  let record = createCase({
    workflowFamily: "MRI_SECOND_OPINION",
    patientLabel: "mri-case",
    intake: {
      chiefConcern: "MRI second opinion requested",
      symptomSummary: "Outside radiology report flagged uncertain white-matter changes.",
      historySummary: "Neurology requested an additional read before escalation.",
      questionsForClinician: ["Does the study require repeat imaging?"],
    },
  });

  record = addArtifact(record, {
    artifactType: "imaging-summary",
    artifactClass: "SOURCE",
    semanticType: "imaging-study",
    title: "Imported MRI study summary",
    summary: "Axial and sagittal sequences available for second-opinion review.",
  });

  record = attachStudyContext(record, {
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
  });

  record = recordQcSummary(record, {
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
  });

  const drafted = draftPhysicianPacket(record, {
    requestedBy: "radiology-ops@example.test",
  });

  const imagingSection = drafted.packet.sections.find((section) => section.label === "Imaging study context");
  const qcSection = drafted.packet.sections.find((section) => section.label === "Quality control summary");

  assert.match(imagingSection?.content ?? "", /Study UID: 1.2.840.10008.1/);
  assert.match(imagingSection?.content ?? "", /1 series registered/);
  assert.match(qcSection?.content ?? "", /Disposition: warn/);
  assert.match(qcSection?.content ?? "", /Motion artifact in one sequence/);
});

test("derived artifact metadata and lineage graph survive extraction into Anamnesis", () => {
  let record = createCase({
    intake: {
      chiefConcern: "Evidence lineage test",
      symptomSummary: "Checking derived-artifact traceability.",
      historySummary: "Source and derived artifacts should be linked.",
      questionsForClinician: [],
    },
  });

  record = addArtifact(record, {
    artifactType: "lab",
    artifactClass: "SOURCE",
    semanticType: "lab-panel",
    artifactHash: "sha256:source",
    title: "Baseline lab panel",
    summary: "Source evidence for downstream synthesis.",
  });

  const sourceArtifact = record.artifacts[0];
  assert.ok(sourceArtifact, "expected source artifact");

  record = addArtifact(record, {
    artifactType: "report",
    artifactClass: "DERIVED",
    semanticType: "board-evidence-bundle",
    artifactHash: "sha256:derived",
    derivedFromArtifactIds: [sourceArtifact.artifactId],
    title: "Derived evidence bundle",
    summary: "Compiled from the baseline source evidence.",
  });

  const derivedArtifact = record.artifacts[1];
  assert.equal(derivedArtifact?.artifactClass, "DERIVED");
  assert.equal(derivedArtifact?.semanticType, "board-evidence-bundle");
  assert.deepStrictEqual(derivedArtifact?.derivedFromArtifactIds, [sourceArtifact.artifactId]);

  const lineage = buildArtifactEvidenceLineage(record.artifacts);
  assert.equal(lineage.edges.length, 1);
  assert.deepStrictEqual(lineage.roots, [sourceArtifact.artifactId]);
  assert.deepStrictEqual(lineage.terminal, [derivedArtifact!.artifactId]);

  const drafted = draftPhysicianPacket(record, {});
  const lineageSection = drafted.packet.sections.find((section) => section.label === "Evidence lineage");
  assert.match(lineageSection?.content ?? "", /Links: 1/);
  assert.match(lineageSection?.content ?? "", /Baseline lab panel/);
  assert.match(lineageSection?.content ?? "", /Derived evidence bundle/);
});

test("review signatures and audit identity helpers remain deterministic", () => {
  const signatureA = stableClinicalReviewSignature({
    reviewerName: "Dr. Ada",
    action: "approved",
    comments: "Ready for handoff.",
  });
  const signatureB = stableClinicalReviewSignature({
    reviewerName: "Dr. Ada",
    action: "approved",
    comments: "Ready for handoff.",
  });

  assert.equal(signatureA, signatureB);

  const anonymousAuditContext = createAnonymousAuditContext("corr-123");
  const principal = anonymousPrincipal();
  const propagatedAuditContext = toAuditContext("corr-456", principal);

  assert.equal(anonymousAuditContext.actorId, "system:anonymous");
  assert.equal(principal.principalId, "system:anonymous");
  assert.equal(propagatedAuditContext.correlationId, "corr-456");
  assert.equal(propagatedAuditContext.authMechanism, "anonymous");
});

test("recordQcSummary requires study context before MRI QC evidence can be stored", () => {
  const record = createCase({
    workflowFamily: "MRI_SECOND_OPINION",
    intake: {
      chiefConcern: "QC gating",
      symptomSummary: "QC should require an imaging study.",
      historySummary: "No study attached yet.",
      questionsForClinician: [],
    },
  });

  assert.throws(
    () =>
      recordQcSummary(record, {
        disposition: "pass",
      }),
    (error: Error & { code?: string }) => {
      assert.equal(error.code, "study_context_required");
      return true;
    },
  );
});