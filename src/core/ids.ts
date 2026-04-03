import { randomUUID } from "node:crypto";

export class IdGenerator {
  static generate(): string {
    return randomUUID();
  }

  static generateWithPrefix(prefix: string): string {
    const id = IdGenerator.generate();
    return prefix ? `${prefix}_${id}` : id;
  }
}