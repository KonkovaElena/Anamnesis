import type { Express, Request, RequestHandler, Response } from "express";
import { draftPhysicianPacket, finalizePhysicianPacket, submitReview } from "../../domain/anamnesis";
import { createPacketSchema, finalizePacketSchema, submitReviewSchema } from "./schemas";
import {
  appendAuditEvent,
  loadCaseOrRespondNotFound,
  loadPacketOrRespondNotFound,
  readRouteParam,
  type RouteDependencies,
} from "./shared";

function respondForbidden(response: Response, message: string): void {
  response.status(403).json({
    code: "forbidden",
    message,
  });
}

function resolveGovernedActor(
  request: Request,
  response: Response,
  options: {
    fieldName: "requestedBy" | "reviewerName" | "finalizedBy";
    submittedActor?: string;
    requiredForNonJwt?: boolean;
    requiredJwtRoles?: string[];
  },
): string | undefined | null {
  const principal = request.principal;

  if (principal?.authMechanism === "jwt-bearer") {
    if (
      options.requiredJwtRoles
      && !options.requiredJwtRoles.some((role) => principal.roles.includes(role))
    ) {
      respondForbidden(
        response,
        `JWT principal lacks required role for ${options.fieldName}.`,
      );
      return null;
    }

    if (options.submittedActor && options.submittedActor !== principal.actorId) {
      response.status(400).json({
        code: "invalid_input",
        message: `${options.fieldName} must match the authenticated JWT subject.`,
      });
      return null;
    }

    return principal.actorId;
  }

  if (options.requiredForNonJwt && !options.submittedActor) {
    response.status(400).json({
      code: "invalid_input",
      message: `${options.fieldName} is required.`,
    });
    return null;
  }

  return options.submittedActor;
}

export function registerPacketRoutes(
  app: Express,
  { store, auditStore }: RouteDependencies,
  parseJson: RequestHandler,
): void {
  app.post("/api/cases/:caseId/physician-packets", parseJson, async (request, response) => {
    const record = await loadCaseOrRespondNotFound(store, request, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    const input = createPacketSchema.parse(request.body ?? {});
    const requestedBy = resolveGovernedActor(request, response, {
      fieldName: "requestedBy",
      submittedActor: input.requestedBy,
      requiredForNonJwt: false,
    });
    if (requestedBy === null) {
      return;
    }

    const result = draftPhysicianPacket(record, {
      ...input,
      requestedBy,
    });
    await store.saveCase(result.nextCase);
    await appendAuditEvent(
      auditStore,
      request,
      response,
      {
        caseId: result.nextCase.caseId,
        packetId: result.packet.packetId,
        eventType: "packet.drafted",
        action: "draft_packet",
        occurredAt: result.packet.createdAt,
        actorId: result.packet.requestedBy,
        details: {
          artifactCount: result.packet.artifactIds.length,
          hasFocus: Boolean(result.packet.focus),
        },
      },
    );
    response.status(201).json({
      case: result.nextCase,
      packet: result.packet,
    });
  });

  app.get("/api/cases/:caseId/physician-packets", async (request, response) => {
    const record = await loadCaseOrRespondNotFound(store, request, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    response.json({
      physicianPackets: record.physicianPackets,
      meta: {
        totalPackets: record.physicianPackets.length,
      },
    });
  });

  app.post("/api/cases/:caseId/physician-packets/:packetId/reviews", parseJson, async (request, response) => {
    const record = await loadCaseOrRespondNotFound(store, request, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    const packetId = readRouteParam(request.params.packetId);
    const input = submitReviewSchema.parse(request.body ?? {});
    const reviewerName = resolveGovernedActor(request, response, {
      fieldName: "reviewerName",
      submittedActor: input.reviewerName,
      requiredForNonJwt: true,
      requiredJwtRoles: ["reviewer", "clinician"],
    });
    if (reviewerName === null) {
      return;
    }
    if (reviewerName === undefined) {
      response.status(400).json({
        code: "invalid_input",
        message: "reviewerName is required.",
      });
      return;
    }

    const result = submitReview(record, packetId, {
      ...input,
      reviewerName,
    });
    await store.saveCase(result.nextCase);
    await appendAuditEvent(
      auditStore,
      request,
      response,
      {
        caseId: result.nextCase.caseId,
        packetId,
        eventType: "review.submitted",
        action: "submit_review",
        occurredAt: result.review.createdAt,
        actorId: result.review.reviewerName,
        details: {
          reviewAction: result.review.action,
          hasComments: Boolean(result.review.comments),
        },
      },
    );
    response.status(201).json({
      review: result.review,
    });
  });

  app.post("/api/cases/:caseId/physician-packets/:packetId/finalize", parseJson, async (request, response) => {
    const record = await loadCaseOrRespondNotFound(store, request, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    const packetId = readRouteParam(request.params.packetId);
    const input = finalizePacketSchema.parse(request.body ?? {});
    const finalizedBy = resolveGovernedActor(request, response, {
      fieldName: "finalizedBy",
      submittedActor: input.finalizedBy,
      requiredForNonJwt: true,
      requiredJwtRoles: ["clinician"],
    });
    if (finalizedBy === null) {
      return;
    }
    if (finalizedBy === undefined) {
      response.status(400).json({
        code: "invalid_input",
        message: "finalizedBy is required.",
      });
      return;
    }

    const result = finalizePhysicianPacket(record, packetId, {
      ...input,
      finalizedBy,
    });
    await store.saveCase(result.nextCase);
    await appendAuditEvent(
      auditStore,
      request,
      response,
      {
        caseId: result.nextCase.caseId,
        packetId,
        eventType: "packet.finalized",
        action: "finalize_packet",
        occurredAt: result.packet.finalizedAt ?? result.nextCase.updatedAt,
        actorId: result.packet.finalizedBy,
        details: {
          hasReason: Boolean(result.packet.finalizationReason),
          fingerprint: result.packet.finalizedFingerprint ?? null,
        },
      },
    );
    response.json({
      case: result.nextCase,
      packet: result.packet,
    });
  });

  app.get("/api/cases/:caseId/physician-packets/:packetId/reviews", async (request, response) => {
    const record = await loadCaseOrRespondNotFound(store, request, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    const packet = loadPacketOrRespondNotFound(record, response, readRouteParam(request.params.packetId));
    if (!packet) {
      return;
    }

    response.json({
      reviews: packet.reviews,
      meta: {
        totalReviews: packet.reviews.length,
        packetStatus: packet.status,
      },
    });
  });
}