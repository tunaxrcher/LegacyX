import { describe, it, expect } from "vitest";
import {
  heuristicIntakeSummary,
  heuristicVoiceNote,
} from "../src/providers/heuristic";

describe("heuristicIntakeSummary", () => {
  it("flags chest pain as URGENT", () => {
    const s = heuristicIntakeSummary({ symptoms: "Severe chest pain since morning" });
    expect(s.triage_level).toBe("URGENT");
    expect(s.red_flags.length).toBeGreaterThan(0);
  });

  it("treats common complaints as ROUTINE", () => {
    const s = heuristicIntakeSummary({ symptoms: "Mild acne on cheeks" });
    expect(s.triage_level).toBe("ROUTINE");
    expect(s.red_flags).toEqual([]);
  });

  it("truncates long chief_complaint to 200 chars", () => {
    const long = "x".repeat(500);
    const s = heuristicIntakeSummary({ symptoms: long });
    expect(s.chief_complaint.length).toBeLessThanOrEqual(200);
  });
});

describe("heuristicVoiceNote", () => {
  it("returns empty SOAP for empty transcript", () => {
    const v = heuristicVoiceNote({ transcript: "" });
    expect(v).toEqual({ subjective: "", objective: "", assessment: "", plan: "" });
  });

  it("places a single ICD-style transcript into Assessment", () => {
    const v = heuristicVoiceNote({
      transcript: "Patient is otherwise well. Assessment: Acne vulgaris grade 2. Plan: Adapalene 0.1%",
    });
    expect(v.assessment.length).toBeGreaterThan(0);
    expect(v.plan.length).toBeGreaterThan(0);
  });

  it("falls back to Subjective when no SOAP cues match", () => {
    const v = heuristicVoiceNote({ transcript: "random words with no clinical structure here" });
    expect(v.subjective.length).toBeGreaterThan(0);
    expect(v.objective).toBe("");
    expect(v.assessment).toBe("");
    expect(v.plan).toBe("");
  });

  it("recognises Thai SOAP cues", () => {
    const v = heuristicVoiceNote({
      transcript: "ผู้ป่วยมา ปวดศีรษะ 2 วัน ตรวจพบ BP 120/80 วินิจฉัยปวดศีรษะแบบตึงเครียด แผน paracetamol",
    });
    // The Thai patterns should split content into 3-4 sections.
    const filled =
      [v.subjective, v.objective, v.assessment, v.plan].filter((s) => s.length > 0).length;
    expect(filled).toBeGreaterThanOrEqual(3);
  });
});
