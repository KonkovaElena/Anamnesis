import assert from "node:assert/strict";
import test from "node:test";
import { NoOpLlmSidecar } from "../src/infrastructure/NoOpLlmSidecar";
import type { LlmDraftAssistanceInput, LlmSidecar } from "../src/domain/anamnesis";

const SAMPLE_INPUT: LlmDraftAssistanceInput = {
  caseId: "case-llm-test",
  artifacts: [
    {
      artifactId: "art-1",
      artifactType: "report",
      title: "Lab results",
      summary: "CBC within normal limits.",
    },
  ],
  intake: {
    chiefConcern: "Persistent headaches.",
    symptomSummary: "Daily occipital headaches.",
    historySummary: "No prior imaging.",
    questionsForClinician: ["MRI warranted?"],
  },
};

test("NoOpLlmSidecar implements LlmSidecar interface", () => {
  const sidecar: LlmSidecar = new NoOpLlmSidecar();
  assert.ok(sidecar);
  assert.equal(typeof sidecar.isAvailable, "function");
  assert.equal(typeof sidecar.assistDraft, "function");
});

test("NoOpLlmSidecar.isAvailable returns false", async () => {
  const sidecar = new NoOpLlmSidecar();
  const available = await sidecar.isAvailable();
  assert.equal(available, false);
});

test("NoOpLlmSidecar.assistDraft throws when called", async () => {
  const sidecar = new NoOpLlmSidecar();
  await assert.rejects(
    () => sidecar.assistDraft(SAMPLE_INPUT),
    (error: unknown) => error instanceof Error && error.message.includes("not configured"),
  );
});

test("LlmDraftAssistanceInput accepts optional focus and maxTokens", () => {
  const input: LlmDraftAssistanceInput = {
    ...SAMPLE_INPUT,
    focus: "headache differential",
    maxTokens: 2048,
  };
  assert.equal(input.focus, "headache differential");
  assert.equal(input.maxTokens, 2048);
});

test("LlmDraftAssistanceInput artifacts are readonly", () => {
  const input: LlmDraftAssistanceInput = { ...SAMPLE_INPUT };
  assert.equal(input.artifacts.length, 1);
  assert.equal(input.artifacts[0]!.artifactType, "report");
});
