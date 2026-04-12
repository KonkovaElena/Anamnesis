import type { Request, Response } from "express";
import {
  DISABLED_REMOTE_JWT_JWKS_OBSERVABILITY,
  type JwtRemoteJwksObservabilityReader,
  type RemoteJwtJwksObservabilitySnapshot,
} from "../../core/jwt-verification";
import type {
  AnamnesisCase,
  AnamnesisStore,
  AuditTrailStore,
  CreateAuditEventInput,
  ExternalAttachmentFetcher,
  LlmSidecar,
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
  llmSidecar?: LlmSidecar;
  isShuttingDown?: () => boolean;
  remoteJwtJwksTelemetry?: JwtRemoteJwksObservabilityReader;
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

function toMetricTimestamp(value: string | null): number {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp / 1_000 : 0;
}

export function readRemoteJwtJwksObservability(
  telemetry?: JwtRemoteJwksObservabilityReader,
): RemoteJwtJwksObservabilitySnapshot {
  return telemetry?.getObservabilitySnapshot() ?? DISABLED_REMOTE_JWT_JWKS_OBSERVABILITY;
}

export function renderMetrics(
  summary: OperationsSummary,
  remoteJwks = DISABLED_REMOTE_JWT_JWKS_OBSERVABILITY,
): string {
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
    "# HELP anamnesis_remote_jwks_enabled Whether issuer-bound remote JWKS verification is enabled.",
    "# TYPE anamnesis_remote_jwks_enabled gauge",
    `anamnesis_remote_jwks_enabled ${remoteJwks.enabled ? 1 : 0}`,
    "# HELP anamnesis_remote_jwks_fetches_total Total remote JWKS fetch or revalidation attempts.",
    "# TYPE anamnesis_remote_jwks_fetches_total gauge",
    `anamnesis_remote_jwks_fetches_total ${remoteJwks.totalFetches}`,
    "# HELP anamnesis_remote_jwks_cache_hits_total Total remote JWKS cache hits that avoided a network fetch.",
    "# TYPE anamnesis_remote_jwks_cache_hits_total gauge",
    `anamnesis_remote_jwks_cache_hits_total ${remoteJwks.totalCacheHits}`,
    "# HELP anamnesis_remote_jwks_kid_miss_refreshes_total Total forced remote JWKS refreshes triggered by an unseen kid.",
    "# TYPE anamnesis_remote_jwks_kid_miss_refreshes_total gauge",
    `anamnesis_remote_jwks_kid_miss_refreshes_total ${remoteJwks.totalKidMissRefreshes}`,
    "# HELP anamnesis_remote_jwks_fetch_failures_total Total remote JWKS fetch or revalidation failures.",
    "# TYPE anamnesis_remote_jwks_fetch_failures_total gauge",
    `anamnesis_remote_jwks_fetch_failures_total ${remoteJwks.totalFetchFailures}`,
    "# HELP anamnesis_remote_jwks_cached_keys Current number of cached remote JWKS verifier keys.",
    "# TYPE anamnesis_remote_jwks_cached_keys gauge",
    `anamnesis_remote_jwks_cached_keys ${remoteJwks.cachedKeyCount}`,
    "# HELP anamnesis_remote_jwks_last_success_timestamp_seconds Unix timestamp of the last successful remote JWKS fetch or revalidation.",
    "# TYPE anamnesis_remote_jwks_last_success_timestamp_seconds gauge",
    `anamnesis_remote_jwks_last_success_timestamp_seconds ${toMetricTimestamp(remoteJwks.lastSuccessfulFetchAt)}`,
    "# HELP anamnesis_remote_jwks_last_failure_timestamp_seconds Unix timestamp of the last failed remote JWKS fetch or revalidation.",
    "# TYPE anamnesis_remote_jwks_last_failure_timestamp_seconds gauge",
    `anamnesis_remote_jwks_last_failure_timestamp_seconds ${toMetricTimestamp(remoteJwks.lastFailedFetchAt)}`,
    "# HELP anamnesis_remote_jwks_cache_fresh_until_timestamp_seconds Unix timestamp until which the cached remote JWKS is considered fresh.",
    "# TYPE anamnesis_remote_jwks_cache_fresh_until_timestamp_seconds gauge",
    `anamnesis_remote_jwks_cache_fresh_until_timestamp_seconds ${toMetricTimestamp(remoteJwks.cacheFreshUntilAt)}`,
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