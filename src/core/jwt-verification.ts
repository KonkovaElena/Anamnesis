import { createHmac, createPublicKey, timingSafeEqual, verify as verifySignature, type KeyObject } from "node:crypto";

export interface JwtPayload {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  nbf?: number;
  roles?: string[];
  [key: string]: unknown;
}

interface JwtVerifyCommonOptions {
  issuer?: string;
  audience?: string;
  clockToleranceSec?: number;
  expectedTyp?: string;
}

export interface JwtRsaJwk extends JsonWebKey {
  alg?: string;
  kid?: string;
  key_ops?: string[];
  kty?: string;
  use?: string;
}

export interface JwtJwkSet {
  keys: JwtRsaJwk[];
}

export interface JwtHmacVerifyOptions extends JwtVerifyCommonOptions {
  secret: string;
  publicKeyPem?: never;
}

export interface JwtRsaVerifyOptions extends JwtVerifyCommonOptions {
  publicKeyPem: string;
  secret?: never;
  jwks?: never;
}

export interface JwtRsaJwksVerifyOptions extends JwtVerifyCommonOptions {
  jwks: JwtJwkSet;
  publicKeyPem?: never;
  secret?: never;
}

export interface JwtRemoteJwksResolver {
  getJwks(options?: { requiredKid?: string }): Promise<JwtJwkSet>;
}

export interface JwtRemoteJwksVerifyOptions extends JwtVerifyCommonOptions {
  jwksResolver: JwtRemoteJwksResolver;
  jwks?: never;
  publicKeyPem?: never;
  secret?: never;
}

export type JwtVerifyOptions = JwtHmacVerifyOptions | JwtRsaVerifyOptions | JwtRsaJwksVerifyOptions;
export type AsyncJwtVerifyOptions = JwtVerifyOptions | JwtRemoteJwksVerifyOptions;

const jwtPublicKeyCache = new Map<string, KeyObject>();
const jwtJwkKeyCache = new Map<string, KeyObject>();

export class JwtVerificationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "JwtVerificationError";
  }
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHmacVerifyOptions(options: JwtVerifyOptions): options is JwtHmacVerifyOptions {
  return typeof (options as JwtHmacVerifyOptions).secret === "string";
}

function isJwksVerifyOptions(options: JwtVerifyOptions): options is JwtRsaJwksVerifyOptions {
  return Array.isArray((options as JwtRsaJwksVerifyOptions).jwks?.keys);
}

function isRemoteJwksVerifyOptions(options: AsyncJwtVerifyOptions): options is JwtRemoteJwksVerifyOptions {
  return typeof (options as JwtRemoteJwksVerifyOptions).jwksResolver?.getJwks === "function";
}

function getSupportedAlgorithms(options: JwtVerifyOptions): string[] {
  return isHmacVerifyOptions(options) ? ["HS256"] : ["RS256"];
}

function normalizeKeyId(kid: unknown): string | undefined {
  return typeof kid === "string" && kid.trim().length > 0 ? kid.trim() : undefined;
}

function getRsaPublicKey(publicKeyPem: string): KeyObject {
  const cached = jwtPublicKeyCache.get(publicKeyPem);
  if (cached) {
    return cached;
  }

  let publicKey: KeyObject;
  try {
    publicKey = createPublicKey(publicKeyPem);
  } catch {
    throw new JwtVerificationError(
      "invalid_verification_key",
      "Configured JWT public key is not a valid PEM-encoded public key.",
    );
  }

  if (publicKey.asymmetricKeyType !== "rsa") {
    throw new JwtVerificationError(
      "invalid_verification_key",
      `Configured JWT public key must be RSA for RS256; got "${publicKey.asymmetricKeyType}".`,
    );
  }

  const modulusLength = publicKey.asymmetricKeyDetails?.modulusLength;
  if (!modulusLength || modulusLength < 2048) {
    throw new JwtVerificationError(
      "weak_verification_key",
      "Configured JWT public key must be RSA 2048 bits or stronger for RS256.",
    );
  }

  jwtPublicKeyCache.set(publicKeyPem, publicKey);
  return publicKey;
}

