"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { cn, ymd } from "@/lib/utils";

type Branch = {
  id: string;
  code: string;
  name: string;
  address: string | null;
};
type Slot = { time_iso: string; label: string; available: boolean };

export function BookFlow({ branches }: { branches: Branch[] }) {
  const t = useTranslations("book");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [branchId, setBranchId] = useState<string>(branches[0]?.id ?? "");
  const [date, setDate] = useState<string>(ymd(new Date(Date.now() + 86_400_000))); // tomorrow
  const [slot, setSlot] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, startSubmit] = useTransition();
  const [done, setDone] = useState<{ date: string; time: string } | null>(null);

  // Generate next-7-days options
  const nextDays = useMemo(() => {
    const out: { value: string; label: string; weekday: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(now.getTime() + i * 86_400_000);
      out.push({
        value: ymd(d),
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
      });
    }
    return out;
  }, []);

  // Re-fetch slots when branch or date changes
  useEffect(() => {
    if (!branchId || !date) return;
    setSlot("");
    setLoadingSlots(true);
    fetch(`/api/slots?branch_id=${branchId}&date=${date}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ data: { slots: Slot[] } }>;
      })
      .then((j) => setSlots(j.data.slots ?? []))
      .catch(() => {
        toast.error(t("load_error"));
        setSlots([]);
      })
      .finally(() => setLoadingSlots(false));
  }, [branchId, date, t]);

  async function onSubmit() {
    if (!branchId || !slot) return;
    startSubmit(async () => {
      try {
        const res = await fetch(`/api/book`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            branch_id: branchId,
            scheduled_at: slot,
            reason: reason || undefined,
          }),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || res.statusText);
        }
        const j = (await res.json()) as { data: { scheduled_at: string } };
        const d = new Date(j.data.scheduled_at);
        setDone({
          date: d.toLocaleDateString(),
          time: d.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          }),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Booking failed";
        toast.error(msg);
      }
    });
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center space-y-5 animate-slide-up">
        <div className="h-16 w-16 rounded-full bg-success/15 text-success flex items-center justify-center">
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{t("success_title")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("success_msg", { date: done.date, time: done.time })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="h-11 px-6 rounded-xl bg-primary-gradient text-white font-medium shadow-soft"
        >
          {t("success_done")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Branch */}
      <section>
        <p className="text-sm font-semibold mb-2 px-1">{t("step_branch")}</p>
        {branches.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("load_error")}</p>
        ) : (
          <ul className="grid gap-2">
            {branches.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setBranchId(b.id)}
                  className={cn(
                    "w-full text-left rounded-xl border p-3.5 transition flex items-start gap-3",
                    branchId === b.id
                      ? "border-primary bg-accent/40 shadow-soft"
                      : "bg-card hover:bg-accent/20",
                  )}
                >
                  <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{b.name}</span>
                    {b.address && (
                      <span className="block text-[11px] text-muted-foreground truncate">
                        {b.address}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Date */}
      <section>
        <p className="text-sm font-semibold mb-2 px-1">{t("step_date")}</p>
        <div className="-mx-4 px-4 overflow-x-auto">
          <ul className="flex gap-2 min-w-max">
            {nextDays.map((d) => (
              <li key={d.value}>
                <button
                  type="button"
                  onClick={() => setDate(d.value)}
                  className={cn(
                    "w-16 rounded-xl border py-2 px-1 text-center transition",
                    date === d.value
                      ? "border-primary bg-primary text-primary-foreground shadow-soft"
                      : "bg-card hover:bg-accent/30",
                  )}
                >
                  <p className="text-[10px] uppercase tracking-wide opacity-80">
                    {d.weekday}
                  </p>
                  <p className="text-sm font-semibold">{d.label}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Time */}
      <section>
        <p className="text-sm font-semibold mb-2 px-1">{t("step_time")}</p>
        {loadingSlots ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {tCommon("loading")}
          </div>
        ) : slots.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            {t("no_slots")}
          </p>
        ) : (
          <ul className="grid grid-cols-4 gap-2">
            {slots.map((s) => (
              <li key={s.time_iso}>
                <button
                  type="button"
                  disabled={!s.available}
                  onClick={() => setSlot(s.time_iso)}
                  className={cn(
                    "w-full rounded-lg border h-10 text-sm font-medium transition",
                    !s.available
                      ? "bg-muted text-muted-foreground/60 line-through cursor-not-allowed"
                      : slot === s.time_iso
                        ? "border-primary bg-primary text-primary-foreground shadow-soft"
                        : "bg-card hover:bg-accent/30",
                  )}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Reason */}
      <section>
        <p className="text-sm font-semibold mb-2 px-1">{t("step_reason")}</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("reason_placeholder")}
          rows={3}
          className="w-full rounded-xl border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </section>

      {/* Submit */}
      <button
        type="button"
        disabled={!branchId || !slot || submitting}
        onClick={onSubmit}
        className="w-full h-12 rounded-xl bg-primary-gradient text-white font-semibold shadow-soft disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("submitting")}
          </>
        ) : (
          t("submit")
        )}
      </button>
    </div>
  );
}
