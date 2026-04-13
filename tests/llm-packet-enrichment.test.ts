import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { LlmDraftAssistanceInput, LlmDraftAssistanceResult, LlmSidecar } from "../src/domain/anamnesis";
import { jsonRequest, textRequest, withServer } from "./helpers";

class AvailableSidecar implements LlmSidecar {
  public assistCalls = 0;
  public lastInput: LlmDraftAssistanceInput | undefined;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async assistDraft(input: LlmDraftAssistanceInput): Promise<LlmDraftAssistanceResult> {
    this.assistCalls += 1;
    this.lastInput = input;
    return {
      model: "local-test-sidecar",
      promptTokens: 112,
      completionTokens: 57,
      durationMs: 18,
      disclaimer: "Model-generated draft assistance requires clinician verification.",
      sections: [
        {
          label: "Draft assistance",
          content: "Local sidecar highlighted the most recent evidence summary for clinician review.",
        },
      ],
    };
  }
}

class UnavailableSidecar implements LlmSidecar {
  public assistCalls = 0;

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async assistDraft(): Promise<LlmDraftAssistanceResult> {
    this.assistCalls += 1;
    throw new Error("assistDraft should not be called when sidecar is unavailable");
  }
}

class ThrowingSidecar implements LlmSidecar {
  public assistCalls = 0;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async assistDraft(): Promise<LlmDraftAssistanceResult> {
    this.assistCalls += 1;
    throw new Error("sidecar failure");
  }
}

async function createDraftableCase(baseUrl: string): Promise<string> {
  const createCaseResponse = await jsonRequest<{ case: { caseId: string } }>(baseUrl, "/api/cases", {
    method: "POST",
    body: {
      patientLabel: "llm-packet-case",
      intake: {
        chiefConcern: "Intermittent headaches",
        symptomSummary: "Headaches worsened after exercise over the last week.",
        historySummary: "No previous MRI has been registered in this case.",
        questionsForClinician: ["Should imaging be prioritized?"],
      },
    },
  });
  const caseId = createCaseResponse.body.case.caseId;

  const artifactResponse = await jsonRequest(baseUrl, `/api/cases/${caseId}/artifacts`, {
    method: "POST",
    body: {
      artifactType: "summary",
      title: "Outside clinician summary",
      summary: "Recent encounter summary noted persistent headache without diagnosis.",
      sourceDate: "2026-04-10",
    },
  });

  assert.equal(createCaseResponse.status, 201);
  assert.equal(artifactResponse.status, 201);
  return caseId;
}

async function withLocalOpenAiSidecar(
  run: (baseUrl: string, seenBodies: Array<Record<string, unknown>>) => Promise<void>,
): Promise<void> {
  const seenBodies: Array<Record<string, unknown>> = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    seenBodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      id: "chatcmpl-runtime",
      object: "chat.completion",
      model: "runtime-local-sidecar",
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: "Local HTTP sidecar flagged the newest artifact for clinician verification before packet finalization.",
          },
        },
      ],
      usage: {
        prompt_tokens: 155,
        completion_tokens: 29,
        total_tokens: 184,
      },
    }));
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl, seenBodies);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("available LLM sidecar appends draft-only enrichment to a physician packet and records audit metadata", async () => {
  const sidecar = new AvailableSidecar();

  await withServer(async (baseUrl) => {
    const caseId = await createDraftableCase(baseUrl);

    const packetResponse = await jsonRequest<{
      packet: {
        disclaimer: string;
        sections: Array<{ label: string; content: string }>;
      };
    }>(baseUrl, `/api/cases/${caseId}/physician-packets`, {
      method: "POST",
      body: {
        focus: "Headache workup",
      },
    });

    assert.equal(packetResponse.status, 201);
    assert.equal(sidecar.assistCalls, 1);
    assert.equal(sidecar.lastInput?.caseId, caseId);
    assert.equal(sidecar.lastInput?.focus, "Headache workup");
    assert.equal(
      packetResponse.body.packet.sections.some((section) => section.label === "Draft assistance"),
      true,
    );
    assert.match(packetResponse.body.packet.disclaimer, /Model-generated draft assistance requires clinician verification/);

    const auditResponse = await jsonRequest<{
      events: Array<{
        eventType: string;
        details?: {
          llmDraftAssistanceModel?: string;
          llmDraftAssistancePromptTokens?: number;
        };
      }>;
    }>(baseUrl, `/api/cases/${caseId}/audit-events`);

    assert.equal(auditResponse.status, 200);
    const draftedEvent = auditResponse.body.events.find((event) => event.eventType === "packet.drafted");
    assert.equal(draftedEvent?.details?.llmDraftAssistanceModel, "local-test-sidecar");
    assert.equal(draftedEvent?.details?.llmDraftAssistancePromptTokens, 112);
  }, { llmSidecar: sidecar });
});

