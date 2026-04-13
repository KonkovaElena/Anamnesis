import assert from "node:assert/strict";
import test from "node:test";
import { OpenAiCompatibleLlmSidecar } from "../src/infrastructure/OpenAiCompatibleLlmSidecar";
import {
  LLM_DRAFT_ASSISTANCE_SAMPLE_INPUT,
  LLM_SIDECAR_ACCEPT_CASES,
  LLM_SIDECAR_REJECT_CASES,
} from "./fixtures";

function buildEvaluationSidecar(assistantContent: string): OpenAiCompatibleLlmSidecar {
  return new OpenAiCompatibleLlmSidecar({
    baseUrl: "http://127.0.0.1:11434",
    model: "evaluation-fixture-sidecar",
    fetchImplementation: async () => new Response(JSON.stringify({
      id: "chatcmpl-eval",
      object: "chat.completion",
      model: "evaluation-fixture-sidecar",
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: assistantContent,
          },
        },
      ],
      usage: {
        prompt_tokens: 64,
        completion_tokens: 24,
        total_tokens: 88,
      },
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    }),
  });
}

test("OpenAiCompatibleLlmSidecar evaluation pack accepts review-oriented fixture cases", async (t) => {
  for (const candidate of LLM_SIDECAR_ACCEPT_CASES) {
    await t.test(candidate.name, async () => {
      const sidecar = buildEvaluationSidecar(candidate.assistantContent);

      const result = await sidecar.assistDraft(LLM_DRAFT_ASSISTANCE_SAMPLE_INPUT);

      assert.equal(result.sections.length, 1);
      assert.equal(result.sections[0]?.label, "Draft assistance");
      assert.equal(result.sections[0]?.content, candidate.assistantContent);

      const snapshot = sidecar.getObservabilitySnapshot();
      assert.equal(snapshot.totalRequests, 1);
      assert.equal(snapshot.totalSuccesses, 1);
      assert.equal(snapshot.totalFailures, 0);
    });
  }
});

test("OpenAiCompatibleLlmSidecar evaluation pack rejects unsafe clinical fixture cases", async (t) => {
  for (const candidate of LLM_SIDECAR_REJECT_CASES) {
    await t.test(`${candidate.failureClass}:${candidate.name}`, async () => {
      const sidecar = buildEvaluationSidecar(candidate.assistantContent);

      await assert.rejects(
        () => sidecar.assistDraft(LLM_DRAFT_ASSISTANCE_SAMPLE_INPUT),
        (error: unknown) => error instanceof Error && error.message.includes("unsafe clinical language"),
      );

      const snapshot = sidecar.getObservabilitySnapshot();
      assert.equal(snapshot.totalRequests, 1);
      assert.equal(snapshot.totalSuccesses, 0);
      assert.equal(snapshot.totalFailures, 1);
    });
  }
});