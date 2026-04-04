import { lookup } from "node:dns/promises";
import { TextDecoder } from "node:util";
import type { ExternalAttachmentFetchResult } from "../domain/anamnesis";
import {
  assertExternalAttachmentAddressesAllowed,
  assertExternalAttachmentHostnameAllowed,
  type ResolvedAttachmentAddress,
  normalizeAttachmentHostname,
} from "./external-attachment-target-validators";

const TEXT_CONTENT_TYPES = new Set(["text/plain", "text/markdown"]);
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BYTES = 256 * 1024;
const UTF8_TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

type LookupImplementation = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<ResolvedAttachmentAddress[]>;

async function defaultLookupImplementation(
  hostname: string,
  options: { all: true; verbatim: true },
): Promise<ResolvedAttachmentAddress[]> {
  return lookup(hostname, options);
}

export interface HttpExternalAttachmentFetcherOptions {
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  lookupImplementation?: LookupImplementation;
  allowedHosts?: readonly string[];
}

export class HttpExternalAttachmentFetcher {
  private readonly fetchImplementation: typeof fetch;

  private readonly timeoutMs: number;

  private readonly maxBytes: number;

  private readonly lookupImplementation: LookupImplementation;

  private readonly allowedHosts: Set<string>;

  constructor(options: HttpExternalAttachmentFetcherOptions = {}) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.lookupImplementation = options.lookupImplementation ?? defaultLookupImplementation;
    this.allowedHosts = new Set((options.allowedHosts ?? []).map((host) => normalizeAttachmentHostname(host)));
  }

  async fetchAttachment(url: string): Promise<ExternalAttachmentFetchResult> {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:") {
      throw new Error("External attachment fetch requires an absolute https URL.");
    }

    if (parsedUrl.username || parsedUrl.password) {
      throw new Error("External attachment fetch does not allow embedded URL credentials.");
    }

    await this.assertAllowedTarget(parsedUrl);

    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImplementation(parsedUrl.toString(), {
        redirect: "error",
        signal: abortController.signal,
        headers: {
          accept: "text/plain, text/markdown",
        },
      });

      if (!response.ok) {
        throw new Error(`External attachment fetch failed with status ${response.status}.`);
      }

      const baseContentType = (response.headers.get("content-type") ?? "")
        .split(";", 1)[0]
        ?.trim()
        .toLowerCase();

      if (!baseContentType || !TEXT_CONTENT_TYPES.has(baseContentType)) {
        throw new Error("External attachment response content type must be text/plain or text/markdown.");
      }

      const bytes = await this.readBoundedResponse(response);
      return {
        contentType: baseContentType,
        content: UTF8_TEXT_DECODER.decode(bytes),
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`External attachment fetch timed out after ${this.timeoutMs}ms.`, { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private async readBoundedResponse(response: Response): Promise<Uint8Array> {
    if (!response.body) {
      return new Uint8Array();
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > this.maxBytes) {
        await reader.cancel();
        throw new Error(`External attachment response exceeded the ${this.maxBytes} byte limit.`);
      }

      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return bytes;
  }

  private async assertAllowedTarget(parsedUrl: URL): Promise<void> {
    const normalizedHostname = assertExternalAttachmentHostnameAllowed(parsedUrl.hostname, this.allowedHosts);

    const resolvedAddresses = await this.lookupImplementation(normalizedHostname, {
      all: true,
      verbatim: true,
    });
    assertExternalAttachmentAddressesAllowed(resolvedAddresses);
  }
}