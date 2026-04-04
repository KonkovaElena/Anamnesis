import {
  AnamnesisDomainError,
  type DocumentContentType,
  type IngestDocumentInput,
} from "./contracts";

const DOCUMENT_EXCERPT_LIMIT = 4000;
const UTF8_TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

export function normalizeDocumentText(content: string): string {
  return content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildDocumentExcerpt(content: string): { excerpt: string; truncated: boolean } {
  if (content.length <= DOCUMENT_EXCERPT_LIMIT) {
    return {
      excerpt: content,
      truncated: false,
    };
  }

  const maxWithoutEllipsis = DOCUMENT_EXCERPT_LIMIT - 1;
  const candidate = content.slice(0, maxWithoutEllipsis).trimEnd();
  const lastBoundary = Math.max(candidate.lastIndexOf("\n"), candidate.lastIndexOf(" "));
  const bounded = lastBoundary > Math.floor(candidate.length * 0.6)
    ? candidate.slice(0, lastBoundary).trimEnd()
    : candidate;

  return {
    excerpt: `${bounded}…`,
    truncated: true,
  };
}

export function buildDocumentProvenance(input: IngestDocumentInput): string {
  const parts: string[] = [];
  if (input.provenance) {
    parts.push(input.provenance);
  }
  parts.push(`document-ingestion:${input.contentType}`);
  if (input.filename) {
    parts.push(`filename:${input.filename}`);
  }
  return parts.join("; ").slice(0, 300);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function parseDocumentContentType(value: string | undefined): DocumentContentType | undefined {
  if (!value) {
    return undefined;
  }

  const baseContentType = value.split(";", 1)[0]?.trim().toLowerCase();
  return baseContentType === "text/plain" || baseContentType === "text/markdown"
    ? baseContentType
    : undefined;
}

export function deriveSourceDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const candidate = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    return undefined;
  }

  const parsed = new Date(`${candidate}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(candidate)
    ? candidate
    : undefined;
}

export function decodeBase64Utf8(value: string): string {
  const normalized = value.replace(/\s+/g, "");
  if (normalized.length === 0 || normalized.length % 4 === 1 || /[^A-Za-z0-9+/=]/.test(normalized)) {
    throw invalidBase64ImportError();
  }

  const decoded = Buffer.from(normalized, "base64");
  const roundTrip = decoded.toString("base64").replace(/=+$/u, "");
  if (roundTrip !== normalized.replace(/=+$/u, "")) {
    throw invalidBase64ImportError();
  }

  try {
    return UTF8_TEXT_DECODER.decode(decoded);
  } catch {
    throw new AnamnesisDomainError(
      "fhir_import_invalid_utf8",
      400,
      "FHIR import only accepts UTF-8 text attachments in this slice.",
    );
  }
}

export function appendFhirProvenance(existing: string | undefined, resourceType: string): string {
  return existing ? `${existing}; fhir-import:${resourceType}` : `fhir-import:${resourceType}`;
}

export function appendProvenance(existing: string | undefined, detail: string): string {
  return existing ? `${existing}; ${detail}` : detail;
}

function invalidBase64ImportError(): AnamnesisDomainError {
  return new AnamnesisDomainError(
    "fhir_import_invalid_base64",
    400,
    "FHIR import requires valid base64-encoded inline text data.",
  );
}