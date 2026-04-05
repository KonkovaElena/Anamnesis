import type {
  AttachStudyContextInput,
  QcSummaryRecord,
  RecordQcSummaryInput,
  StudyContextRecord,
} from "./contracts";

function normalizeString(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function createStudyContextRecord(input: {
  fallbackStudyUid: string;
  receivedAt: string;
  source: AttachStudyContextInput["source"];
  studyContext?: AttachStudyContextInput["studyContext"];
}): StudyContextRecord {
  const series = (input.studyContext?.series ?? []).map((entry) => ({
    seriesInstanceUid: entry.seriesInstanceUid,
    seriesDescription: normalizeString(entry.seriesDescription),
    modality: normalizeString(entry.modality) ?? "MR",
    sequenceLabel: normalizeString(entry.sequenceLabel),
    instanceCount: typeof entry.instanceCount === "number" ? entry.instanceCount : null,
    volumeDownloadUrl: normalizeString(entry.volumeDownloadUrl),
  }));

  return {
    studyInstanceUid: normalizeString(input.studyContext?.studyInstanceUid) ?? input.fallbackStudyUid,
    dicomStudyInstanceUid: normalizeString(input.studyContext?.studyInstanceUid) ?? input.fallbackStudyUid,
    accessionNumber: normalizeString(input.studyContext?.accessionNumber),
    studyDate: normalizeString(input.studyContext?.studyDate),
    sourceArchive: normalizeString(input.studyContext?.sourceArchive),
    dicomWebBaseUrl: normalizeString(input.studyContext?.dicomWebBaseUrl),
    metadataSummary: (input.studyContext?.metadataSummary ?? []).map((value) => String(value)),
    series,
    receivedAt: input.receivedAt,
    source: input.source,
  };
}

export function createPendingQcSummary(): QcSummaryRecord {
  return {
    disposition: "pending",
    summary: null,
    checkedAt: null,
    source: "pending",
    checks: [],
    metrics: [],
    issues: [],
  };
}

export function createQcSummaryRecord(
  input: RecordQcSummaryInput & { checkedAt: string },
): QcSummaryRecord {
  return {
    disposition: input.disposition,
    summary: normalizeString(input.qcSummary?.summary),
    checkedAt: input.checkedAt,
    source: "internal-inference",
    checks: (input.qcSummary?.checks ?? []).map((entry) => ({
      checkId: entry.checkId,
      status: entry.status,
      detail: entry.detail,
    })),
    metrics: (input.qcSummary?.metrics ?? []).map((entry) => ({
      name: entry.name,
      value: entry.value,
      unit: normalizeString(entry.unit),
    })),
    issues: (input.issues ?? []).map((value) => String(value)),
  };
}