function assertJwtJwkMetadata(jwk: JwtRsaJwk): void {
  if (jwk.kty !== "RSA") {
    throw new JwtVerificationError(
      "invalid_verification_key",
      "Configured JWT JWKS key must use kty=\"RSA\" for RS256 verification.",
    );
  }

  if (jwk.use !== undefined && jwk.use !== "sig") {
    throw new JwtVerificationError(
      "invalid_verification_key",
      "Configured JWT JWKS key must use use=\"sig\" when the use field is present.",
    );
  }

  if (jwk.alg !== undefined && jwk.alg !== "RS256") {
    throw new JwtVerificationError(
      "invalid_verification_key",
      "Configured JWT JWKS key must use alg=\"RS256\" when the alg field is present.",
    );
  }

  if (jwk.key_ops !== undefined) {
    if (!Array.isArray(jwk.key_ops) || jwk.key_ops.some((operation) => typeof operation !== "string")) {
      throw new JwtVerificationError(
        "invalid_verification_key",
        "Configured JWT JWKS key_ops must be an array of strings.",
      );
    }

    if (!jwk.key_ops.includes("verify")) {
      throw new JwtVerificationError(
        "invalid_verification_key",
        "Configured JWT JWKS key_ops must include \"verify\".",
      );
    }
  }
}

function getJwtJwkCacheKey(jwk: JwtRsaJwk): string {
  const normalizedKid = normalizeKeyId(jwk.kid);
  if (normalizedKid) {
    return `kid:${normalizedKid}:${jwk.n ?? ""}`;
  }

  return `jwk:${JSON.stringify(jwk)}`;
}

function getRsaPublicKeyFromJwk(jwk: JwtRsaJwk): KeyObject {
  assertJwtJwkMetadata(jwk);

  const cacheKey = getJwtJwkCacheKey(jwk);
  const cached = jwtJwkKeyCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let publicKey: KeyObject;
  try {
    publicKey = createPublicKey({ key: jwk, format: "jwk" });
  } catch {
    throw new JwtVerificationError(
      "invalid_verification_key",
      "Configured JWT JWKS key is not a valid RSA public JWK.",
    );
  }

  if (publicKey.asymmetricKeyType !== "rsa") {
    throw new JwtVerificationError(
      "invalid_verification_key",
      `Configured JWT JWKS key must be RSA for RS256; got "${publicKey.asymmetricKeyType}".`,
    );
  }

  const modulusLength = publicKey.asymmetricKeyDetails?.modulusLength;
  if (!modulusLength || modulusLength < 2048) {
    throw new JwtVerificationError(
      "weak_verification_key",
      "Configured JWT JWKS key must be RSA 2048 bits or stronger for RS256.",
    );
  }

  jwtJwkKeyCache.set(cacheKey, publicKey);
  return publicKey;
}

export function assertJwtPublicKeyStrength(publicKeyPem: string): void {
  getRsaPublicKey(publicKeyPem);
}

export function assertJwtJwksStrength(jwks: JwtJwkSet): void {
  if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) {
    throw new JwtVerificationError(
      "invalid_verification_key",
      "Configured JWT_JWKS must contain a non-empty keys array.",
    );
  }

  const seenKids = new Set<string>();
  const requireKids = jwks.keys.length > 1;
  for (const jwk of jwks.keys) {
    const normalizedKid = normalizeKeyId(jwk.kid);
    if (requireKids && !normalizedKid) {
      throw new JwtVerificationError(
        "invalid_verification_key",
        "Configured JWT_JWKS must provide a non-empty kid for every key when multiple keys are configured.",
      );
    }

    if (normalizedKid) {
      if (seenKids.has(normalizedKid)) {
        throw new JwtVerificationError(
          "invalid_verification_key",
          `Configured JWT_JWKS contains duplicate kid "${normalizedKid}".`,
        );
      }
      seenKids.add(normalizedKid);
    }

    getRsaPublicKeyFromJwk(jwk);
  }
}

function selectJwtJwk(jwks: JwtJwkSet, headerKid?: string): JwtRsaJwk {
  const normalizedHeaderKid = normalizeKeyId(headerKid);
  if (normalizedHeaderKid) {
    const matchingKey = jwks.keys.find((candidate) => normalizeKeyId(candidate.kid) === normalizedHeaderKid);
    if (!matchingKey) {
      throw new JwtVerificationError(
        "unknown_key_id",
        `JWT kid "${normalizedHeaderKid}" does not match any configured verification key.`,
      );
    }

    return matchingKey;
  }

  if (jwks.keys.length === 1) {
    return jwks.keys[0]!;
  }

  throw new JwtVerificationError(
    "missing_key_id",
    "JWT header must include kid when multiple verification keys are configured.",
  );
}

