import type { PersonalDoctorCase, PersonalDoctorStore } from "../domain/personal-doctor";

export class InMemoryPersonalDoctorStore implements PersonalDoctorStore {
  private readonly records = new Map<string, PersonalDoctorCase>();

  async listCases(): Promise<PersonalDoctorCase[]> {
    return [...this.records.values()]
      .map((record) => structuredClone(record))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getCase(caseId: string): Promise<PersonalDoctorCase | undefined> {
    const record = this.records.get(caseId);
    return record ? structuredClone(record) : undefined;
  }

  async saveCase(nextCase: PersonalDoctorCase): Promise<void> {
    this.records.set(nextCase.caseId, structuredClone(nextCase));
  }

  async deleteCase(caseId: string): Promise<boolean> {
    return this.records.delete(caseId);
  }
}
