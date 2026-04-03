import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { TextDecoder } from "node:util";
import type { ExternalAttachmentFetchResult } from "../domain/anamnesis";

const TEXT_CONTENT_TYPES = new Set(["text/plain", "text/markdown"]);
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BYTES = 256 * 1024;
const UTF8_TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });
const DISALLOWED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.azure.internal",
  "metadata.amazonaws.com",
]);

type LookupResult = { address: string; family: number };
type LookupImplementation = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<LookupResult[]>;

const SPECIAL_USE_ADDRESSES = new BlockList();
SPECIAL_USE_ADDRESSES.addSubnet("0.0.0.0", 8, "ipv4");
SPECIAL_USE_ADDRESSES.addSubnet("10.0.0.0", 8, "ipv4");
SPECIAL_USE_ADDRESSES.addSubnet("100.64.0.0", 10, "ipv4");
SPECIAL_USE_ADDRESSES.addSubnet("127.0.0.0", 8, "ipv4");
SPECIAL_USE_ADDRESSES.addSubnet("169.254.0.0", 16, "ipv4");
SPECIAL_USE_ADDRESSES.addSubnet("172.16.0.0", 12, "ipv4");
SPECIAL_USE_ADDRESSES.addSubnet("192.0.0.0", 24, "ipv4");
SPECIAL_USE_ADDRESSES.addSubnet("192.168.0.0", 16, "ipv4");
SPECIAL_USE_ADDRESSES.addSubnet("224.0.0.0", 4, "ipv4");
SPECIAL_USE_ADDRESSES.addSubnet("240.0.0.0", 4, "ipv4");
SPECIAL_USE_ADDRESSES.addAddress("169.254.169.254", "ipv4");
SPECIAL_USE_ADDRESSES.addAddress("::", "ipv6");
SPECIAL_USE_ADDRESSES.addAddress("::1", "ipv6");
SPECIAL_USE_ADDRESSES.addSubnet("fc00::", 7, "ipv6");
SPECIAL_USE_ADDRESSES.addSubnet("fe80::", 10, "ipv6");
SPECIAL_USE_ADDRESSES.addSubnet("ff00::", 8, "ipv6");

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function isSpecialUseAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    return SPECIAL_USE_ADDRESSES.check(address, "ipv4");
  }

  if (family === 6) {
    return SPECIAL_USE_ADDRESSES.check(address, "ipv6");
  }

  return false;
}

async function defaultLookupImplementation(
  hostname: string,
  options: { all: true; verbatim: true },
): Promise<LookupResult[]> {
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
    this.allowedHosts = new Set((options.allowedHosts ?? []).map((host) => normalizeHostname(host)));
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
    const normalizedHostname = normalizeHostname(parsedUrl.hostname);
    if (!normalizedHostname) {
      throw new Error("External attachment fetch requires a valid hostname.");
    }

    if (
      DISALLOWED_HOSTNAMES.has(normalizedHostname)
      || normalizedHostname.endsWith(".localhost")
    ) {
      throw new Error("External attachment fetch rejects private, local, metadata, or special-use targets.");
    }

    if (this.allowedHosts.size > 0 && !this.allowedHosts.has(normalizedHostname)) {
      throw new Error("External attachment fetch host is not in the configured allowlist.");
    }

    if (isSpecialUseAddress(normalizedHostname)) {
      throw new Error("External attachment fetch rejects private, local, metadata, or special-use targets.");
    }

    const resolvedAddresses = await this.lookupImplementation(normalizedHostname, {
      all: true,
      verbatim: true,
    });

    if (resolvedAddresses.length === 0) {
      throw new Error("External attachment fetch target did not resolve to any public address.");
    }

    for (const resolvedAddress of resolvedAddresses) {
      if (isSpecialUseAddress(resolvedAddress.address)) {
        throw new Error("External attachment fetch rejects private, local, metadata, or special-use targets.");
      }
    }
  }
}