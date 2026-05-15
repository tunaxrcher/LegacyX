import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LogOut } from "lucide-react";
import { getPatientSession } from "@/lib/session";
import { patientJson } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { patientLogoutAction } from "../../actions";
import { LineSection } from "./LineSection";
import { ProfileEditor, type EditableProfile } from "./ProfileEditor";

type Profile = EditableProfile & {
  line_linked: boolean;
  line_display_name: string | null;
  line_picture_url: string | null;
  line_linked_at: string | null;
  line_notifications_opt_in: boolean;
  line_friend_status: "UNKNOWN" | "FRIEND" | "BLOCKED";
  member_since: string;
};

export default async function ProfilePage() {
  const session = getPatientSession();
  if (!session) redirect("/login");
  const t = await getTranslations("profile");
  const tLogin = await getTranslations("login");

  let profile: Profile | null = null;
  try {
    const res = await patientJson<{ data: Profile }>(
      session,
      "/api/v1/patient/me",
    );
    profile = res.data;
  } catch {
    /* fallthrough */
  }

  const initialEditable: EditableProfile = {
    hn: profile?.hn ?? session.patient.hn,
    first_name: profile?.first_name ?? session.patient.first_name,
    last_name: profile?.last_name ?? session.patient.last_name,
    nickname: profile?.nickname ?? null,
    dob: profile?.dob ?? null,
    gender: profile?.gender ?? null,
    phone: profile?.phone ?? null,
    email: profile?.email ?? null,
    blood_type: profile?.blood_type ?? null,
    allergies: profile?.allergies ?? [],
    home_branch_id: profile?.home_branch_id ?? null,
    home_branch_name: profile?.home_branch_name ?? null,
  };

  const lineLinked = !!profile?.line_linked;
  const linePictureUrl = profile?.line_picture_url ?? null;

  return (
    <>
      <PageHeader title={t("title")} />
      <main className="px-4 pt-4 pb-4 space-y-4">
        {/* Header card — avatar + name. Avatar uses the LINE picture when
            the patient has linked LINE; otherwise we fall back to initials. */}
        <section className="rounded-2xl border bg-card p-5 shadow-soft flex items-center gap-4">
          {lineLinked && linePictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={linePictureUrl}
              alt={profile?.line_display_name ?? "LINE"}
              className="h-14 w-14 rounded-full object-cover ring-2 ring-[#06C755]/40"
            />
          ) : (
            <div className="h-14 w-14 rounded-full bg-primary-gradient text-white inline-flex items-center justify-center text-lg font-semibold">
              {(initialEditable.first_name[0] ?? "").toUpperCase()}
              {(initialEditable.last_name[0] ?? "").toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold truncate">
              {initialEditable.first_name} {initialEditable.last_name}
            </p>
            <p className="text-[11px] text-muted-foreground">
              HN: {initialEditable.hn}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {lineLinked ? t("line_linked") : t("line_not_linked")}
            </p>
          </div>
        </section>

        {/* Editable personal details */}
        <ProfileEditor initial={initialEditable} />

        {/* Member since (read-only — internal accounting field) */}
        {profile?.member_since && (
          <p className="text-[11px] text-muted-foreground text-center">
            {t("member_since")}:{" "}
            {new Date(profile.member_since).toLocaleDateString()}
          </p>
        )}

        {/* LINE binding */}
        <LineSection
          initialLinked={profile?.line_linked ?? false}
          initialDisplayName={profile?.line_display_name ?? null}
          initialPictureUrl={profile?.line_picture_url ?? null}
          initialLinkedAt={profile?.line_linked_at ?? null}
          initialOptIn={profile?.line_notifications_opt_in ?? true}
          initialFriendStatus={profile?.line_friend_status ?? "UNKNOWN"}
          addFriendUrl={process.env.NEXT_PUBLIC_LINE_OA_ADD_FRIEND_URL}
        />

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
