import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  AtSign,
  CalendarDays,
  Droplet,
  HeartPulse,
  LogOut,
  MapPin,
  PhoneCall,
  User as UserIcon,
} from "lucide-react";
import { getPatientSession } from "@/lib/session";
import { patientJson } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { patientLogoutAction } from "../../actions";

type Profile = {
  hn: string;
  first_name: string;
  last_name: string;
  nickname?: string;
  dob: string | null;
  gender: string | null;
  phone?: string;
  email?: string;
  blood_type: string | null;
  allergies: unknown;
  home_branch_id: string | null;
  line_linked: boolean;
  member_since: string;
};

export default async function ProfilePage() {
  const session = getPatientSession();
  if (!session) redirect("/login");
  const t = await getTranslations("profile");
  const tLogin = await getTranslations("login");

  let profile: Profile | null = null;
  try {
    const res = await patientJson<{ data: Profile }>(session, "/api/v1/patient/me");
    profile = res.data;
  } catch {
    /* fallthrough */
  }

  return (
    <>
      <PageHeader title={t("title")} />
      <main className="px-4 pt-4 pb-4 space-y-4 animate-fade-in">
        {/* Header card */}
        <section className="rounded-2xl border bg-card p-5 shadow-soft flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-primary-gradient text-white inline-flex items-center justify-center text-lg font-semibold">
            {(profile?.first_name ?? session.patient.first_name)[0]}
            {(profile?.last_name ?? session.patient.last_name)[0]}
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate">
              {profile?.first_name ?? session.patient.first_name}{" "}
              {profile?.last_name ?? session.patient.last_name}
            </p>
            <p className="text-[11px] text-muted-foreground">
              HN: {profile?.hn ?? session.patient.hn}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {profile?.line_linked ? t("line_linked") : t("line_not_linked")}
            </p>
          </div>
        </section>

        {/* Fields */}
        <section className="rounded-2xl border bg-card shadow-soft divide-y">
          <Row icon={<UserIcon />} label={t("gender")} value={profile?.gender ?? "—"} />
          <Row
            icon={<CalendarDays />}
            label={t("dob")}
            value={profile?.dob ? new Date(profile.dob).toLocaleDateString() : "—"}
          />
          <Row icon={<PhoneCall />} label={t("phone")} value={profile?.phone ?? "—"} />
          <Row icon={<AtSign />} label={t("email")} value={profile?.email ?? "—"} />
          <Row
            icon={<Droplet />}
            label={t("blood_type")}
            value={profile?.blood_type ?? "—"}
          />
          <Row
            icon={<HeartPulse />}
            label={t("allergies")}
            value={
              Array.isArray(profile?.allergies) && profile!.allergies!.length
                ? (profile!.allergies as string[]).join(", ")
                : "—"
            }
          />
          <Row
            icon={<MapPin />}
            label={t("home_branch")}
            value={profile?.home_branch_id ?? "—"}
          />
          <Row
            icon={<CalendarDays />}
            label={t("member_since")}
            value={
              profile?.member_since
                ? new Date(profile.member_since).toLocaleDateString()
                : "—"
            }
          />
        </section>

        {/* Logout */}
        <form action={patientLogoutAction}>
          <button
            type="submit"
            className="w-full h-12 rounded-xl border border-destructive/40 text-destructive hover:bg-destructive/5 transition flex items-center justify-center gap-2 text-sm font-medium"
          >
            <LogOut className="h-4 w-4" />
            {tLogin("logout")}
          </button>
        </form>
      </main>
    </>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="h-8 w-8 rounded-full bg-accent text-accent-foreground inline-flex items-center justify-center [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-sm truncate">{value}</p>
      </div>
    </div>
  );
}
