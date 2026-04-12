import { validateAuditEventRecord, computeChainHash, GENESIS_CHAIN_HASH } from "../core/audit-events";
import type { AuditEventRecord, ChainedAuditEventRecord, AuditTrailStore, PaginationOptions } from "../domain/anamnesis";
import { clampPagination } from "../domain/anamnesis/store-contracts";

export class InMemoryAuditTrailStore implements AuditTrailStore {
  private readonly events: ChainedAuditEventRecord[] = [];
  private lastChainHash: string = GENESIS_CHAIN_HASH;

  async append(event: AuditEventRecord): Promise<void> {
    const validated = validateAuditEventRecord(structuredClone(event));
    const chainHash = computeChainHash(validated, this.lastChainHash);
    this.lastChainHash = chainHash;
    this.events.push({ ...validated, chainHash });
  }

  async listByCase(caseId: string, options?: PaginationOptions): Promise<ChainedAuditEventRecord[]> {
    const { limit, offset } = clampPagination(options);
    return this.events
      .filter((event) => event.caseId === caseId)
      .map((event) => structuredClone(event))
      .slice(offset, offset + limit);
  }

  async listByCorrelationId(correlationId: string): Promise<ChainedAuditEventRecord[]> {
    return this.events
      .filter((event) => event.correlationId === correlationId)
      .map((event) => structuredClone(event));
  }

  async countEvents(): Promise<number> {
    return this.events.length;
  }

  async getLastChainHash(): Promise<string> {
    return this.lastChainHash;
  }
}