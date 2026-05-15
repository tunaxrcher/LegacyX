"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { AlertTriangle, Check, ExternalLink, Loader2 } from "lucide-react";

/**
 * LINE binding panel for the patient profile page.
 *
 * Renders three states depending on the patient's current binding:
 *   1. Not linked → big "Link LINE" button (POSTs /line/link/start, redirects
 *      to LINE's OAuth screen).
 *   2. Linked + friend → name + picture + opt-in toggle + unlink button.
 *   3. Linked + blocked → red banner asking the patient to re-add the OA.
 */

type Props = {
  initialLinked: boolean;
  initialDisplayName?: string | null;
  initialPictureUrl?: string | null;
  initialLinkedAt?: string | null;
  initialOptIn: boolean;
  initialFriendStatus: "UNKNOWN" | "FRIEND" | "BLOCKED";
  addFriendUrl?: string;
};

export function LineSection({
  initialLinked,
  initialDisplayName,
  initialPictureUrl,
  initialLinkedAt,
  initialOptIn,
  initialFriendStatus,
  addFriendUrl,
}: Props) {
  const t = useTranslations("profile");
  const router = useRouter();

  const [linked, setLinked] = useState(initialLinked);
  const [displayName, setDisplayName] = useState(initialDisplayName ?? null);
  const [pictureUrl, setPictureUrl] = useState(initialPictureUrl ?? null);
  const [linkedAt, setLinkedAt] = useState(initialLinkedAt ?? null);
  const [optIn, setOptIn] = useState(initialOptIn);
  const [friendStatus, setFriendStatus] = useState(initialFriendStatus);

  const [error, setError] = useState<string | null>(null);
  const [bindingPending, startBinding] = useTransition();
  const [unlinkingPending, startUnlinking] = useTransition();
  const [optInPending, startOptIn] = useTransition();

  const onBind = () => {
    setError(null);
    startBinding(async () => {
      try {
        const res = await fetch("/api/line/start", { method: "POST" });
        const json = await res.json();
        if (!res.ok || !json?.data?.authorize_url) {
          setError(json?.error?.message ?? t("line_err_generic"));
          return;
        }
        window.location.href = json.data.authorize_url as string;
      } catch {
        setError(t("line_err_generic"));
      }
    });
  };

  const onUnlink = () => {
    if (!window.confirm(t("line_unlink_confirm"))) return;
    setError(null);
    startUnlinking(async () => {
      try {
        const res = await fetch("/api/line/unlink", { method: "POST" });
        const json = await res.json();
        if (!res.ok) {
          setError(json?.error?.message ?? t("line_err_generic"));
          return;
        }
        setLinked(false);
        setDisplayName(null);
        setPictureUrl(null);
        setLinkedAt(null);
        setOptIn(true);
        setFriendStatus("UNKNOWN");
        router.refresh();
      } catch {
        setError(t("line_err_generic"));
      }
    });
  };

  const onToggleOptIn = (next: boolean) => {
    const previous = optIn;
    setOptIn(next);
    startOptIn(async () => {
      try {
        const res = await fetch("/api/line/preferences", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ line_opt_in: next }),
        });
        if (!res.ok) {
          setOptIn(previous);
          const json = await res.json().catch(() => ({}));
          setError(json?.error?.message ?? t("line_err_generic"));
        }
      } catch {
        setOptIn(previous);
        setError(t("line_err_generic"));
      }
    });
  };

  return (
    <section className="rounded-2xl border bg-card shadow-soft p-4 space-y-3">
      <header>
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-[#06C755]" />
          {t("line_section_title")}
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {t("line_section_subtitle")}
        </p>
      </header>

      {!linked ? (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            {t("line_consent_note")}
          </p>
          <button
            type="button"
            onClick={onBind}
            disabled={bindingPending}
            className="w-full h-11 rounded-xl bg-[#06C755] text-white text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition"
          >
            {bindingPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("line_binding")}
              </>
            ) : (
              <>
                {/* LINE wordmark glyph */}
                <span className="font-bold tracking-tight text-base leading-none">
                  LINE
                </span>
                {t("line_bind_cta")}
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Header row: avatar + name */}
          <div className="flex items-center gap-3">
            {pictureUrl ? (
              <Image
                src={pictureUrl}
                alt={displayName ?? "LINE"}
                width={40}
                height={40}
                unoptimized
                className="h-10 w-10 rounded-full object-cover ring-2 ring-[#06C755]/40"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-[#06C755]/15 text-[#06C755] inline-flex items-center justify-center text-xs font-bold">
                LINE
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">
                {t("line_linked_as")}
              </p>
              <p className="text-sm font-medium truncate">
                {displayName ?? "LINE User"}
              </p>
              {linkedAt && (
                <p className="text-[10px] text-muted-foreground">
                  {t("line_linked_at")}{" "}
                  {new Date(linkedAt).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
              <Check className="h-3 w-3" />
            </div>
          </div>

          {/* Blocked / not-friend warning */}
          {friendStatus === "BLOCKED" && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900 text-[11px] space-y-2">
              <p className="font-semibold inline-flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t("line_friend_warning_title")}
              </p>
              <p>{t("line_friend_warning_body")}</p>
              {addFriendUrl && (
                <a
                  href={addFriendUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-amber-900 underline"
                >
                  {t("line_add_friend_cta")}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          {/* Opt-in toggle */}
          <label className="flex items-center justify-between py-1.5 cursor-pointer">
            <span className="text-sm">{t("line_optin_label")}</span>
            <input
              type="checkbox"
              checked={optIn}
              disabled={optInPending}
              onChange={(e) => onToggleOptIn(e.target.checked)}
              className="h-5 w-9 appearance-none rounded-full bg-muted relative checked:bg-[#06C755] transition before:absolute before:top-0.5 before:left-0.5 before:h-4 before:w-4 before:rounded-full before:bg-white before:shadow checked:before:translate-x-4 before:transition"
            />
          </label>

          {/* Unlink */}
          <button
            type="button"
            onClick={onUnlink}
            disabled={unlinkingPending}
            className="w-full h-10 rounded-xl border text-xs text-destructive hover:bg-destructive/5 disabled:opacity-60 transition"
          >
            {unlinkingPending ? t("line_unlinking") : t("line_unlink")}
          </button>
        </div>
      )}

      {error && (
        <p className="text-[11px] text-destructive">{error}</p>
      )}
    </section>
  );
}
