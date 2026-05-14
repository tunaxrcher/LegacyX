/**
 * AI providers facade.
 *
 * STRATEGY (Phase Q):
 *   1. Try Gemini (`GEMINI_API_KEY`) — production path.
 *   2. Fall back to deterministic heuristics — works in dev/CI without keys.
 *
 * POLICY:
 *   "AI-generated content is assistive only. Final clinical decisions
 *    require human approval."  ← enforced upstream by the AIApprovalLog table.
 */

import { getGemini } from "./providers/gemini";
import { heuristicIntakeSummary, heuristicVoiceNote } from "./providers/heuristic";

export type IntakeInput = { symptoms: string; history?: string };
export type IntakeSummary = {
  chief_complaint: string;
  red_flags: string[];
  suggested_questions: string[];
  triage_level: "ROUTINE" | "URGENT" | "EMERGENCY";
};

export type VoiceNoteInput = { transcript: string; locale?: string };
export type VoiceNoteDraft = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

export type VisionAnalyzeInput = {
  /** Base64-encoded image bytes (no data URL prefix). */
  image_base64: string;
  mime_type: "image/jpeg" | "image/png" | "image/webp";
  context?: string;
  kind?: "BEFORE" | "AFTER" | "OTHER";
};
export type VisionAnalyzeResult = {
  summary: string;
  observations: string[];
  concerns: string[];
  /** 0-1 confidence score the model assigns to its own output. */
  confidence: number;
};

const INTAKE_SYSTEM = `You are a careful Thai/English clinical intake assistant for a beauty / dermatology clinic in Thailand.
- Reply in JSON ONLY, never prose.
- Use the patient's language; mirror Thai when the symptoms are Thai.
- Treat anything cardiovascular, anaphylactic, neurological or "severe bleeding" as URGENT.
- "EMERGENCY" only for life-threatening: chest pain, fainted, stroke signs, severe bleeding.
- "ROUTINE" otherwise.
Schema: { chief_complaint: string, red_flags: string[], suggested_questions: string[], triage_level: "ROUTINE"|"URGENT"|"EMERGENCY" }`;

const VOICE_SYSTEM = `You are a clinical scribe transforming a doctor's voice transcript into structured SOAP notes.
- Reply in JSON ONLY: { subjective, objective, assessment, plan }.
- Preserve the doctor's language (Thai or English).
- DO NOT invent diagnoses. Only restructure what the doctor said.
- Each field is a string (may be empty).`;

const VISION_SYSTEM = `You are a Thai aesthetic/dermatology assistant. Analyse the uploaded clinical photo (e.g. before/after a laser or injection treatment).
- Reply in JSON ONLY: { summary, observations, concerns, confidence }.
- 'observations' = what is visibly present (acne, pigmentation, swelling, bruising…).
- 'concerns' = anything the clinician should NOT miss (e.g. asymmetry, infection signs).
- 'confidence' = 0-1 self-rating; lower if photo lighting is poor.
- DO NOT diagnose. Be conservative.`;

export async function generateIntakeSummary(input: IntakeInput): Promise<IntakeSummary> {
  const gem = getGemini();
  if (!gem) return heuristicIntakeSummary(input);
  try {
    const prompt = `Symptoms: ${input.symptoms}\n${input.history ? `History: ${input.history}` : ""}\nReturn JSON with the fields described in the system prompt.`;
    const out = await gem.generateJson<IntakeSummary>({
      systemInstruction: INTAKE_SYSTEM,
      userPrompt: prompt,
    });
    // Validate shape — fall back if the model misbehaved.
    if (
      typeof out?.chief_complaint === "string" &&
      Array.isArray(out.red_flags) &&
      Array.isArray(out.suggested_questions) &&
      ["ROUTINE", "URGENT", "EMERGENCY"].includes(out.triage_level)
    ) {
      return out;
    }
  } catch {
    // Network blip / quota / transient JSON parse error — fall through.
  }
  return heuristicIntakeSummary(input);
}

export async function generateVoiceNote(input: VoiceNoteInput): Promise<VoiceNoteDraft> {
  const gem = getGemini();
  if (!gem) return heuristicVoiceNote(input);
  try {
    const prompt = `Transcript (locale=${input.locale ?? "auto"}):\n${input.transcript}\nReturn JSON SOAP fields.`;
    const out = await gem.generateJson<VoiceNoteDraft>({
      systemInstruction: VOICE_SYSTEM,
      userPrompt: prompt,
    });
    if (
      typeof out?.subjective === "string" &&
      typeof out?.objective === "string" &&
      typeof out?.assessment === "string" &&
      typeof out?.plan === "string"
    ) {
      return out;
    }
  } catch {
    /* fall through */
  }
  return heuristicVoiceNote(input);
}

export async function analyzeVision(
  input: VisionAnalyzeInput,
): Promise<VisionAnalyzeResult> {
  const gem = getGemini();
  if (!gem) {
    // Deterministic placeholder — in dev we still return a sensible shape.
    return {
      summary: "AI vision provider not configured (GEMINI_API_KEY missing)",
      observations: [],
      concerns: [],
      confidence: 0,
    };
  }
  try {
    const prompt = `Photo type: ${input.kind ?? "OTHER"}\nContext: ${input.context ?? "(none)"}\nAnalyse the attached photo.`;
    const out = await gem.generateJson<VisionAnalyzeResult>({
      model: gem.visionModel,
      systemInstruction: VISION_SYSTEM,
      userPrompt: prompt,
      images: [{ mimeType: input.mime_type, base64: input.image_base64 }],
    });
    if (
      typeof out?.summary === "string" &&
      Array.isArray(out.observations) &&
      Array.isArray(out.concerns)
    ) {
      return {
        summary: out.summary,
        observations: out.observations,
        concerns: out.concerns,
        confidence: typeof out.confidence === "number" ? out.confidence : 0.5,
      };
    }
  } catch {
    /* fall through */
  }
  return {
    summary: "AI analysis failed — please review photo manually.",
    observations: [],
    concerns: [],
    confidence: 0,
  };
}

export function aiProviderName(): string {
  return getGemini() ? "gemini" : "heuristic";
}
