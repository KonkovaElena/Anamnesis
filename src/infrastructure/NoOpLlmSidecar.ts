import type { LlmDraftAssistanceInput, LlmDraftAssistanceResult, LlmSidecar } from "../domain/anamnesis";

/**
 * No-op LLM sidecar adapter for Phase 3 contract readiness.
 *
 * Returns `isAvailable() === false` and throws on `assistDraft()`.
 * Replace with a real adapter once the LLM integration is implemented.
 */
export class NoOpLlmSidecar implements LlmSidecar {
  async isAvailable(): Promise<boolean> {
    return false;
  }

  async assistDraft(_input: LlmDraftAssistanceInput): Promise<LlmDraftAssistanceResult> {
    throw new Error("LLM sidecar is not configured. Set up an LLM adapter before calling assistDraft().");
  }
}
