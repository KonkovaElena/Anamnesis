import type { Express, RequestHandler } from "express";
import { draftPhysicianPacket, finalizePhysicianPacket, submitReview } from "../../domain/anamnesis";
import { createPacketSchema, finalizePacketSchema, submitReviewSchema } from "./schemas";
import {
  appendAuditEvent,
  loadCaseOrRespondNotFound,
  loadPacketOrRespondNotFound,
  readRouteParam,
  type RouteDependencies,
} from "./shared";

export function registerPacketRoutes(
  app: Express,
  { store, auditStore }: RouteDependencies,
  parseJson: RequestHandler,
): void {
  app.post("/api/cases/:caseId/physician-packets", parseJson, async (request, response) => {
    const record = await loadCaseOrRespondNotFound(store, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    const input = createPacketSchema.parse(request.body ?? {});
    const result = draftPhysicianPacket(record, input);
    await store.saveCase(result.nextCase);
    await appendAuditEvent(
      auditStore,
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
    const record = await loadCaseOrRespondNotFound(store, response, readRouteParam(request.params.caseId));
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
    const record = await loadCaseOrRespondNotFound(store, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    const packetId = readRouteParam(request.params.packetId);
    const input = submitReviewSchema.parse(request.body ?? {});
    const result = submitReview(record, packetId, input);
    await store.saveCase(result.nextCase);
    await appendAuditEvent(
      auditStore,
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
    const record = await loadCaseOrRespondNotFound(store, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    const packetId = readRouteParam(request.params.packetId);
    const input = finalizePacketSchema.parse(request.body ?? {});
    const result = finalizePhysicianPacket(record, packetId, input);
    await store.saveCase(result.nextCase);
    await appendAuditEvent(
      auditStore,
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
    const record = await loadCaseOrRespondNotFound(store, response, readRouteParam(request.params.caseId));
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