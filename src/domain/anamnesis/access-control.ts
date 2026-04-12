import type { AnamnesisCase, CaseAccessControl, RequestPrincipal } from "./interfaces";

function normalizePrincipalId(principalId: string): string {
  return principalId.trim();
}

export function createOwnerScopedAccessControl(ownerPrincipalId: string): CaseAccessControl {
  const normalizedOwner = normalizePrincipalId(ownerPrincipalId);
  if (normalizedOwner.length === 0) {
    throw new Error("ownerPrincipalId must be a non-empty string.");
  }

  return {
    ownerPrincipalId: normalizedOwner,
    allowedPrincipalIds: [normalizedOwner],
  };
}

export function canPrincipalAccessCase(
  record: Pick<AnamnesisCase, "accessControl">,
  principal?: Pick<RequestPrincipal, "authMechanism" | "actorId">,
): boolean {
  if (!record.accessControl) {
    return true;
  }

  if (!principal) {
    return false;
  }

  if (principal.authMechanism === "api-key") {
    return true;
  }

  if (principal.authMechanism !== "jwt-bearer") {
    return false;
  }

  const actorId = normalizePrincipalId(principal.actorId);
  return record.accessControl.allowedPrincipalIds.includes(actorId);
}

export function filterCasesForPrincipal<T extends Pick<AnamnesisCase, "accessControl">>(
  cases: T[],
  principal?: Pick<RequestPrincipal, "authMechanism" | "actorId">,
): T[] {
  return cases.filter((record) => canPrincipalAccessCase(record, principal));
}