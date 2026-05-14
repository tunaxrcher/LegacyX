/**
 * Notification templates by `templateCode` + locale.
 *
 * Each template is a function taking the `payload` JSON stored on the
 * `NotificationLog` row and producing `{ title, text, html?, deepLink? }`.
 *
 * Locale support is simple TH-first / EN fallback. Future enhancement: per-
 * tenant overrides loaded from a CMS table.
 */

import type { ProviderMessage } from "./providers/types";

export type TemplateLocale = "th" | "en";

type TemplateFn = (
  payload: Record<string, unknown>,
  locale: TemplateLocale,
) => ProviderMessage;

function bookingUrl(): string {
  return process.env.PATIENT_APP_URL ?? "http://localhost:3004";
}
function bookUrl(): string {
  return `${bookingUrl()}/book`;
}
function visitsUrl(): string {
  return `${bookingUrl()}/visits`;
}
function walletUrl(): string {
  return `${bookingUrl()}/wallet`;
}

function fmtThaiDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const templates: Record<string, TemplateFn> = {
  // ---------------------------------------------------------------------------
  // appointment.confirmed — sent right after `appointment.created`.
  // ---------------------------------------------------------------------------
  "appointment.confirmed": (payload, locale) => {
    const at = String(payload.scheduled_at ?? "");
    if (locale === "th") {
      return {
        title: "ยืนยันการนัดหมาย",
        text: `ขอบคุณที่จองคิวกับ LegacyX Clinic! เราพบคุณวันที่ ${fmtThaiDate(at)} เวลา ${fmtTime(at)}.`,
        deepLink: visitsUrl(),
      };
    }
    return {
      title: "Appointment confirmed",
      text: `Thanks for booking with LegacyX Clinic! See you on ${fmtThaiDate(at)} at ${fmtTime(at)}.`,
      deepLink: visitsUrl(),
    };
  },

  // ---------------------------------------------------------------------------
  // review.request — sent D+3 after a completed visit.
  // ---------------------------------------------------------------------------
  "review.request": (_payload, locale) => {
    if (locale === "th") {
      return {
        title: "ให้คะแนนการบริการของเรา",
        text: "ขอบคุณที่ใช้บริการ LegacyX Clinic ครับ — รบกวนสละเวลาให้คะแนนเราหน่อยได้ไหมครับ ใช้เวลาเพียง 30 วินาที 🙏",
        deepLink: visitsUrl(),
      };
    }
    return {
      title: "How was your visit?",
      text: "Thanks for visiting LegacyX Clinic — would you take 30 seconds to share your feedback?",
      deepLink: visitsUrl(),
    };
  },

  // ---------------------------------------------------------------------------
  // rebooking.reminder — sent when last visit was 30 days ago and no upcoming
  // appointment exists.
  // ---------------------------------------------------------------------------
  "rebooking.reminder": (_payload, locale) => {
    if (locale === "th") {
      return {
        title: "ถึงเวลามาดูแลตัวเองอีกครั้ง",
        text: "ผ่านมา 1 เดือนแล้ว — แนะนำว่าให้กลับมาเช็คผิวอีกครั้ง กดจองคิวได้เลย ✨",
        deepLink: bookUrl(),
      };
    }
    return {
      title: "Time for your next visit",
      text: "It's been a month — book your next session in a few taps.",
      deepLink: bookUrl(),
    };
  },

  // ---------------------------------------------------------------------------
  // wallet.expiring — sent when a course balance has <=14 days left.
  // ---------------------------------------------------------------------------
  "wallet.expiring": (payload, locale) => {
    const productName = String(payload.product_name ?? "course");
    const daysLeft = Number(payload.days_left ?? 0);
    if (locale === "th") {
      return {
        title: "คอร์สใกล้หมดอายุ",
        text: `คอร์ส ${productName} ของคุณจะหมดอายุภายใน ${daysLeft} วัน — รีบใช้สิทธิ์ก่อนหมดอายุนะคะ 💛`,
        deepLink: walletUrl(),
      };
    }
    return {
      title: "Your course is expiring",
      text: `Your ${productName} course expires in ${daysLeft} days — use your remaining sessions now.`,
      deepLink: walletUrl(),
    };
  },

  // ---------------------------------------------------------------------------
  // birthday.bonus — sent on patient's birthday.
  // ---------------------------------------------------------------------------
  "birthday.bonus": (payload, locale) => {
    const firstName = String(payload.first_name ?? "");
    if (locale === "th") {
      return {
        title: "สุขสันต์วันเกิด 🎉",
        text: `สุขสันต์วันเกิด${firstName ? ` คุณ ${firstName}` : ""}! รับโบนัสพิเศษ 10% ในการจองครั้งถัดไป — ใช้ได้ภายใน 14 วันค่ะ 🎁`,
        deepLink: bookUrl(),
      };
    }
    return {
      title: "Happy birthday 🎉",
      text: `Happy birthday${firstName ? `, ${firstName}` : ""}! Enjoy a 10% bonus on your next booking — valid for 14 days.`,
      deepLink: bookUrl(),
    };
  },

  // ---------------------------------------------------------------------------
  // Manager alerts emitted by Phase 6.8 worker handlers.
  // ---------------------------------------------------------------------------
  "shift.variance_alert": (payload, locale) => {
    const variance = String(payload.variance ?? "0");
    const shiftId = String(payload.shift_id ?? "");
    if (locale === "th") {
      return {
        title: "เตือน: variance เงินสดสูง",
        text: `กะ ${shiftId} ปิดด้วย variance ${variance} บาท — โปรดตรวจสอบในระบบ`,
      };
    }
    return {
      title: "Alert: high cash variance",
      text: `Shift ${shiftId} closed with variance ${variance} — please verify in the system.`,
    };
  },
  "inventory.shrinkage_alert": (payload, locale) => {
    const items = Number(payload.item_count ?? 0);
    if (locale === "th") {
      return {
        title: "เตือน: สต็อกขาดหายจากการนับ",
        text: `พบสินค้า ${items} รายการที่มี variance ติดลบจากการ reconcile`,
      };
    }
    return {
      title: "Alert: inventory shrinkage",
      text: `${items} item(s) reconciled with negative variance.`,
    };
  },
};

export function renderTemplate(
  code: string,
  payload: Record<string, unknown> | null | undefined,
  locale: TemplateLocale = "th",
): ProviderMessage {
  const fn = templates[code];
  if (!fn) {
    return {
      title: code,
      text: `[${code}] ${JSON.stringify(payload ?? {})}`,
    };
  }
  return fn(payload ?? {}, locale);
}
