/**
 * Gemini provider — wraps Google's `@google/generative-ai` SDK.
 *
 * Why we hand-roll a thin wrapper instead of using each call site directly:
 *   1. The same model name + safety + JSON config is reused everywhere.
 *   2. We get a single place to swap to Vertex AI (PROD) without touching
 *      callers — Vertex uses the same SDK shape but a different bootstrap.
 *   3. Token / latency metrics live here (so all AI usage is observable
 *      from one chokepoint, regardless of feature).
 *
 * Policy: AI output is *assistive only*. Every caller must store the raw
 * draft to `AIDraft` so a human can sign off (`AIApprovalLog`). This module
 * never touches the database — it only generates structured drafts.
 */

import { GoogleGenerativeAI, type GenerationConfig } from "@google/generative-ai";

export type GeminiClient = ReturnType<typeof createGeminiClient>;

/** Returns null when no API key is configured — caller must fall back. */
export function createGeminiClient() {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!key) return null;

  const sdk = new GoogleGenerativeAI(key);

  // Default model selection. Override with GEMINI_MODEL_TEXT or
  // GEMINI_MODEL_VISION if a deployment wants a different SKU.
  // 1.5-flash gives strong quality at low cost; flash-8b is even cheaper
  // for high-volume intake summaries.
  const textModel = process.env.GEMINI_MODEL_TEXT ?? "gemini-1.5-flash";
  const visionModel = process.env.GEMINI_MODEL_VISION ?? "gemini-1.5-flash";

  /**
   * Generate text with a JSON-mode response. We pass a raw prompt with the
   * required schema embedded — Gemini will return strict JSON when
   * `responseMimeType` is set. Throws on parse failure (caller falls back).
   */
  async function generateJson<T>(args: {
    model?: string;
    systemInstruction?: string;
    userPrompt: string;
    config?: GenerationConfig;
    /**
     * Image parts (base64 + mime). Pass for the Vision flow. The same model
     * handles both text-only and multi-modal in 1.5+.
     */
    images?: Array<{ mimeType: string; base64: string }>;
  }): Promise<T> {
    const model = sdk.getGenerativeModel({
      model: args.model ?? textModel,
      systemInstruction: args.systemInstruction,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
        ...args.config,
      },
    });

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: args.userPrompt },
    ];
    for (const img of args.images ?? []) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
    }

    const res = await model.generateContent({
      contents: [{ role: "user", parts }],
    });
    const raw = res.response.text();
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Some old previews wrap output in ```json fences. Be tolerant.
      const stripped = raw.replace(/^```json\s*|\s*```$/g, "").trim();
      return JSON.parse(stripped) as T;
    }
  }

  return { sdk, textModel, visionModel, generateJson };
}

/** Singleton — reused across all providers. */
let cached: GeminiClient | null | undefined;
export function getGemini(): GeminiClient | null {
  if (cached === undefined) cached = createGeminiClient();
  return cached;
}
