import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { getPatientSession } from "@/lib/session";
import { BookFlow } from "./BookFlow";

type Service = {
  id: string;
  code: string;
  name: string;
  name_th: string;
  description_th: string | null;
  price_from: number | null;
  price_to: number | null;
  duration_min: number;
  category: { id: string; code: string; name: string; name_th: string };
};

type Branch = {
  id: string;
  code: string;
  name: string;
  address: string | null;
};

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";

/**
 * Booking screen (image 4). Reachable in two modes:
 *   - As a guest who completed `/s/<id>/register` — guest payload sits in
 *     sessionStorage, the booking call carries name + phone + KYC + slot.
 *   - As a logged-in patient — guest payload is absent; the booking call uses
 *     the JWT instead via `/api/v1/patient/appointments` (existing endpoint).
 *
 * The page itself is a server component that fetches service + branch list,
 * then hands the data to `BookFlow` (client) which handles slot fetching +
 * mode tabs (นัดล่วงหน้า / walk-in) + submission.
 */
export default async function ServiceBookPage({
  params,
}: {
  params: { id: string };
}) {
  const session = getPatientSession();
  const t = await getTranslations("book_v2");

  let service: Service | null = null;
  let branches: Branch[] = [];

  try {
    const [svcRes, brRes] = await Promise.all([
      fetch(
        `${API_BASE}/api/v1/public/services/${params.id}?tenant_slug=legacyx`,
        { cache: "no-store" },
      ),
      fetch(`${API_BASE}/api/v1/public/branches?tenant_slug=legacyx`, {
        cache: "no-store",
      }),
    ]);
    if (svcRes.ok) {
      const json = (await svcRes.json()) as { data: Service };
      service = json.data;
    } else if (svcRes.status === 404) {
      notFound();
    }
    if (brRes.ok) {
      const json = (await brRes.json()) as { data: Branch[] };
      branches = json.data ?? [];
    }
  } catch {
    /* fall-through */
  }

  if (!service) notFound();

  return (
    <main className="mx-auto max-w-md px-4 pt-4 pb-10">
      <div className="mb-4">
        <Link
          href={
            // Logged-in patients skip /register (it auto-redirects to /book)
            // so going "back" there would deadloop. Always return to the
            // category page — that's the real previous step in the browse flow.
            session
              ? `/c/${service.category.code}`
              : `/s/${service.id}/register`
          }
          className="inline-flex items-center gap-1.5 -ml-2 px-2 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground active:bg-muted transition"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("back")}
        </Link>
      </div>

      <div className="rounded-3xl border bg-card shadow-soft-lg p-6">
        <h1 className="text-xl font-bold text-center">{t("title")}</h1>

        <BookFlow
          service={service}
          branches={branches}
          hasSession={!!session}
          patientLabel={
            session
              ? `${session.patient.first_name} ${session.patient.last_name} (${session.patient.hn})`
              : null
          }
        />
      </div>
    </main>
  );
}
