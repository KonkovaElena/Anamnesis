import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { bootstrap } from "../src/bootstrap";
import { NoOpLlmSidecar } from "../src/infrastructure/NoOpLlmSidecar";
import { OpenAiCompatibleLlmSidecar } from "../src/infrastructure/OpenAiCompatibleLlmSidecar";
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

async function withMockChatCompletionServer(
  handler: (request: Request, body: unknown) => void,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const body = chunks.length > 0
      ? JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
      : undefined;

    handler(request, body);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      id: "chatcmpl-test",
      object: "chat.completion",
      model: "local-sidecar-model",
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: "Review the newest evidence summary, confirm chronology, and keep the packet draft diagnostic-free.",
          },
        },
      ],
      usage: {
        prompt_tokens: 143,
        completion_tokens: 41,
        total_tokens: 184,
      },
    }));
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("OpenAiCompatibleLlmSidecar posts a bounded chat-completions request and parses the response", async () => {
  let seenAuthorization: string | undefined;
  let seenBody: Record<string, unknown> | undefined;

  await withMockChatCompletionServer((request, body) => {
    seenAuthorization = request.headers.authorization;
    seenBody = body as Record<string, unknown>;
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/v1/chat/completions");
  }, async (baseUrl) => {
    const sidecar = new OpenAiCompatibleLlmSidecar({
      baseUrl,
      model: "local-sidecar-model",
      apiKey: "sidecar-key",
    });

    assert.equal(await sidecar.isAvailable(), true);

    const result = await sidecar.assistDraft({
      ...SAMPLE_INPUT,
      focus: "Headache packet draft",
      maxTokens: 321,
    });

    assert.equal(seenAuthorization, "Bearer sidecar-key");
    assert.equal(seenBody?.model, "local-sidecar-model");
    assert.equal(seenBody?.temperature, 0);
    assert.equal(seenBody?.max_tokens, 321);
    assert.ok(Array.isArray(seenBody?.messages));
    assert.match(JSON.stringify(seenBody?.messages), /draft-only/i);
    assert.match(JSON.stringify(seenBody?.messages), /Persistent headaches/i);

    assert.equal(result.model, "local-sidecar-model");
    assert.equal(result.promptTokens, 143);
    assert.equal(result.completionTokens, 41);
    assert.equal(result.sections.length, 1);
    assert.equal(result.sections[0]?.label, "Draft assistance");
    assert.match(result.sections[0]?.content ?? "", /confirm chronology/i);
    assert.match(result.disclaimer, /clinician verification/i);
    assert.ok(result.durationMs >= 0);
  });
});

test("OpenAiCompatibleLlmSidecar rejects empty assistant content", async () => {
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) {
      // Consume request body.
    }

    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      id: "chatcmpl-empty",
      object: "chat.completion",
      model: "local-sidecar-model",
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: "   ",
          },
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 0,
        total_tokens: 10,
      },
    }));
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const sidecar = new OpenAiCompatibleLlmSidecar({
    baseUrl: `http://127.0.0.1:${address.port}`,
    model: "local-sidecar-model",
  });

  try {
    await assert.rejects(
      () => sidecar.assistDraft(SAMPLE_INPUT),
      (error: unknown) => error instanceof Error && error.message.includes("did not return assistant text"),
    );
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("bootstrap rejects incomplete OpenAI-compatible LLM sidecar configuration", () => {
  assert.throws(
    () => bootstrap({
      allowInsecureDevAuth: true,
      llmSidecarBaseUrl: "http://127.0.0.1:8081",
    }),
    /LLM_SIDECAR_MODEL/,
  );
});