function verifyJwtSignature(
  headerAlg: string,
  headerKid: string | undefined,
  signatureInput: string,
  signatureB64: string,
  options: JwtVerifyOptions,
): void {
  if (headerAlg === "HS256") {
    if (!isHmacVerifyOptions(options)) {
      throw new JwtVerificationError(
        "unsupported_algorithm",
        `JWT algorithm "${headerAlg}" is not enabled for this verifier. Supported: ${getSupportedAlgorithms(options).join(", ")}.`,
      );
    }

    const expectedSignature = createHmac("sha256", options.secret).update(signatureInput).digest();
    const actualSignature = base64UrlDecode(signatureB64);

    if (
      expectedSignature.length !== actualSignature.length
      || !timingSafeEqual(expectedSignature, actualSignature)
    ) {
      throw new JwtVerificationError("invalid_signature", "JWT signature verification failed.");
    }

    return;
  }

  if (headerAlg === "RS256") {
    if (isHmacVerifyOptions(options)) {
      throw new JwtVerificationError(
        "unsupported_algorithm",
        `JWT algorithm "${headerAlg}" is not enabled for this verifier. Supported: ${getSupportedAlgorithms(options).join(", ")}.`,
      );
    }

    const publicKey = isJwksVerifyOptions(options)
      ? getRsaPublicKeyFromJwk(selectJwtJwk(options.jwks, headerKid))
      : getRsaPublicKey(options.publicKeyPem);
    const isValid = verifySignature(
      "RSA-SHA256",
      Buffer.from(signatureInput, "utf8"),
      publicKey,
      base64UrlDecode(signatureB64),
    );

    if (!isValid) {
      throw new JwtVerificationError("invalid_signature", "JWT signature verification failed.");
    }

    return;
  }

  throw new JwtVerificationError(
    "unsupported_algorithm",
    `Unsupported JWT algorithm "${headerAlg}". Supported: ${getSupportedAlgorithms(options).join(", ")}.`,
  );
}

export function verifyJwt(token: string, options: JwtVerifyOptions): JwtPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new JwtVerificationError("malformed_token", "JWT must have three parts.");
  }

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  let header: { alg?: string; typ?: string; kid?: string };
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString("utf8"));
  } catch {
    throw new JwtVerificationError("malformed_header", "JWT header is not valid JSON.");
  }

  if (!isNonEmptyString(header.alg)) {
    throw new JwtVerificationError("unsupported_algorithm", "JWT header must declare a supported alg value.");
  }

  if (options.expectedTyp && header.typ !== options.expectedTyp) {
    throw new JwtVerificationError("invalid_type", `Expected JWT type "${options.expectedTyp}"; got "${header.typ}".`);
  }

  const signatureInput = `${headerB64}.${payloadB64}`;
  verifyJwtSignature(header.alg, header.kid, signatureInput, signatureB64, options);

  let payload: JwtPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8"));
  } catch {
    throw new JwtVerificationError("malformed_payload", "JWT payload is not valid JSON.");
  }

  const now = Math.floor(Date.now() / 1000);
  const tolerance = options.clockToleranceSec ?? 30;

  if (payload.exp !== undefined && payload.exp + tolerance < now) {
    throw new JwtVerificationError("token_expired", "JWT has expired.");
  }

  if (payload.nbf !== undefined && payload.nbf - tolerance > now) {
    throw new JwtVerificationError("token_not_yet_valid", "JWT not-before is in the future.");
  }

  if (payload.iat !== undefined && payload.iat - tolerance > now) {
    throw new JwtVerificationError("token_not_yet_valid", "JWT issued-at is in the future.");
  }

  if (!isNonEmptyString(payload.sub)) {
    throw new JwtVerificationError("invalid_subject", "JWT subject must be a non-empty string.");
  }

  if (options.issuer && payload.iss !== options.issuer) {
    throw new JwtVerificationError("invalid_issuer", `Expected issuer "${options.issuer}"; got "${payload.iss}".`);
  }

  if (options.audience) {
    const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
    if (!audiences.includes(options.audience)) {
      throw new JwtVerificationError("invalid_audience", `Expected audience "${options.audience}" not found.`);
    }
  }

  if (
    payload.roles !== undefined
    && (!Array.isArray(payload.roles) || payload.roles.some((role) => typeof role !== "string"))
  ) {
    throw new JwtVerificationError("invalid_roles", "JWT roles claim must be an array of strings.");
  }

  return payload;
}

export async function verifyJwtAsync(token: string, options: AsyncJwtVerifyOptions): Promise<JwtPayload> {
  if (!isRemoteJwksVerifyOptions(options)) {
    return verifyJwt(token, options);
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new JwtVerificationError("malformed_token", "JWT must have three parts.");
  }

  const [headerB64] = parts as [string, string, string];

  let header: { kid?: string };
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString("utf8"));
  } catch {
    throw new JwtVerificationError("malformed_header", "JWT header is not valid JSON.");
  }

  const jwks = await options.jwksResolver.getJwks({ requiredKid: normalizeKeyId(header.kid) });

  return verifyJwt(token, {
    jwks,
    issuer: options.issuer,
    audience: options.audience,
    clockToleranceSec: options.clockToleranceSec,
    expectedTyp: options.expectedTyp,
  });
}
