import type { AnamnesisCase, AnamnesisStore, PaginationOptions } from "../domain/anamnesis";
import { clampPagination } from "../domain/anamnesis/store-contracts";

export class InMemoryAnamnesisStore implements AnamnesisStore {
  private readonly records = new Map<string, AnamnesisCase>();

  async listCases(options?: PaginationOptions): Promise<AnamnesisCase[]> {
    const { limit, offset } = clampPagination(options);
    return [...this.records.values()]
      .map((record) => structuredClone(record))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(offset, offset + limit);
  }

  async getCase(caseId: string): Promise<AnamnesisCase | undefined> {
    const record = this.records.get(caseId);
    return record ? structuredClone(record) : undefined;
  }

  async saveCase(nextCase: AnamnesisCase): Promise<void> {
    this.records.set(nextCase.caseId, structuredClone(nextCase));
  }

  async deleteCase(caseId: string): Promise<boolean> {
    return this.records.delete(caseId);
  }
}
