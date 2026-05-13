/**
 * Mock AI providers. In production these would call OpenAI/Whisper/Vertex.
 *
 * IMPORTANT POLICY:
 *   "AI-generated content is assistive only. Final clinical decisions
 *    require human approval."  ← enforced by the AIApprovalLog table.
 */

export type IntakeInput = { symptoms: string; history?: string };
export type IntakeSummary = {
  chief_complaint: string;
  red_flags: string[];
  suggested_questions: string[];
  triage_level: "ROUTINE" | "URGENT" | "EMERGENCY";
};

export async function generateIntakeSummary(input: IntakeInput): Promise<IntakeSummary> {
  const lower = input.symptoms.toLowerCase();
  const redFlags: string[] = [];
  if (/(chest pain|shortness of breath|fainted|stroke)/.test(lower)) {
    redFlags.push("possible cardiovascular emergency");
  }
  if (/(severe bleeding|anaphyl|seizure)/.test(lower)) {
    redFlags.push("acute critical sign");
  }
  return {
    chief_complaint: input.symptoms.slice(0, 200),
    red_flags: redFlags,
    suggested_questions: [
      "Duration of symptoms?",
      "Aggravating / relieving factors?",
      "Any current medications?",
    ],
    triage_level: redFlags.length > 0 ? "URGENT" : "ROUTINE",
  };
}

export type VoiceNoteInput = { transcript: string; locale?: string };
export type VoiceNoteDraft = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

// Cue phrases we look for to split a free-form transcript into SOAP sections.
// Order matters — we scan the text once and split at each cue boundary.
// Production should replace this with a real LLM call (GPT-4/Claude) using
// structured output (JSON mode). Until then, this heuristic is good enough
// for a Thai/English demo and deterministic for tests.
const SOAP_CUES: Array<{ key: keyof VoiceNoteDraft; patterns: RegExp[] }> = [
  {
    key: "subjective",
    patterns: [
      /\b(subjective|S:)\b/i,
      /(ผู้ป่วย(?:มา|เล่า|บอก|แจ้ง)|อาการ|อาการที่มา|เจ็บ|ปวด|คนไข้บอก)/,
    ],
  },
  {
    key: "objective",
    patterns: [
      /\b(objective|O:|exam|vital)\b/i,
      /(ตรวจพบ|ตรวจร่างกาย|BP\s*\d|Temp|ผลตรวจ|สัญญาณชีพ)/,
    ],
  },
  {
    key: "assessment",
    patterns: [
      /\b(assessment|A:|diagnos|impression)\b/i,
      /(วินิจฉัย|น่าจะเป็น|โรค|ICD)/,
    ],
  },
  {
    key: "plan",
    patterns: [
      /\b(plan|P:|rx|medication|treatment|follow[- ]?up)\b/i,
      /(แผน|สั่งยา|นัดติดตาม|ให้ยา|รักษา|ฉีด|ทำหัตถการ)/,
    ],
  },
];

export async function generateVoiceNote(input: VoiceNoteInput): Promise<VoiceNoteDraft> {
  const text = input.transcript.trim();
  const empty: VoiceNoteDraft = { subjective: "", objective: "", assessment: "", plan: "" };
  if (!text) return empty;

  // Find cue matches and their positions, sorted by offset.
  type Hit = { key: keyof VoiceNoteDraft; index: number };
  const hits: Hit[] = [];
  for (const cue of SOAP_CUES) {
    for (const pat of cue.patterns) {
      const m = pat.exec(text);
      if (m && m.index !== undefined) {
        hits.push({ key: cue.key, index: m.index });
        break; // first pattern per section is enough
      }
    }
  }
  hits.sort((a, b) => a.index - b.index);

  if (hits.length === 0) {
    // No recognisable cues — dump the whole transcript into Subjective as a
    // conservative fallback. The doctor still edits before signing.
    return { ...empty, subjective: text };
  }

  const result: VoiceNoteDraft = { ...empty };
  for (let i = 0; i < hits.length; i++) {
    const current = hits[i]!;
    const next = hits[i + 1];
    const end = next ? next.index : text.length;
    const segment = text.slice(current.index, end).trim();
    // Append (in case multiple cues of same section appear).
    result[current.key] = result[current.key]
      ? `${result[current.key]}\n${segment}`
      : segment;
  }

  // Any text before the first cue → prepend to subjective as preamble.
  if (hits[0]!.index > 0) {
    const preamble = text.slice(0, hits[0]!.index).trim();
    if (preamble) {
      result.subjective = result.subjective
        ? `${preamble}\n${result.subjective}`
        : preamble;
    }
  }

  return result;
}
