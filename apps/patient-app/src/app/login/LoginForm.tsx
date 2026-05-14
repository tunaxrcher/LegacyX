"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { patientLoginAction } from "../actions";
import { getLiffProfile } from "@/lib/liff";

type Labels = {
  tenant: string;
  line: string;
  lineHint: string;
  submit: string;
  loading: string;
  demoHint: string;
  error: string;
};

export function LoginForm({ labels }: { labels: Labels }) {
  const [tenant, setTenant] = useState("legacyx");
  const [lineId, setLineId] = useState("U_demo_line_0000001");
  const [pending, startTransition] = useTransition();
  const [liffMode, setLiffMode] = useState<"detecting" | "real" | "mock">(
    "detecting",
  );

  // Attempt to bootstrap from real LIFF on mount. Falls back silently to mock.
  useEffect(() => {
    let cancelled = false;
    void getLiffProfile().then(({ mode, profile }) => {
      if (cancelled) return;
      setLiffMode(mode);
      if (profile?.userId) setLineId(profile.userId);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await patientLoginAction(fd);
      } catch (err) {
        const message = err instanceof Error ? err.message : labels.error;
        // NEXT_REDIRECT is thrown intentionally on success — ignore.
        if (message.includes("NEXT_REDIRECT")) return;
        toast.error(labels.error, { description: message });
      }
    });
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          {labels.tenant}
        </label>
        <input
          name="tenant_slug"
          value={tenant}
          onChange={(e) => setTenant(e.target.value)}
          autoComplete="off"
          required
          className="w-full h-11 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          {labels.line}
        </label>
        <input
          name="line_user_id"
          value={lineId}
          onChange={(e) => setLineId(e.target.value)}
          autoComplete="off"
          required
          disabled={liffMode === "real"}
          className="w-full h-11 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
        <p className="text-[11px] text-muted-foreground leading-snug">
          {labels.lineHint}
        </p>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full h-12 rounded-xl bg-primary-gradient text-white font-medium shadow-soft hover:opacity-95 active:scale-[0.99] transition disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> {labels.loading}
          </>
        ) : (
          labels.submit
        )}
      </button>
      {liffMode !== "real" && (
        <p className="text-center text-[11px] text-muted-foreground">
          {labels.demoHint}
        </p>
      )}
    </form>
  );
}
