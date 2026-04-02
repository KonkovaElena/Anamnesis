import type { AnamnesisCase, AnamnesisStore } from "../domain/anamnesis";

export class InMemoryAnamnesisStore implements AnamnesisStore {
  private readonly records = new Map<string, AnamnesisCase>();

  async listCases(): Promise<AnamnesisCase[]> {
    return [...this.records.values()]
      .map((record) => structuredClone(record))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
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
