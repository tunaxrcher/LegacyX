import { getTranslations } from "next-intl/server";
import { Stethoscope, ShieldCheck, Sparkles, Users } from "lucide-react";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

type Tenant = { id: string; slug: string; name: string };

async function fetchTenants(): Promise<Tenant[]> {
  const base = process.env.API_BASE_URL ?? "http://localhost:3001";
  try {
    const res = await fetch(`${base}/api/public/tenants`, { cache: "no-store" });
    if (!res.ok) return [];
    const body = (await res.json()) as { data: Tenant[] };
    return body.data ?? [];
  } catch {
    return [];
  }
}

export default async function LoginPage() {
  const tenants = await fetchTenants();
  const t = await getTranslations();
  const tApp = await getTranslations("app");
  const tLogin = await getTranslations("login");

  const features = [
    { icon: ShieldCheck, key: "PDPA-grade encryption" },
    { icon: Sparkles, key: "AI assistive drafts with human approval" },
    { icon: Users, key: "Multi-tenant, multi-branch" },
  ];

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <section className="relative hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.15),transparent_50%)]" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-semibold">{tApp("name")}</div>
            <div className="text-xs text-sidebar-foreground/60">{tApp("tagline")}</div>
          </div>
        </div>

        <div className="relative space-y-6">
          <h2 className="max-w-md text-3xl font-bold leading-tight">
            {t("login.title")} —<br />
            <span className="bg-gradient-to-r from-primary to-info bg-clip-text text-transparent">
              built for clinical excellence.
            </span>
          </h2>
          <ul className="space-y-3">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-sidebar-foreground/80">
                <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <f.icon className="h-4 w-4" />
                </div>
                <span>{f.key}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative text-xs text-sidebar-foreground/50">
          © {new Date().getFullYear()} LegacyX Clinic
        </div>
      </section>

      {/* Form panel */}
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2 lg:hidden">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Stethoscope className="h-4 w-4" />
              </div>
              <span className="text-base font-semibold">{tApp("name")}</span>
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">{tLogin("title")}</h1>
            <p className="text-sm text-muted-foreground">{tLogin("subtitle")}</p>
          </div>
          <LoginForm tenants={tenants} />
          <div className="rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
            {tLogin("dev_notice")}
          </div>
        </div>
      </section>
    </main>
  );
}
