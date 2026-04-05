import type { AuditContext, RequestPrincipal } from "./contracts";

export const DEFAULT_ANONYMOUS_ACTOR_ID = "system:anonymous";

export function createAnonymousAuditContext(correlationId: string): AuditContext {
  return {
    correlationId,
    actorId: DEFAULT_ANONYMOUS_ACTOR_ID,
    authMechanism: "anonymous",
  };
}

export function anonymousPrincipal(): RequestPrincipal {
  return {
    principalId: DEFAULT_ANONYMOUS_ACTOR_ID,
    actorId: DEFAULT_ANONYMOUS_ACTOR_ID,
    authMechanism: "anonymous",
    roles: [],
  };
}

export function toAuditContext(correlationId: string, principal: RequestPrincipal): AuditContext {
  return {
    correlationId,
    actorId: principal.actorId,
    authMechanism: principal.authMechanism,
  };
}