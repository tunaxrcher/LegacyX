"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Calendar, Clock, Loader2, MapPin, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { bookGuestAction, bookAuthedAction } from "./actions";

type Service = {
  id: string;
  code: string;
  name: string;
  name_th: string;
  description_th: string | null;
  price_from: number | null;
  price_to: number | null;
  duration_min: number;
};

type Branch = {
  id: string;
  code: string;
  name: string;
  address: string | null;
};

type Slot = { time_iso: string; label: string; available: boolean };

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
const GUEST_HANDOFF_KEY = "lx_pending_registration";

type Mode = "SCHEDULED" | "WALKIN";

type GuestRegistration = {
  serviceId: string;
  fullName: string;
  phone: string;
  kycImageDataUrl: string | null;
};

function isoDate(d: Date): string {
  // Always interpret as Asia/Bangkok for slot bucketing.
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

export function BookFlow({
  service,
  branches,
  hasSession,
  patientLabel,
}: {
  service: Service;
  branches: Branch[];
  hasSession: boolean;
  patientLabel: string | null;
}) {
  const t = useTranslations("book_v2");
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("SCHEDULED");
  const [branchId, setBranchId] = useState<string>(branches[0]?.id ?? "");
  const [date, setDate] = useState<string>(isoDate(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [guest, setGuest] = useState<GuestRegistration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Read guest handoff once on mount.
  useEffect(() => {
    if (hasSession) return;
    try {
      const raw = window.sessionStorage.getItem(GUEST_HANDOFF_KEY);
      if (raw) setGuest(JSON.parse(raw) as GuestRegistration);
    } catch {
      /* ignore */
    }
  }, [hasSession]);

  // Fetch slots when branch/date/mode changes.
  useEffect(() => {
    if (mode === "WALKIN") return;
    if (!branchId || !date) return;
    let cancelled = false;
    setLoadingSlots(true);
    fetch(
      `${API_BASE}/api/v1/public/slots?tenant_slug=legacyx&branch_id=${branchId}&date=${date}&service_id=${service.id}`,
      { cache: "no-store" },
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((j: { data: { slots: Slot[] } }) => {
        if (cancelled) return;
        setSlots(j.data.slots ?? []);
        setSelectedIso(null);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, date, mode, service.id]);

  // Auto-select today and walk-in mode locks date.
  useEffect(() => {
    if (mode === "WALKIN") setDate(isoDate(new Date()));
  }, [mode]);

  const branch = useMemo(
    () => branches.find((b) => b.id === branchId) ?? null,
    [branches, branchId],
  );

  function onSubmit() {
    setError(null);
    if (!branchId) {
      setError(t("err_pick_branch"));
      return;
    }
    if (mode === "SCHEDULED" && !selectedIso) {
      setError(t("err_pick_slot"));
      return;
    }
    if (!hasSession && !guest) {
      setError(t("err_no_identity"));
      return;
    }

    start(async () => {
      try {
        let session;
        if (hasSession) {
          // Logged-in flow — use staff/patient JWT-backed endpoint via server action.
          session = await bookAuthedAction({
            service_id: service.id,
            branch_id: branchId,
            mode,
            scheduled_at: mode === "SCHEDULED" ? selectedIso! : null,
          });
        } else {
          session = await bookGuestAction({
            service_id: service.id,
            branch_id: branchId,
            mode,
            scheduled_at: mode === "SCHEDULED" ? selectedIso! : null,
            full_name: guest!.fullName,
            phone: guest!.phone,
            kyc_image_data_url: guest!.kycImageDataUrl ?? null,
          });
        }
        // Clear handoff data once the appointment is locked in.
        try {
          window.sessionStorage.removeItem(GUEST_HANDOFF_KEY);
        } catch {
          /* ignore */
        }
        router.push(`/booking/${session.appointmentId}/success`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : t("err_book_failed"));
      }
    });
  }

  return (
    <div className="mt-5 space-y-5">
      {/* Mode tabs */}
      <div className="grid grid-cols-2 rounded-2xl bg-muted p-1">
        <button
          type="button"
          onClick={() => setMode("SCHEDULED")}
          className={cn(
            "rounded-xl py-2 text-sm font-medium transition",
            mode === "SCHEDULED"
              ? "bg-card shadow-soft text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("tab_scheduled")}
        </button>
        <button
          type="button"
          onClick={() => setMode("WALKIN")}
          className={cn(
            "rounded-xl py-2 text-sm font-medium transition inline-flex items-center justify-center gap-1.5",
            mode === "WALKIN"
              ? "bg-card shadow-soft text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Zap className="h-3.5 w-3.5" />
          {t("tab_walkin")}
        </button>
      </div>

      {/* Branch picker */}
      {branches.length > 1 ? (
        <div>
          <label className="block text-[10px] font-bold tracking-widest text-muted-foreground uppercase mb-1.5">
            {t("branch_label")}
          </label>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="w-full rounded-2xl border bg-background px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Mode-specific UI */}
      {mode === "SCHEDULED" ? (
        <>
          {/* Date */}
          <div>
            <label className="block text-[10px] font-bold tracking-widest text-muted-foreground uppercase mb-1.5">
              <Calendar className="inline h-3 w-3 mr-1 -mt-0.5" />
              {t("date_label")}
            </label>
            <input
              type="date"
              value={date}
              min={isoDate(new Date())}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-2xl border bg-background px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Slots */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              {t("slots_label")}
            </p>
            {loadingSlots ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : slots.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                {t("slots_empty")}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {slots.map((s, i) => (
                  <button
                    key={s.time_iso}
                    type="button"
                    disabled={!s.available}
                    onClick={() => setSelectedIso(s.time_iso)}
                    style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                    className={cn(
                      "rounded-xl border py-2.5 text-sm font-semibold transition-all duration-200 animate-slide-up",
                      !s.available &&
                        "opacity-40 cursor-not-allowed line-through bg-muted",
                      s.available &&
                        selectedIso === s.time_iso &&
                        "border-primary bg-primary text-primary-foreground scale-105 shadow-soft",
                      s.available &&
                        selectedIso !== s.time_iso &&
                        "hover:bg-accent hover:-translate-y-0.5 active:scale-[0.97]",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-2xl bg-accent/40 border p-4 flex items-start gap-3">
          <Zap className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <p className="font-semibold">{t("walkin_title")}</p>
            <p className="text-muted-foreground mt-0.5">{t("walkin_desc")}</p>
          </div>
        </div>
      )}

      {/* Patient summary card (image 4 bottom black card) */}
      <div className="rounded-2xl bg-foreground text-background p-4">
        <div className="flex items-start justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-background/70">
            {t("clinic_tier")}
          </span>
          <span className="rounded bg-background/10 px-2 py-0.5 text-[10px] font-mono">
            LX ID: 99-001
          </span>
        </div>
        <p className="font-bold text-lg mt-1.5">LegacyX Premium</p>
        <div className="flex items-center justify-between mt-2 text-xs">
          <span className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-[11px]">
              1
            </span>
            <span>{patientLabel ?? guest?.fullName ?? t("guest")}</span>
          </span>
          <span className="text-primary text-[11px] font-semibold">
            {t("fast_track")}
          </span>
        </div>
        {branch ? (
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-background/70">
            <MapPin className="h-3 w-3" />
            {branch.name}
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl bg-destructive/10 text-destructive text-xs px-3 py-2">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onSubmit}
        disabled={pending}
        className="btn-gradient w-full rounded-2xl font-semibold py-3.5 inline-flex items-center justify-center gap-2"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
        {t("submit")}
      </button>
    </div>
  );
}
