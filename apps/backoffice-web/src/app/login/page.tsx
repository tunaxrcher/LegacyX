import Image from "next/image";
import { getTranslations } from "next-intl/server";
import {
  Briefcase,
  HeartPulse,
  Headset,
  KeyRound,
  Pill,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TestTube2,
  Users,
} from "lucide-react";
import LoginForm from "./LoginForm";
import { cn } from "@/lib/utils";

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

  const devAccounts = [
    {
      icon: ShieldCheck,
      role: "ผู้ดูแลระบบ",
      phone: "0800000001",
      color: "bg-violet-100 text-violet-700",
    },
    {
      icon: Briefcase,
      role: "ผู้จัดการสาขา",
      phone: "0800000002",
      color: "bg-blue-100 text-blue-700",
    },
    {
      icon: Stethoscope,
      role: "หมอแพทย์",
      phone: "0800000003",
      color: "bg-emerald-100 text-emerald-700",
    },
    {
      icon: HeartPulse,
      role: "พยาบาล",
      phone: "0800000004",
      color: "bg-rose-100 text-rose-700",
    },
    {
      icon: Headset,
      role: "พนักงานต้อนรับ",
      phone: "0800000005",
      color: "bg-amber-100 text-amber-700",
    },
    {
      icon: Pill,
      role: "เภสัชกร",
      phone: "0800000006",
      color: "bg-cyan-100 text-cyan-700",
    },
  ];

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex">
        {/* Video background — slightly blurred, muted, looping */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <iframe
            src="https://www.youtube-nocookie.com/embed/IzOJ8ujF9Bc?autoplay=1&mute=1&loop=1&playlist=IzOJ8ujF9Bc&controls=0&showinfo=0&modestbranding=1&iv_load_policy=3&playsinline=1&rel=0&disablekb=1&fs=0"
            title="Background video"
            tabIndex={-1}
            allow="autoplay; encrypted-media; picture-in-picture"
            className="absolute left-1/2 top-1/2 aspect-video min-h-[110vh] min-w-[110vw] -translate-x-1/2 -translate-y-1/2 scale-125 border-0"
            style={{ filter: "blur(3px)" }}
          />
          {/* Dark tint so the white text and gradient headline stay readable */}
          <div className="absolute inset-0 bg-sidebar/55" />
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.15),transparent_50%)]" />
        <div className="relative">
          <Image
            src="/logo.png"
            alt={tApp("name")}
            width={1000}
            height={234}
            priority
            className="h-12 w-auto object-contain"
          />
          <div className="mt-2 text-xs text-sidebar-foreground/60">
            {tApp("tagline")}
          </div>
        </div>

        <div className="relative space-y-6">
          <h2 className="max-w-md text-3xl font-bold leading-tight">
            ระบบจัดการคลินิกครบวงจร —<br />
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
            <Image
              src="/logo.png"
              alt={tApp("name")}
              width={1000}
              height={234}
              priority
              className="h-9 w-auto object-contain"
            />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">{tLogin("title")}</h1>
            <p className="text-sm text-muted-foreground">{tLogin("subtitle")}</p>
          </div>
          <LoginForm tenants={tenants} />
          <div className="rounded-xl border border-slate-300 bg-gradient-to-br from-slate-50 to-white p-4">
            <div className="mb-3 text-center">
              <div className="min-w-0 ">
                <p className="text-sm font-semibold text-slate-800">
                  บัญชีสำหรับทดสอบระบบ
                </p>
              </div>
            </div>

            <ul className="space-y-1.5">
              {devAccounts.map(({ icon: Icon, role, phone, color }) => (
                <li
                  key={phone}
                  className="group flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 transition hover:border-primary/40 hover:shadow-sm"
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
                  <span className="font-mono text-sm font-semibold tabular-nums text-slate-900 group-hover:text-primary">
                    {phone}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
