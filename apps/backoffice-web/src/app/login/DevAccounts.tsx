"use client";

import * as React from "react";
import {
  Briefcase,
  Check,
  Copy,
  Headset,
  HeartPulse,
  Pill,
  ShieldCheck,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type DevAccount = {
  icon: LucideIcon;
  role: string;
  phone: string;
  color: string;
};

const DEV_ACCOUNTS: DevAccount[] = [
  {
    icon: ShieldCheck,
    role: "ผู้ดูแลระบบ [ตั้งค่าระบบเริ่มต้น]",
    phone: "0800000001",
    color: "bg-violet-100 text-violet-700",
  },
  {
    icon: Briefcase,
    role: "ผู้จัดการสาขา [เห็นทุกเมนู เพื่อทดสอบ]",
    phone: "0800000002",
    color: "bg-blue-100 text-blue-700",
  },
  {
    icon: Stethoscope,
    role: "หมอแพทย์ [เมนูเกี่ยวกับงานหมอ]",
    phone: "0800000003",
    color: "bg-emerald-100 text-emerald-700",
  },
  {
    icon: HeartPulse,
    role: "พยาบาล [เมนูเกี่ยวกับงานพยาบาล]",
    phone: "0800000004",
    color: "bg-rose-100 text-rose-700",
  },
  {
    icon: Headset,
    role: "พนักงานต้อนรับ [รับ/Check-in]",
    phone: "0800000005",
    color: "bg-amber-100 text-amber-700",
  },
  {
    icon: Pill,
    role: "เภสัชกร [จ่ายยา]",
    phone: "0800000006",
    color: "bg-cyan-100 text-cyan-700",
  },
];

/**
 * Click-to-copy list of dev accounts on the login screen.
 *
 * The full row is a button so the click target is generous and works the same
 * with mouse, keyboard (Enter/Space), and screen readers. After a successful
 * copy we flash a check icon for ~1.2s as inline feedback in addition to the
 * toast — the toast can be missed if the user is already focused on the form.
 */
export default function DevAccounts() {
  const [copiedPhone, setCopiedPhone] = React.useState<string | null>(null);
  const resetTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  React.useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  async function copyPhone(phone: string) {
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(phone);
      } else {
        // Fallback for non-secure contexts (no Clipboard API).
        const ta = document.createElement("textarea");
        ta.value = phone;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedPhone(phone);
      toast.success("คัดลอกเบอร์โทรแล้ว", { description: phone });
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => setCopiedPhone(null), 1200);
    } catch {
      toast.error("คัดลอกไม่สำเร็จ", { description: phone });
    }
  }

  return (
    <ul className="space-y-1.5">
      {DEV_ACCOUNTS.map(({ icon: Icon, role, phone, color }) => {
        const isCopied = copiedPhone === phone;
        return (
          <li key={phone}>
            <button
              type="button"
              onClick={() => void copyPhone(phone)}
              aria-label={`คัดลอกเบอร์โทร ${phone} (${role})`}
              className="group flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-primary/40 hover:shadow-sm focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30 active:scale-[0.99]"
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                    color,
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <span className="text-xs font-medium text-slate-700">
                  {role}
                </span>
              </div>
              <span className="flex items-center gap-1.5 font-mono text-sm font-semibold tabular-nums text-slate-900 group-hover:text-primary">
                {phone}
                {isCopied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-slate-400 opacity-0 transition group-hover:opacity-100 group-focus:opacity-100" />
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
