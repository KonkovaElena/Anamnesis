import type { Request, Response } from "express";
import type {
  AnamnesisCase,
  AnamnesisStore,
  AuditTrailStore,
  CreateAuditEventInput,
  ExternalAttachmentFetcher,
  OperationsSummary,
  PhysicianPacket,
} from "../../domain/anamnesis";
import {
  buildOperationsSummary,
  canPrincipalAccessCase,
  createAuditEvent,
  filterCasesForPrincipal,
} from "../../domain/anamnesis";

export interface RouteDependencies {
  store: AnamnesisStore;
  auditStore: AuditTrailStore;
  externalAttachmentFetcher?: ExternalAttachmentFetcher;
  isShuttingDown?: () => boolean;
}

export function readRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export function respondCaseNotFound(response: Response): void {
  response.status(404).json({
    code: "case_not_found",
    message: "Case not found.",
  });
}

export function respondPacketNotFound(response: Response): void {
  response.status(404).json({
    code: "packet_not_found",
    message: "Physician packet not found.",
  });
}

export async function loadCaseOrRespondNotFound(
  store: AnamnesisStore,
  request: Request,
  response: Response,
  caseId: string,
): Promise<AnamnesisCase | undefined> {
  const record = await store.getCase(caseId);
  if (!record) {
    respondCaseNotFound(response);
    return undefined;
  }

  if (!canPrincipalAccessCase(record, request.principal)) {
    respondCaseNotFound(response);
    return undefined;
  }

  return record;
}

export function loadPacketOrRespondNotFound(
  record: AnamnesisCase,
  response: Response,
  packetId: string,
): PhysicianPacket | undefined {
  const packet = record.physicianPackets.find((candidate) => candidate.packetId === packetId);
  if (!packet) {
    respondPacketNotFound(response);
    return undefined;
  }

  return packet;
}

export function isMalformedJsonError(
  error: unknown,
): error is SyntaxError & { status: 400; type: "entity.parse.failed" } {
  if (!(error instanceof SyntaxError)) {
    return false;
  }

  const candidate = error as SyntaxError & Partial<{ status: number; type: string }>;
  return candidate.status === 400 && candidate.type === "entity.parse.failed";
}

export async function loadOperationsSummary(
  store: AnamnesisStore,
  auditStore: AuditTrailStore,
  principal?: Request["principal"],
): Promise<OperationsSummary> {
  const cases = filterCasesForPrincipal(await store.listCases(), principal);
  const totalAuditEvents = principal?.authMechanism === "jwt-bearer"
    ? (await Promise.all(cases.map(async (record) => (await auditStore.listByCase(record.caseId)).length)))
      .reduce((sum, count) => sum + count, 0)
    : await auditStore.countEvents();
  return buildOperationsSummary(cases, { totalAuditEvents });
}

export function renderMetrics(summary: OperationsSummary): string {
  const lines = [
    "# HELP anamnesis_cases_total Total number of anamnesis cases.",
    "# TYPE anamnesis_cases_total gauge",
    `anamnesis_cases_total ${summary.totalCases}`,
    "# HELP anamnesis_artifacts_total Total number of registered source artifacts.",
    "# TYPE anamnesis_artifacts_total gauge",
    `anamnesis_artifacts_total ${summary.totalArtifacts}`,
    "# HELP anamnesis_packets_total Total number of physician packet drafts.",
    "# TYPE anamnesis_packets_total gauge",
    `anamnesis_packets_total ${summary.totalPackets}`,
    "# HELP anamnesis_reviews_total Total number of clinician review entries.",
    "# TYPE anamnesis_reviews_total gauge",
    `anamnesis_reviews_total ${summary.totalReviews}`,
    "# HELP anamnesis_finalized_packets_total Total number of finalized physician packets.",
    "# TYPE anamnesis_finalized_packets_total gauge",
    `anamnesis_finalized_packets_total ${summary.totalFinalizedPackets}`,
    "# HELP anamnesis_audit_events_total Total number of audit trail events.",
    "# TYPE anamnesis_audit_events_total gauge",
    `anamnesis_audit_events_total ${summary.totalAuditEvents}`,
    "# HELP anamnesis_cases_by_status Total cases by workflow status.",
    "# TYPE anamnesis_cases_by_status gauge",
  ];

  for (const [status, count] of Object.entries(summary.statusCounts)) {
    lines.push(`anamnesis_cases_by_status{status="${status}"} ${count}`);
  }

  return `${lines.join("\n")}\n`;
}

export function readResponseRequestId(response: Response): string | undefined {
  const value = response.getHeader("x-request-id");
  if (typeof value === "string") {
    return value;
  }

  return Array.isArray(value) ? value[0] : undefined;
}

export async function appendAuditEvent(
  auditStore: AuditTrailStore,
  request: Request,
  response: Response,
  input: CreateAuditEventInput,
): Promise<void> {
  await auditStore.append(
    createAuditEvent({
      ...input,
      actorId: input.actorId ?? request.principal?.actorId,
      correlationId: readResponseRequestId(response),
    }),
  );
}