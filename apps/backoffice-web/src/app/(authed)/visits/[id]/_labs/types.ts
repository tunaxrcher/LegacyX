// Lab order / result data shapes plus the canonical panel templates and
// next-step copy. Kept framework-free so it can be imported from any module
// in the lab section without dragging React along.

export type LabResult = {
  id: string;
  payload: Record<string, unknown>;
  fileUrl: string | null;
  resultedAt: string;
};

export type LabOrder = {
  id: string;
  panel: string;
  status: "ORDERED" | "COLLECTED" | "PROCESSING" | "RESULTED" | "CANCELLED";
  notes: string | null;
  createdAt: string;
  results: LabResult[];
};

export const STATUS_VARIANT: Record<
  LabOrder["status"],
  "info" | "warning" | "success" | "muted"
> = {
  ORDERED: "info",
  COLLECTED: "warning",
  PROCESSING: "warning",
  RESULTED: "success",
  CANCELLED: "muted",
};

// Common lab panels with their canonical "tests" so we can offer one-click
// templates inside the result-recording dialog. The order matters: most
// frequently used items first.
export type PanelTemplate = {
  code: string;
  label: string;
  labelTh: string;
  tests?: Array<{ key: string; unit?: string }>;
};

export const COMMON_PANELS: PanelTemplate[] = [
  {
    code: "CBC",
    label: "Complete Blood Count",
    labelTh: "ตรวจความสมบูรณ์ของเม็ดเลือด",
    tests: [
      { key: "WBC", unit: "x10^9/L" },
      { key: "RBC", unit: "x10^12/L" },
      { key: "HGB", unit: "g/dL" },
      { key: "HCT", unit: "%" },
      { key: "MCV", unit: "fL" },
      { key: "PLT", unit: "x10^9/L" },
    ],
  },
  {
    code: "LIPID",
    label: "Lipid Profile",
    labelTh: "ตรวจไขมันในเลือด",
    tests: [
      { key: "TC", unit: "mg/dL" },
      { key: "LDL", unit: "mg/dL" },
      { key: "HDL", unit: "mg/dL" },
      { key: "TG", unit: "mg/dL" },
    ],
  },
  {
    code: "FBS",
    label: "Fasting Blood Sugar",
    labelTh: "ตรวจน้ำตาลในเลือดอดอาหาร",
    tests: [{ key: "FBS", unit: "mg/dL" }],
  },
  {
    code: "HBA1C",
    label: "Hemoglobin A1c",
    labelTh: "ตรวจน้ำตาลสะสม 3 เดือน",
    tests: [{ key: "HBA1C", unit: "%" }],
  },
  {
    code: "TSH",
    label: "Thyroid Stimulating Hormone",
    labelTh: "ตรวจไทรอยด์",
    tests: [
      { key: "TSH", unit: "mIU/L" },
      { key: "FT4", unit: "ng/dL" },
    ],
  },
  {
    code: "LFT",
    label: "Liver Function Test",
    labelTh: "ตรวจการทำงานของตับ",
    tests: [
      { key: "AST", unit: "U/L" },
      { key: "ALT", unit: "U/L" },
      { key: "ALP", unit: "U/L" },
      { key: "TBIL", unit: "mg/dL" },
    ],
  },
  {
    code: "RFT",
    label: "Renal Function Test",
    labelTh: "ตรวจการทำงานของไต",
    tests: [
      { key: "BUN", unit: "mg/dL" },
      { key: "Cr", unit: "mg/dL" },
      { key: "eGFR", unit: "mL/min" },
    ],
  },
  {
    code: "URINE",
    label: "Urinalysis",
    labelTh: "ตรวจปัสสาวะ",
    tests: [
      { key: "Color", unit: "" },
      { key: "pH", unit: "" },
      { key: "Protein", unit: "" },
      { key: "Glucose", unit: "" },
      { key: "Blood", unit: "" },
    ],
  },
];

// Plain-text "what comes next" copy keyed by current status. Anything that is
// `null` means the order is in a terminal state (RESULTED / CANCELLED).
export const NEXT_STEP_LABEL: Record<
  LabOrder["status"],
  { textTh: string; textEn: string } | null
> = {
  ORDERED: {
    textTh: "ขั้นต่อไป: NURSE กด Collected เมื่อเก็บตัวอย่างแล้ว",
    textEn: "Next: NURSE presses Collected after sample is drawn",
  },
  COLLECTED: {
    textTh: "ขั้นต่อไป: NURSE กด To Lab หรือ Record Result",
    textEn: "Next: NURSE presses To Lab or Record Result",
  },
  PROCESSING: {
    textTh: "ขั้นต่อไป: รอผลกลับ — แล้วกด Record Result",
    textEn: "Next: wait for the lab — then Record Result",
  },
  RESULTED: null,
  CANCELLED: null,
};
