import { validateAuditEventRecord } from "../core/audit-events";
import type { AuditEventRecord, AuditTrailStore, PaginationOptions } from "../domain/anamnesis";
import { clampPagination } from "../domain/anamnesis/store-contracts";

export class InMemoryAuditTrailStore implements AuditTrailStore {
  private readonly events: AuditEventRecord[] = [];

  async append(event: AuditEventRecord): Promise<void> {
    this.events.push(validateAuditEventRecord(structuredClone(event)));
  }

  async listByCase(caseId: string, options?: PaginationOptions): Promise<AuditEventRecord[]> {
    const { limit, offset } = clampPagination(options);
    return this.events
      .filter((event) => event.caseId === caseId)
      .map((event) => structuredClone(event))
      .slice(offset, offset + limit);
  }

  async listByCorrelationId(correlationId: string): Promise<AuditEventRecord[]> {
    return this.events
      .filter((event) => event.correlationId === correlationId)
      .map((event) => structuredClone(event));
  }

  async countEvents(): Promise<number> {
    return this.events.length;
  }
}