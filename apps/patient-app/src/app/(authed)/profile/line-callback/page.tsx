import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { getPatientSession } from "@/lib/session";
import { patientFetch } from "@/lib/api";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

/**
 * OAuth redirect target for LINE Login.
 *
 * URL: /profile/line-callback?code=...&state=...
 *
 * This is a SERVER component — when LINE redirects the browser here, we have
 * the cookie session in scope and can call the api-server with Bearer to
 * complete the binding. We render a tiny "Linked!" / "Failed" status card
 * with a CTA back to the profile.
 */
export default async function LineCallbackPage({
  searchParams,
}: {
  searchParams: { code?: string; state?: string; error?: string };
}) {
  const session = getPatientSession();
  if (!session) redirect("/login");
  const t = await getTranslations("profile");

  let success = false;
  let errorMessage: string | null = null;

  if (searchParams.error) {
    errorMessage = `LINE: ${searchParams.error}`;
  } else if (!searchParams.code || !searchParams.state) {
    errorMessage = t("line_err_generic");
  } else {
    const upstream = await patientFetch(
      session,
      "/api/v1/patient/me/line/link/callback",
      {
        method: "POST",
        body: JSON.stringify({
          code: searchParams.code,
          state: searchParams.state,
        }),
      },
    );
    if (upstream.ok) {
      success = true;
    } else {
      const json = (await upstream.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
      } | null;
      if (json?.error?.code === "CONFLICT") {
        errorMessage = t("line_err_already_linked");
      } else {
        errorMessage = json?.error?.message ?? t("line_err_generic");
      }
    }
  }

  return (
    <main className="px-4 pt-10 pb-10 min-h-[80vh] flex flex-col items-center justify-center animate-fade-in">
      <div className="w-full max-w-sm text-center space-y-4">
        {success ? (
          <>
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <h1 className="text-xl font-bold">{t("line_linked")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("line_section_subtitle")}
            </p>
          </>
        ) : (
          <>
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <XCircle className="h-9 w-9" />
            </div>
            <h1 className="text-xl font-bold">{t("line_err_generic")}</h1>
            {errorMessage && (
              <p className="text-xs text-destructive break-words">
                {errorMessage}
              </p>
            )}
          </>
        )}

        <Link
          href="/profile"
          className="inline-flex items-center justify-center rounded-full bg-foreground text-background px-8 py-3 text-sm font-semibold active:scale-[0.98] transition"
        >
          {t("title")}
        </Link>
      </div>
    </main>
  );
}
