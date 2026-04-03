import { validateAuditEventRecord } from "../core/audit-events";
import type { AuditEventRecord, AuditTrailStore } from "../domain/anamnesis";

export class InMemoryAuditTrailStore implements AuditTrailStore {
  private readonly events: AuditEventRecord[] = [];

  async append(event: AuditEventRecord): Promise<void> {
    this.events.push(validateAuditEventRecord(structuredClone(event)));
  }

  async listByCase(caseId: string): Promise<AuditEventRecord[]> {
    return this.events
      .filter((event) => event.caseId === caseId)
      .map((event) => structuredClone(event));
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