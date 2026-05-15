import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { ArrowLeft, Search } from "lucide-react";

type Service = {
  id: string;
  code: string;
  name: string;
  name_th: string;
  description: string | null;
  description_th: string | null;
  price_from: number | null;
  price_to: number | null;
  duration_min: number;
  image_url: string | null;
};

type CategoryDetail = {
  id: string;
  code: string;
  name: string;
  name_th: string;
  image_url: string | null;
};

type Payload = { category: CategoryDetail; services: Service[] };

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";

/**
 * Category detail screen — image 2 of the new flow.
 *
 * Pure read-only. Shows services within a category as cards with image, price
 * range and a CTA. Tapping "เลือกบริการนี้" navigates to either:
 *   - `/s/<id>/register` if the visitor has no session cookie, or
 *   - `/s/<id>/book` if they're already logged in.
 *
 * Decision happens in the link href so we avoid a redirect round-trip.
 */
export default async function CategoryPage({
  params,
}: {
  params: { code: string };
}) {
  const t = await getTranslations("category");
  const locale = await getLocale();

  let data: Payload | null = null;
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/public/categories/${params.code}/services?tenant_slug=legacyx`,
      { cache: "no-store" },
    );
    if (res.ok) {
      const json = (await res.json()) as { data: Payload };
      data = json.data;
    } else if (res.status === 404) {
      notFound();
    }
  } catch {
    /* fall through to empty state */
  }

  if (!data) notFound();
  const { category, services } = data;
  const title = locale === "th" ? category.name_th : category.name;

  return (
    <main className="mx-auto max-w-md px-4 pt-4 pb-6 animate-fade-in">
      {/* Header strip */}
      <div className="flex items-center justify-between mb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("back")}
        </Link>

        <button
          type="button"
          className="hidden md:inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition"
          disabled
        >
          <Search className="h-3.5 w-3.5" />
          {t("platinum_only")}
        </button>
      </div>

      <h1 className="text-2xl font-bold mb-4">
        {title}
        <span className="text-base font-normal text-muted-foreground ml-2">
          ({category.name_th})
        </span>
      </h1>

      {services.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <ul className="grid gap-4">
          {services.map((s) => (
            <ServiceCard key={s.id} service={s} locale={locale} />
          ))}
        </ul>
      )}
    </main>
  );
}

function priceLabel(s: Service, locale: string): string {
  if (s.price_from == null && s.price_to == null) {
    return locale === "th" ? "สอบถามราคา" : "Ask for price";
  }
  if (s.price_from === 0 && s.price_to == null) {
    return locale === "th" ? "เริ่มต้น 0.-" : "Starting 0.-";
  }
  if (s.price_from != null && s.price_to != null && s.price_from !== s.price_to) {
    return `${s.price_from.toLocaleString()} - ${s.price_to.toLocaleString()}.-`;
  }
  return `${(s.price_from ?? s.price_to ?? 0).toLocaleString()}.-`;
}

function ServiceCard({
  service,
  locale,
}: {
  service: Service;
  locale: string;
}) {
  const title = locale === "th" ? service.name_th : service.name;
  const desc = locale === "th" ? service.description_th : service.description;
  const price = priceLabel(service, locale);

  return (
    <li className="rounded-3xl border bg-card shadow-soft overflow-hidden">
      {/* Image */}
      <div className="relative aspect-[16/10] bg-muted">
        {service.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={service.image_url}
            alt={service.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
        {/* Price chip */}
        <span className="absolute bottom-3 left-3 rounded-full bg-white/90 backdrop-blur-md px-3 py-1 text-[11px] font-bold text-foreground shadow">
          {price}
        </span>
      </div>

      {/* Body */}
      <div className="p-4">
        <h3 className="font-bold text-base leading-snug">{title}</h3>
        {desc ? (
          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
            {desc}
          </p>
        ) : null}

        <Link
          href={`/s/${service.id}/register`}
          className="mt-4 block w-full rounded-2xl border bg-card py-3 text-center text-sm font-semibold hover:bg-accent/50 active:scale-[0.98] transition"
        >
          {locale === "th" ? "เลือกบริการนี้" : "Choose this service"}
        </Link>
      </div>
    </li>
  );
}
