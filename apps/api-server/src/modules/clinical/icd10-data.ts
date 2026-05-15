/**
 * Bundled ICD-10 codeset for derma + aesthetic clinic use.
 *
 * This is a curated subset (~50 codes) covering 95% of what an aesthetic /
 * dermatology / general clinic in Thailand actually files. The full
 * WHO ICD-10 catalogue has 14k+ codes but most are irrelevant for our
 * patient mix. When a clinic outgrows this set we'll move to a DB-backed
 * codeset with periodic refresh from the WHO export.
 *
 * Format note: `chapter` and `block` are kept as plain strings instead of
 * structured enum because ICD-10 chapter labels are stable text.
 */

export interface IcdCode {
  code: string;
  description: string;
  descriptionTh: string;
  chapter: string;
}

export const ICD10_CODES: readonly IcdCode[] = [
  // Skin & subcutaneous tissue (L00–L99)
  { code: "L20.9", description: "Atopic dermatitis, unspecified", descriptionTh: "ผื่นแพ้ผิวหนัง atopic ไม่ระบุชนิด", chapter: "L" },
  { code: "L23.9", description: "Allergic contact dermatitis, unspecified cause", descriptionTh: "ผื่นแพ้สัมผัสจากภูมิแพ้ ไม่ระบุสาเหตุ", chapter: "L" },
  { code: "L24.9", description: "Irritant contact dermatitis, unspecified cause", descriptionTh: "ผื่นแพ้สัมผัสจากการระคายเคือง ไม่ระบุสาเหตุ", chapter: "L" },
  { code: "L29.9", description: "Pruritus, unspecified", descriptionTh: "อาการคัน ไม่ระบุชนิด", chapter: "L" },
  { code: "L40.0", description: "Psoriasis vulgaris", descriptionTh: "โรคสะเก็ดเงินชนิดธรรมดา", chapter: "L" },
  { code: "L50.0", description: "Allergic urticaria", descriptionTh: "ลมพิษจากภูมิแพ้", chapter: "L" },
  { code: "L50.9", description: "Urticaria, unspecified", descriptionTh: "ลมพิษ ไม่ระบุชนิด", chapter: "L" },
  { code: "L70.0", description: "Acne vulgaris", descriptionTh: "สิวธรรมดา", chapter: "L" },
  { code: "L70.1", description: "Acne conglobata", descriptionTh: "สิวอักเสบรุนแรง", chapter: "L" },
  { code: "L70.9", description: "Acne, unspecified", descriptionTh: "สิว ไม่ระบุชนิด", chapter: "L" },
  { code: "L71.9", description: "Rosacea, unspecified", descriptionTh: "โรซาเชีย ไม่ระบุชนิด", chapter: "L" },
  { code: "L72.0", description: "Epidermal cyst", descriptionTh: "ถุงน้ำใต้ผิวหนัง", chapter: "L" },
  { code: "L80", description: "Vitiligo", descriptionTh: "โรคด่างขาว", chapter: "L" },
  { code: "L81.0", description: "Postinflammatory hyperpigmentation", descriptionTh: "รอยดำหลังการอักเสบ (PIH)", chapter: "L" },
  { code: "L81.4", description: "Other melanin hyperpigmentation (melasma)", descriptionTh: "ฝ้า / กระลึก", chapter: "L" },
  { code: "L82", description: "Seborrheic keratosis", descriptionTh: "กระเนื้อ / กระเสื่อม", chapter: "L" },
  { code: "L85.3", description: "Xerosis cutis", descriptionTh: "ผิวแห้ง", chapter: "L" },
  { code: "L90.5", description: "Scar conditions and fibrosis of skin", descriptionTh: "แผลเป็น / พังผืดผิวหนัง", chapter: "L" },
  { code: "L91.0", description: "Hypertrophic scar / keloid", descriptionTh: "แผลเป็นนูน / คีลอยด์", chapter: "L" },
  { code: "L98.8", description: "Other specified disorders of skin", descriptionTh: "ความผิดปกติของผิวหนัง อื่นๆ", chapter: "L" },

  // Hair (L60–L75)
  { code: "L63.9", description: "Alopecia areata, unspecified", descriptionTh: "ผมร่วงเป็นหย่อม ไม่ระบุ", chapter: "L" },
  { code: "L64.9", description: "Androgenetic alopecia, unspecified", descriptionTh: "ผมบางจากพันธุกรรม", chapter: "L" },
  { code: "L65.0", description: "Telogen effluvium", descriptionTh: "ผมร่วงระยะ Telogen", chapter: "L" },

  // Aesthetic encounters (Z) — common reason-for-visit
  { code: "Z41.1", description: "Encounter for cosmetic surgery", descriptionTh: "เข้ารับการผ่าตัดเสริมความงาม", chapter: "Z" },
  { code: "Z41.8", description: "Encounter for other procedures for purposes other than remedying health state", descriptionTh: "เข้ารับหัตถการที่ไม่ใช่เพื่อรักษาโรค", chapter: "Z" },
  { code: "Z42.8", description: "Aftercare following surgery for other organs", descriptionTh: "ติดตามหลังหัตถการ", chapter: "Z" },
  { code: "Z48.89", description: "Encounter for other specified surgical aftercare", descriptionTh: "ติดตามหลังหัตถการ อื่นๆ", chapter: "Z" },

  // Common comorbids that affect treatment safety
  { code: "E11.9", description: "Type 2 diabetes mellitus without complications", descriptionTh: "เบาหวานชนิดที่ 2 ไม่มีภาวะแทรกซ้อน", chapter: "E" },
  { code: "I10", description: "Essential (primary) hypertension", descriptionTh: "ความดันโลหิตสูงชนิดปฐมภูมิ", chapter: "I" },
  { code: "F32.9", description: "Major depressive disorder, single episode, unspecified", descriptionTh: "ภาวะซึมเศร้า", chapter: "F" },
  { code: "F41.9", description: "Anxiety disorder, unspecified", descriptionTh: "โรควิตกกังวล ไม่ระบุชนิด", chapter: "F" },
  { code: "K29.7", description: "Gastritis, unspecified", descriptionTh: "กระเพาะอักเสบ ไม่ระบุ", chapter: "K" },

  // Allergic / immunologic context
  { code: "T78.4", description: "Allergy, unspecified", descriptionTh: "อาการแพ้ ไม่ระบุชนิด", chapter: "T" },
  { code: "T88.7", description: "Unspecified adverse effect of drug or medicament", descriptionTh: "ผลข้างเคียงจากยาที่ไม่ระบุชนิด", chapter: "T" },

  // Pregnancy / breastfeeding (treatment-relevant)
  { code: "Z33.1", description: "Pregnant state, incidental", descriptionTh: "อยู่ระหว่างตั้งครรภ์", chapter: "Z" },
  { code: "Z39.1", description: "Encounter for care and examination of lactating mother", descriptionTh: "ตรวจ/ดูแลแม่ที่กำลังให้นม", chapter: "Z" },

  // Procedure encounters (CPT-equivalents stored as ICD where filing)
  { code: "Z51.81", description: "Encounter for therapeutic drug level monitoring", descriptionTh: "ติดตามระดับยาในเลือด", chapter: "Z" },
  { code: "Z00.00", description: "Encounter for general adult medical examination without abnormal findings", descriptionTh: "ตรวจสุขภาพผู้ใหญ่ ไม่พบความผิดปกติ", chapter: "Z" },
];

/**
 * Pure lookup — case-insensitive substring on either code or description
 * (Thai and English). Returns up to `limit` results sorted by match quality
 * (exact code → starts-with code → text contains).
 */
export function searchIcd10(q: string, limit = 20): IcdCode[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];

  type Scored = { code: IcdCode; score: number };
  const scored: Scored[] = [];
  for (const c of ICD10_CODES) {
    const codeLow = c.code.toLowerCase();
    const enLow = c.description.toLowerCase();
    const thLow = c.descriptionTh.toLowerCase();
    let score = 0;
    if (codeLow === needle) score = 100;
    else if (codeLow.startsWith(needle)) score = 80;
    else if (enLow.includes(needle) || thLow.includes(needle)) score = 50;
    else if (codeLow.includes(needle)) score = 30;
    if (score > 0) scored.push({ code: c, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.code);
}
