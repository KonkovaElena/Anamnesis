import { TextDecoder } from "node:util";
import { JwtVerificationError, assertJwtJwksStrength, type JwtJwkSet } from "../core/jwt-verification";

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_FRESH_TTL_MS = 60_000;
const UTF8_TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });
const ACCEPT_HEADER = "application/jwk-set+json, application/json";

interface CachedRemoteJwks {
  jwks: JwtJwkSet;
  freshUntilMs: number;
  etag?: string;
  lastModified?: string;
}

interface CacheDecision {
  store: boolean;
  freshUntilMs: number;
}

export interface RemoteJwtJwksProviderOptions {
  issuer: string;
  jwksUrl: string;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  now?: () => number;
}

export function assertRemoteJwtJwksConfiguration(issuer: string | undefined, jwksUrl: string | undefined): void {
  const normalizedJwksUrl = jwksUrl?.trim();
  if (!normalizedJwksUrl) {
    return;
  }

  const issuerUrl = parseHttpsUrl("JWT_ISSUER", issuer?.trim());
  const remoteJwksUrl = parseHttpsUrl("JWT_JWKS_URL", normalizedJwksUrl);

  if (issuerUrl.origin !== remoteJwksUrl.origin) {
    throw new JwtVerificationError(
      "invalid_verification_key",
      "JWT_JWKS_URL must share the same origin as JWT_ISSUER for issuer-bound JWKS retrieval.",
    );
  }
}

