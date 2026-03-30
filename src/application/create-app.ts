import { randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError, z } from "zod";
import {
  PersonalDoctorDomainError,
  type PersonalDoctorCase,
  type PersonalDoctorStore,
  addArtifact,
  buildOperationsSummary,
  createCase,
  draftPhysicianPacket,
} from "../domain/personal-doctor";

const createCaseSchema = z.object({
  patientLabel: z.string().trim().min(1).max(120).optional(),
  intake: z.object({
    chiefConcern: z.string().trim().min(1).max(200),
    symptomSummary: z.string().trim().min(1).max(4000),
    historySummary: z.string().trim().min(1).max(4000),
    questionsForClinician: z.array(z.string().trim().min(1).max(300)).max(12).default([]),
  }),
});

const addArtifactSchema = z.object({
  artifactType: z.enum(["note", "lab", "summary", "report", "imaging-summary"]),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(4000),
  sourceDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (value) => {
        const date = new Date(`${value}T00:00:00Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
      },
      { message: "sourceDate must be a valid calendar date in YYYY-MM-DD format" },
    )
    .optional(),
  provenance: z.string().trim().min(1).max(300).optional(),
});

const createPacketSchema = z.object({
  requestedBy: z.string().trim().min(1).max(120).optional(),
  focus: z.string().trim().min(1).max(300).optional(),
});

interface CreateAppDependencies {
  store: PersonalDoctorStore;
}

function readRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function renderMetrics(cases: PersonalDoctorCase[]): string {
  const summary = buildOperationsSummary(cases);
  const lines = [
    "# HELP personal_doctor_cases_total Total number of personal doctor cases.",
    "# TYPE personal_doctor_cases_total gauge",
    `personal_doctor_cases_total ${summary.totalCases}`,
    "# HELP personal_doctor_artifacts_total Total number of registered source artifacts.",
    "# TYPE personal_doctor_artifacts_total gauge",
    `personal_doctor_artifacts_total ${summary.totalArtifacts}`,
    "# HELP personal_doctor_packets_total Total number of physician packet drafts.",
    "# TYPE personal_doctor_packets_total gauge",
    `personal_doctor_packets_total ${summary.totalPackets}`,
    "# HELP personal_doctor_cases_by_status Total cases by workflow status.",
    "# TYPE personal_doctor_cases_by_status gauge",
  ];

  for (const [status, count] of Object.entries(summary.statusCounts)) {
    lines.push(`personal_doctor_cases_by_status{status="${status}"} ${count}`);
  }

  return `${lines.join("\n")}\n`;
}

export function createApp({ store }: CreateAppDependencies) {
  const app = express();
  app.use(express.json({ limit: "256kb" }));

  app.use((request, response, next) => {
    const requestId = (request.headers["x-request-id"] as string) || randomUUID();
    response.setHeader("x-request-id", requestId);
    next();
  });

  app.post("/api/cases", async (request, response) => {
    const input = createCaseSchema.parse(request.body ?? {});
    const record = createCase(input);
    await store.saveCase(record);
    response.status(201).json({ case: record });
  });

  app.get("/api/cases", async (_request, response) => {
    const cases = await store.listCases();
    response.json({
      cases,
      meta: {
        totalCases: cases.length,
      },
    });
  });

  app.get("/api/cases/:caseId", async (request, response) => {
    const record = await store.getCase(readRouteParam(request.params.caseId));
    if (!record) {
      response.status(404).json({
        code: "case_not_found",
        message: "Case not found.",
      });
      return;
    }

    response.json({ case: record });
  });

  app.post("/api/cases/:caseId/artifacts", async (request, response) => {
    const record = await store.getCase(readRouteParam(request.params.caseId));
    if (!record) {
      response.status(404).json({
        code: "case_not_found",
        message: "Case not found.",
      });
      return;
    }

    const input = addArtifactSchema.parse(request.body ?? {});
    const nextCase = addArtifact(record, input);
    await store.saveCase(nextCase);
    response.status(201).json({ case: nextCase });
  });

  app.post("/api/cases/:caseId/physician-packets", async (request, response) => {
    const record = await store.getCase(readRouteParam(request.params.caseId));
    if (!record) {
      response.status(404).json({
        code: "case_not_found",
        message: "Case not found.",
      });
      return;
    }

    const input = createPacketSchema.parse(request.body ?? {});
    const result = draftPhysicianPacket(record, input);
    await store.saveCase(result.nextCase);
    response.status(201).json({
      case: result.nextCase,
      packet: result.packet,
    });
  });

  app.get("/api/cases/:caseId/physician-packets", async (request, response) => {
    const record = await store.getCase(readRouteParam(request.params.caseId));
    if (!record) {
      response.status(404).json({
        code: "case_not_found",
        message: "Case not found.",
      });
      return;
    }

    response.json({
      physicianPackets: record.physicianPackets,
      meta: {
        totalPackets: record.physicianPackets.length,
      },
    });
  });

  app.get("/api/operations/summary", async (_request, response) => {
    const cases = await store.listCases();
    response.json({
      summary: buildOperationsSummary(cases),
    });
  });

  app.get("/healthz", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.get("/readyz", (_request, response) => {
    response.json({ status: "ready" });
  });

  app.get("/metrics", async (_request, response) => {
    const cases = await store.listCases();
    response.type("text/plain").send(renderMetrics(cases));
  });

  app.use((_request, response) => {
    response.status(404).json({
      code: "route_not_found",
      message: "Route not found.",
    });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      response.status(400).json({
        code: "invalid_input",
        message: "Request body validation failed.",
        details: error.issues,
      });
      return;
    }

    if (error instanceof PersonalDoctorDomainError) {
      response.status(error.statusCode).json({
        code: error.code,
        message: error.message,
      });
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown application error.";
    process.stderr.write(`[500] ${message}\n`);
    response.status(500).json({
      code: "internal_error",
      message: "An internal error occurred.",
    });
  });

  return app;
}
