import type {
  LlmDraftAssistanceInput,
  LlmDraftAssistanceResult,
  LlmSidecar,
  LlmSidecarObservabilityReader,
  LlmSidecarObservabilitySnapshot,
} from "../domain/anamnesis";

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_DISCLAIMER = "Model-generated draft assistance requires clinician verification.";
const DRAFT_ASSISTANCE_LABEL = "Draft assistance";
const MAX_ARTIFACTS = 12;
const MAX_SUMMARY_LENGTH = 600;
const MAX_TITLE_LENGTH = 160;
const MAX_TEXT_FIELD_LENGTH = 800;
const MAX_QUESTION_COUNT = 6;
const UNSAFE_CLINICAL_LANGUAGE_PATTERNS = [
  /\bdiagnosis\s*:/i,
  /\bdiagnosed\s+with\b/i,
  /\btreatment\s+plan\b/i,
  /\brecommend\s+(?:starting|start|initiating|initiate)\b/i,
  /\bprescrib(?:e|ed|ing)\b/i,
  /\binitiat(?:e|ing)\s+treatment(?:\s+with)?\b/i,
  /\bstart\s+[a-z][^.!?\n]{0,80}\b(?:mg|mcg|g|ml|tablet|capsule|dose|daily|twice daily)\b/i,
  /\bbegin\s+treatment\b/i,
  /\btake\s+[a-z0-9][^.!?\n]{0,80}\b(?:mg|mcg|g|ml|tablet|capsule|daily|twice daily)\b/i,
];

interface OpenAiCompatibleChatCompletionResponse {
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}

export interface OpenAiCompatibleLlmSidecarOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
}

function truncateText(value: string | undefined, limit: number): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}...`;
}

function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value);
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    throw new Error("LLM sidecar baseUrl must use http or https.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("LLM sidecar baseUrl must not include embedded credentials.");
  }

  if (!parsed.pathname.endsWith("/")) {
    parsed.pathname = `${parsed.pathname}/`;
  }

  return parsed.toString();
}

function buildPromptPayload(input: LlmDraftAssistanceInput): Record<string, unknown> {
  return {
    caseId: input.caseId,
    focus: truncateText(input.focus, 320),
    intake: {
      chiefConcern: truncateText(input.intake.chiefConcern, MAX_TEXT_FIELD_LENGTH),
      symptomSummary: truncateText(input.intake.symptomSummary, MAX_TEXT_FIELD_LENGTH),
      historySummary: truncateText(input.intake.historySummary, MAX_TEXT_FIELD_LENGTH),
      questionsForClinician: input.intake.questionsForClinician
        .slice(0, MAX_QUESTION_COUNT)
        .map((question) => truncateText(question, 240))
        .filter((question): question is string => Boolean(question)),
    },
    artifacts: input.artifacts
      .slice(-MAX_ARTIFACTS)
      .map((artifact) => ({
        artifactId: artifact.artifactId,
        artifactType: artifact.artifactType,
        title: truncateText(artifact.title, MAX_TITLE_LENGTH),
        summary: truncateText(artifact.summary, MAX_SUMMARY_LENGTH),
      })),
  };
}

function extractAssistantText(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }

      if (!part || typeof part !== "object") {
        return "";
      }

      if ("text" in part && typeof part.text === "string") {
        return part.text;
      }

      if ("content" in part && typeof part.content === "string") {
        return part.content;
      }

      return "";
    })
    .join("")
    .trim();
}

function toUsageNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function assertSafeDraftAssistance(text: string): void {
  for (const pattern of UNSAFE_CLINICAL_LANGUAGE_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error("LLM sidecar returned unsafe clinical language for a draft-only packet.");
    }
  }
}

export class OpenAiCompatibleLlmSidecar implements LlmSidecar, LlmSidecarObservabilityReader {
  private readonly baseUrl: string;

  private readonly model: string;

  private readonly apiKey?: string;

  private readonly timeoutMs: number;

  private readonly fetchImplementation: typeof fetch;

  private totalRequests = 0;

  private totalSuccesses = 0;

  private totalFailures = 0;

  private lastSuccessfulRequestAt: string | null = null;

  private lastFailedRequestAt: string | null = null;

  constructor(options: OpenAiCompatibleLlmSidecarOptions) {
    const model = options.model.trim();
    if (model.length === 0) {
      throw new Error("LLM sidecar model must be a non-empty string.");
    }

    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.model = model;
    this.apiKey = options.apiKey?.trim() || undefined;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImplementation = options.fetchImplementation ?? fetch;

    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new Error("LLM sidecar timeoutMs must be a positive integer.");
    }
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  getObservabilitySnapshot(): LlmSidecarObservabilitySnapshot {
    return {
      enabled: true,
      configuredModel: this.model,
      totalRequests: this.totalRequests,
      totalSuccesses: this.totalSuccesses,
      totalFailures: this.totalFailures,
      lastSuccessfulRequestAt: this.lastSuccessfulRequestAt,
      lastFailedRequestAt: this.lastFailedRequestAt,
    };
  }

  async assistDraft(input: LlmDraftAssistanceInput): Promise<LlmDraftAssistanceResult> {
    const endpoint = new URL("v1/chat/completions", this.baseUrl);
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), this.timeoutMs);
    const startedAt = performance.now();
    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json",
    };

    if (this.apiKey) {
      headers.authorization = `Bearer ${this.apiKey}`;
    }

    try {
      this.totalRequests += 1;
      const response = await this.fetchImplementation(endpoint.toString(), {
        method: "POST",
        signal: abortController.signal,
        headers,
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          max_tokens: input.maxTokens,
          messages: [
            {
              role: "system",
              content: [
                "You are assisting with a clinician-facing packet draft.",
                "Return draft-only workflow assistance, not a diagnosis, treatment plan, or medical sign-off.",
                "Focus on evidence chronology, notable gaps, and review questions that a clinician should verify.",
                "Return plain text only.",
              ].join(" "),
            },
            {
              role: "user",
              content: [
                "Create one short draft-assistance note for this case context.",
                JSON.stringify(buildPromptPayload(input), null, 2),
              ].join("\n\n"),
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM sidecar request failed with status ${response.status}.`);
      }

      const payload = await response.json() as OpenAiCompatibleChatCompletionResponse;
      const assistantText = extractAssistantText(payload.choices?.[0]?.message?.content);
      if (assistantText.length === 0) {
        throw new Error("LLM sidecar did not return assistant text.");
      }

      assertSafeDraftAssistance(assistantText);

      this.totalSuccesses += 1;
      this.lastSuccessfulRequestAt = new Date().toISOString();

      return {
        model: payload.model ?? this.model,
        promptTokens: toUsageNumber(payload.usage?.prompt_tokens),
        completionTokens: toUsageNumber(payload.usage?.completion_tokens),
        durationMs: Math.round(performance.now() - startedAt),
        disclaimer: DEFAULT_DISCLAIMER,
        sections: [
          {
            label: DRAFT_ASSISTANCE_LABEL,
            content: assistantText,
          },
        ],
      };
    } catch (error: unknown) {
      this.totalFailures += 1;
      this.lastFailedRequestAt = new Date().toISOString();

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`LLM sidecar request timed out after ${this.timeoutMs}ms.`, { cause: error });
      }

      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}