function parseHttpsUrl(name: string, value: string | undefined): URL {
  if (!value) {
    throw new JwtVerificationError(
      "invalid_verification_key",
      `${name} must be configured as an absolute https URL when remote JWKS mode is enabled.`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new JwtVerificationError(
      "invalid_verification_key",
      `${name} must be configured as an absolute https URL when remote JWKS mode is enabled.`,
    );
  }

  if (parsed.protocol !== "https:") {
    throw new JwtVerificationError(
      "invalid_verification_key",
      `${name} must use https in remote JWKS mode.`,
    );
  }

  if (parsed.username || parsed.password) {
    throw new JwtVerificationError(
      "invalid_verification_key",
      `${name} must not include embedded URL credentials.`,
    );
  }

  return parsed;
}

function normalizeKeyId(kid: string | undefined): string | undefined {
  return typeof kid === "string" && kid.trim().length > 0 ? kid.trim() : undefined;
}

function hasRequiredKid(jwks: JwtJwkSet, requiredKid: string | undefined): boolean {
  const normalizedKid = normalizeKeyId(requiredKid);
  if (!normalizedKid) {
    return true;
  }

  return jwks.keys.some((candidate) => normalizeKeyId(candidate.kid) === normalizedKid);
}

function parseCacheDecision(headers: Headers, nowMs: number): CacheDecision {
  const cacheControl = headers.get("cache-control") ?? "";
  const directives = cacheControl
    .split(",")
    .map((directive) => directive.trim().toLowerCase())
    .filter((directive) => directive.length > 0);

  if (directives.includes("no-store")) {
    return {
      store: false,
      freshUntilMs: nowMs,
    };
  }

  const maxAgeDirective = directives.find((directive) => directive.startsWith("max-age="));
  if (maxAgeDirective) {
    const maxAgeSec = Number.parseInt(maxAgeDirective.slice("max-age=".length), 10);
    if (Number.isFinite(maxAgeSec) && maxAgeSec >= 0) {
      return {
        store: true,
        freshUntilMs: nowMs + (maxAgeSec * 1_000),
      };
    }
  }

  const expiresHeader = headers.get("expires");
  if (expiresHeader) {
    const expiresAt = Date.parse(expiresHeader);
    if (Number.isFinite(expiresAt)) {
      return {
        store: true,
        freshUntilMs: Math.max(nowMs, expiresAt),
      };
    }
  }

  if (directives.includes("no-cache")) {
    return {
      store: true,
      freshUntilMs: nowMs,
    };
  }

  return {
    store: true,
    freshUntilMs: nowMs + DEFAULT_FRESH_TTL_MS,
  };
}

export class RemoteJwtJwksProvider {
  private readonly jwksUrl: URL;

  private readonly fetchImplementation: typeof fetch;

  private readonly timeoutMs: number;

  private readonly maxBytes: number;

  private readonly now: () => number;

  private cache: CachedRemoteJwks | undefined;

  constructor(options: RemoteJwtJwksProviderOptions) {
    assertRemoteJwtJwksConfiguration(options.issuer, options.jwksUrl);
    this.jwksUrl = new URL(options.jwksUrl);
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.now = options.now ?? Date.now;
  }

  async getJwks(options?: { requiredKid?: string }): Promise<JwtJwkSet> {
    const requiredKid = normalizeKeyId(options?.requiredKid);
    if (
      this.cache
      && this.cache.freshUntilMs > this.now()
      && hasRequiredKid(this.cache.jwks, requiredKid)
    ) {
      return this.cache.jwks;
    }

    return this.fetchRemoteJwks(requiredKid);
  }

  private async fetchRemoteJwks(requiredKid: string | undefined): Promise<JwtJwkSet> {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), this.timeoutMs);
    const headers = new Headers({ accept: ACCEPT_HEADER });

    if (this.cache?.etag) {
      headers.set("if-none-match", this.cache.etag);
    }

    if (this.cache?.lastModified) {
      headers.set("if-modified-since", this.cache.lastModified);
    }

    try {
      const response = await this.fetchImplementation(this.jwksUrl.toString(), {
        method: "GET",
        redirect: "error",
        signal: abortController.signal,
        headers,
      });

      if (response.status === 304) {
        if (!this.cache) {
          throw new JwtVerificationError(
            "jwks_fetch_failed",
            "Remote JWKS revalidation returned 304 without a cached key set.",
          );
        }

        const cacheDecision = parseCacheDecision(response.headers, this.now());
        const cachedJwks = this.cache.jwks;
        this.cache = cacheDecision.store
          ? {
              ...this.cache,
              freshUntilMs: cacheDecision.freshUntilMs,
              etag: response.headers.get("etag") ?? this.cache.etag,
              lastModified: response.headers.get("last-modified") ?? this.cache.lastModified,
            }
          : undefined;
        return this.cache?.jwks ?? cachedJwks;
      }

      if (!response.ok) {
        throw new JwtVerificationError(
          "jwks_fetch_failed",
          `Remote JWKS fetch failed with status ${response.status}.`,
        );
      }

      const baseContentType = (response.headers.get("content-type") ?? "")
        .split(";", 1)[0]
        ?.trim()
        .toLowerCase();

      if (baseContentType !== "application/jwk-set+json" && baseContentType !== "application/json") {
        throw new JwtVerificationError(
          "jwks_fetch_failed",
          "Remote JWKS response content type must be application/jwk-set+json or application/json.",
        );
      }

      const body = await this.readBoundedResponse(response);

      let jwks: JwtJwkSet;
      try {
        jwks = JSON.parse(UTF8_TEXT_DECODER.decode(body)) as JwtJwkSet;
      } catch {
        throw new JwtVerificationError("jwks_fetch_failed", "Remote JWKS response body is not valid JSON.");
      }

      assertJwtJwksStrength(jwks);

      const cacheDecision = parseCacheDecision(response.headers, this.now());
      if (cacheDecision.store) {
        this.cache = {
          jwks,
          freshUntilMs: cacheDecision.freshUntilMs,
          etag: response.headers.get("etag") ?? undefined,
          lastModified: response.headers.get("last-modified") ?? undefined,
        };
      } else {
        this.cache = undefined;
      }

      if (!hasRequiredKid(jwks, requiredKid)) {
        throw new JwtVerificationError(
          "unknown_key_id",
          `JWT kid "${requiredKid}" does not match any remotely retrieved verification key.`,
        );
      }

      return jwks;
    } catch (error: unknown) {
      if (error instanceof JwtVerificationError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new JwtVerificationError(
          "jwks_fetch_failed",
          `Remote JWKS fetch timed out after ${this.timeoutMs}ms.`,
        );
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new JwtVerificationError("jwks_fetch_failed", `Remote JWKS fetch failed: ${message}`);
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
        throw new JwtVerificationError(
          "jwks_fetch_failed",
          `Remote JWKS response exceeded the ${this.maxBytes} byte limit.`,
        );
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
}