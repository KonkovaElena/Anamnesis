import { IdGenerator } from "./ids";

const MIN_CORRELATION_ID_LENGTH = 5;
const MAX_CORRELATION_ID_LENGTH = 255;
const ALLOWED_CORRELATION_ID = /^[A-Za-z0-9._-]+$/;

export function isValidCorrelationId(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim();
  return normalized.length >= MIN_CORRELATION_ID_LENGTH
    && normalized.length <= MAX_CORRELATION_ID_LENGTH
    && ALLOWED_CORRELATION_ID.test(normalized);
}

export function normalizeCorrelationId(value?: unknown, prefix = "corr"): string {
  if (isValidCorrelationId(value)) {
    return value.trim();
  }

  return IdGenerator.generateWithPrefix(prefix);
}