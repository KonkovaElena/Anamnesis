import type { AuditEventRecord } from "../../core/audit-events";
import type { ChainedAuditEventRecord } from "../../core/audit-events";
import type { AnamnesisCase } from "./interfaces";

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export const DEFAULT_PAGE_LIMIT = 100;
export const MAX_PAGE_LIMIT = 1000;

export function clampPagination(options?: PaginationOptions): Required<PaginationOptions> {
  const limit = Math.min(Math.max(options?.limit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT);
  const offset = Math.max(options?.offset ?? 0, 0);
  return { limit, offset };
}

export interface AnamnesisStore {
  listCases(options?: PaginationOptions): Promise<AnamnesisCase[]>;
  getCase(caseId: string): Promise<AnamnesisCase | undefined>;
  saveCase(nextCase: AnamnesisCase): Promise<void>;
  deleteCase(caseId: string): Promise<boolean>;
}

export interface AuditTrailStore {
  append(event: AuditEventRecord): Promise<void>;
  listByCase(caseId: string, options?: PaginationOptions): Promise<ChainedAuditEventRecord[]>;
  listByCorrelationId(correlationId: string): Promise<ChainedAuditEventRecord[]>;
  countEvents(): Promise<number>;
  getLastChainHash(): Promise<string>;
}