test("unavailable LLM sidecar preserves deterministic packet drafting and never calls assistDraft", async () => {
  const sidecar = new UnavailableSidecar();

  await withServer(async (baseUrl) => {
    const caseId = await createDraftableCase(baseUrl);

    const packetResponse = await jsonRequest<{
      packet: {
        disclaimer: string;
        sections: Array<{ label: string; content: string }>;
      };
    }>(baseUrl, `/api/cases/${caseId}/physician-packets`, {
      method: "POST",
      body: {
        focus: "Baseline draft",
      },
    });

    assert.equal(packetResponse.status, 201);
    assert.equal(sidecar.assistCalls, 0);
    assert.equal(
      packetResponse.body.packet.sections.some((section) => section.label === "Draft assistance"),
      false,
    );
    assert.doesNotMatch(packetResponse.body.packet.disclaimer, /Model-generated draft assistance requires clinician verification/);
  }, { llmSidecar: sidecar });
});

test("sidecar failures fail closed and still return a deterministic physician packet", async () => {
  const sidecar = new ThrowingSidecar();

  await withServer(async (baseUrl) => {
    const caseId = await createDraftableCase(baseUrl);

    const packetResponse = await jsonRequest<{
      packet: {
        sections: Array<{ label: string; content: string }>;
      };
    }>(baseUrl, `/api/cases/${caseId}/physician-packets`, {
      method: "POST",
      body: {
        focus: "Fail closed draft",
      },
    });

    assert.equal(packetResponse.status, 201);
    assert.equal(sidecar.assistCalls, 1);
    assert.equal(
      packetResponse.body.packet.sections.some((section) => section.label === "Draft assistance"),
      false,
    );
  }, { llmSidecar: sidecar });
});

test("bootstrap-configured OpenAI-compatible LLM sidecar enriches physician packets via the runtime wiring", async () => {
  await withLocalOpenAiSidecar(async (sidecarBaseUrl, seenBodies) => {
    await withServer(async (baseUrl) => {
      const caseId = await createDraftableCase(baseUrl);

      const packetResponse = await jsonRequest<{
        packet: {
          disclaimer: string;
          sections: Array<{ label: string; content: string }>;
        };
      }>(baseUrl, `/api/cases/${caseId}/physician-packets`, {
        method: "POST",
        body: {
          focus: "Runtime sidecar draft",
        },
      });

      assert.equal(packetResponse.status, 201);
      assert.equal(seenBodies.length, 1);
      assert.equal(seenBodies[0]?.model, "runtime-local-sidecar");
      assert.match(JSON.stringify(seenBodies[0]?.messages), /Runtime sidecar draft/i);
      assert.equal(
        packetResponse.body.packet.sections.some((section) => section.label === "Draft assistance"),
        true,
      );
      assert.match(packetResponse.body.packet.disclaimer, /clinician verification/i);

      const auditResponse = await jsonRequest<{
        events: Array<{
          eventType: string;
          details?: {
            llmDraftAssistanceModel?: string;
            llmDraftAssistancePromptTokens?: number;
          };
        }>;
      }>(baseUrl, `/api/cases/${caseId}/audit-events`);

      const draftedEvent = auditResponse.body.events.find((event) => event.eventType === "packet.drafted");
      assert.equal(draftedEvent?.details?.llmDraftAssistanceModel, "runtime-local-sidecar");
      assert.equal(draftedEvent?.details?.llmDraftAssistancePromptTokens, 155);

      const summaryResponse = await jsonRequest<{
        llmSidecar: {
          enabled: boolean;
          configuredModel: string | null;
          totalRequests: number;
          totalSuccesses: number;
          totalFailures: number;
          lastSuccessfulRequestAt: string | null;
          lastFailedRequestAt: string | null;
        };
      }>(baseUrl, "/api/operations/summary");

      assert.equal(summaryResponse.status, 200);
      assert.equal(summaryResponse.body.llmSidecar.enabled, true);
      assert.equal(summaryResponse.body.llmSidecar.configuredModel, "runtime-local-sidecar");
      assert.equal(summaryResponse.body.llmSidecar.totalRequests, 1);
      assert.equal(summaryResponse.body.llmSidecar.totalSuccesses, 1);
      assert.equal(summaryResponse.body.llmSidecar.totalFailures, 0);
      assert.equal(summaryResponse.body.llmSidecar.lastSuccessfulRequestAt !== null, true);
      assert.equal(summaryResponse.body.llmSidecar.lastFailedRequestAt, null);

      const metricsResponse = await textRequest(baseUrl, "/metrics");
      assert.equal(metricsResponse.status, 200);
      assert.match(metricsResponse.body, /anamnesis_llm_sidecar_enabled 1/);
      assert.match(metricsResponse.body, /anamnesis_llm_sidecar_requests_total 1/);
      assert.match(metricsResponse.body, /anamnesis_llm_sidecar_successes_total 1/);
      assert.match(metricsResponse.body, /anamnesis_llm_sidecar_failures_total 0/);
    }, {
      llmSidecarBaseUrl: sidecarBaseUrl,
      llmSidecarModel: "runtime-local-sidecar",
      llmSidecarApiKey: "runtime-sidecar-key",
      llmSidecarTimeoutMs: 1000,
    });
  });
});