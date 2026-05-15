import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { ShieldCheck, Sparkles, Users } from "lucide-react";
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
          <div className="rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
            {/* {tLogin("dev_notice")} */}
            <br />
            <p className="mb-3 font-semibold text-slate-800">
              สำหรับทดสอบระบบ
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
                <span className="text-slate-600">ผู้ดูแลระบบ</span>
                <span className="font-medium tabular-nums text-slate-900">
                  0800000001
                </span>
              </div>
              <hr />
              <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
                <span className="text-slate-600">ผู้จัดการสาขา</span>
                <span className="font-medium tabular-nums text-slate-900">
                  0800000002
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
                <span className="text-slate-600">หมอแพทย์</span>
                <span className="font-medium tabular-nums text-slate-900">
                  0800000003
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
                <span className="text-slate-600">พยาบาล</span>
                <span className="font-medium tabular-nums text-slate-900">
                  0800000004
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
                <span className="text-slate-600">พนักงานต้อนรับ</span>
                <span className="font-medium tabular-nums text-slate-900">
                  0800000005
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
                <span className="text-slate-600">เภสัชกร</span>
                <span className="font-medium tabular-nums text-slate-900">
                  0800000006
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
