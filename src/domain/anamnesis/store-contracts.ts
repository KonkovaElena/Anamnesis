import type { AuditEventRecord } from "../../core/audit-events";
import type { AnamnesisCase } from "./interfaces";

export interface AnamnesisStore {
  listCases(): Promise<AnamnesisCase[]>;
  getCase(caseId: string): Promise<AnamnesisCase | undefined>;
  saveCase(nextCase: AnamnesisCase): Promise<void>;
  deleteCase(caseId: string): Promise<boolean>;
}

export interface AuditTrailStore {
  append(event: AuditEventRecord): Promise<void>;
  listByCase(caseId: string): Promise<AuditEventRecord[]>;
  listByCorrelationId(correlationId: string): Promise<AuditEventRecord[]>;
  countEvents(): Promise<number>;
}
