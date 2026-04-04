import { BlockList, isIP } from "node:net";

const DISALLOWED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.azure.internal",
  "metadata.amazonaws.com",
]);

const REJECTED_TARGET_MESSAGE =
  "External attachment fetch rejects private, local, metadata, or special-use targets.";

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

export interface ResolvedAttachmentAddress {
  address: string;
  family: number;
}

export function normalizeAttachmentHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

export function isExternalAttachmentSpecialUseAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    return SPECIAL_USE_ADDRESSES.check(address, "ipv4");
  }

  if (family === 6) {
    return SPECIAL_USE_ADDRESSES.check(address, "ipv6");
  }

  return false;
}

export function assertExternalAttachmentHostnameAllowed(
  hostname: string,
  allowedHosts: ReadonlySet<string>,
): string {
  const normalizedHostname = normalizeAttachmentHostname(hostname);
  if (!normalizedHostname) {
    throw new Error("External attachment fetch requires a valid hostname.");
  }

  if (
    DISALLOWED_HOSTNAMES.has(normalizedHostname)
    || normalizedHostname.endsWith(".localhost")
    || isExternalAttachmentSpecialUseAddress(normalizedHostname)
  ) {
    throw new Error(REJECTED_TARGET_MESSAGE);
  }

  if (allowedHosts.size > 0 && !allowedHosts.has(normalizedHostname)) {
    throw new Error("External attachment fetch host is not in the configured allowlist.");
  }

  return normalizedHostname;
}

export function assertExternalAttachmentAddressesAllowed(
  resolvedAddresses: readonly ResolvedAttachmentAddress[],
): void {
  if (resolvedAddresses.length === 0) {
    throw new Error("External attachment fetch target did not resolve to any public address.");
  }

  for (const resolvedAddress of resolvedAddresses) {
    if (isExternalAttachmentSpecialUseAddress(resolvedAddress.address)) {
      throw new Error(REJECTED_TARGET_MESSAGE);
    }
  }
}