"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AtSign,
  CalendarDays,
  Check,
  Droplet,
  HeartPulse,
  MapPin,
  PencilLine,
  PhoneCall,
  Plus,
  User as UserIcon,
  X,
  Loader2,
} from "lucide-react";

/**
 * Editable patient profile card.
 *
 * Two display modes:
 *   - Read mode: pretty list of rows with a single "Edit" button (default).
 *   - Edit mode: same rows but with form controls; "Save" PATCHes the
 *     `/api/profile` proxy and re-fetches the latest profile from the server.
 *
 * Allergies are managed as chips — type, hit Enter (or comma) to add,
 * click the × on a chip to remove. We keep `firstName` / `lastName` as
 * read-only because those are tied to the EMR and need a staff edit.
 */

export type EditableProfile = {
  hn: string;
  first_name: string;
  last_name: string;
  nickname?: string | null;
  dob: string | null;
  gender: "MALE" | "FEMALE" | "OTHER" | "UNDISCLOSED" | null;
  phone?: string | null;
  email?: string | null;
  blood_type: string | null;
  allergies: unknown;
  home_branch_id: string | null;
  home_branch_name: string | null;
};

type Branch = { id: string; code: string; name: string };

type Form = {
  nickname: string;
  dob: string; // YYYY-MM-DD for the <input type="date">
  gender: "" | "MALE" | "FEMALE" | "OTHER" | "UNDISCLOSED";
  phone: string;
  email: string;
  blood_type: string;
  allergies: string[];
  home_branch_id: string;
};

const BLOOD_TYPES = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
  "A",
  "B",
  "AB",
  "O",
];

function toForm(p: EditableProfile): Form {
  let dobStr = "";
  if (p.dob) {
    const d = new Date(p.dob);
    if (!Number.isNaN(d.getTime())) {
      dobStr = d.toISOString().slice(0, 10);
    }
  }
  return {
    nickname: p.nickname ?? "",
    dob: dobStr,
    gender: (p.gender ?? "") as Form["gender"],
    phone: p.phone ?? "",
    email: p.email ?? "",
    blood_type: p.blood_type ?? "",
    allergies: Array.isArray(p.allergies)
      ? (p.allergies as unknown[]).filter((s): s is string => typeof s === "string")
      : [],
    home_branch_id: p.home_branch_id ?? "",
  };
}

export function ProfileEditor({
  initial,
}: {
  initial: EditableProfile;
}) {
  const t = useTranslations("profile");
  const router = useRouter();

  const [profile, setProfile] = useState<EditableProfile>(initial);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form>(() => toForm(initial));
  const [allergyDraft, setAllergyDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [pending, startTransition] = useTransition();

  // Resolve branch name even when the server hasn't supplied one (e.g. legacy
  // profile without `home_branch_name`). Once branches load we pick the
  // matching name client-side.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/branches", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => {
        if (cancelled) return;
        setBranches(((j?.data as Branch[]) ?? []).map((b) => ({
          id: b.id,
          code: b.code,
          name: b.name,
        })));
      })
      .catch(() => {
        /* leave empty — picker shows current id only */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const homeBranchLabel = useMemo(() => {
    if (profile.home_branch_name) return profile.home_branch_name;
    if (!profile.home_branch_id) return "—";
    const match = branches.find((b) => b.id === profile.home_branch_id);
    return match?.name ?? profile.home_branch_id;
  }, [profile.home_branch_id, profile.home_branch_name, branches]);

  const onEdit = () => {
    setForm(toForm(profile));
    setAllergyDraft("");
    setError(null);
    setEditing(true);
  };

  const onCancel = () => {
    setEditing(false);
    setError(null);
  };

  const onAddAllergy = () => {
    const v = allergyDraft.trim();
    if (!v) return;
    if (form.allergies.includes(v)) {
      setAllergyDraft("");
      return;
    }
    setForm({ ...form, allergies: [...form.allergies, v] });
    setAllergyDraft("");
  };

  const onRemoveAllergy = (i: number) => {
    setForm({
      ...form,
      allergies: form.allergies.filter((_, idx) => idx !== i),
    });
  };

  const onSave = () => {
    setError(null);
    // Build a payload that only includes touched / non-empty distinctions.
    // The API treats `null` as "clear this field" and undefined as "leave it
    // alone" — but the editor presents all fields, so we always send the
    // current state, mapping empty strings → null to match server semantics.
    const payload: Record<string, unknown> = {
      nickname: form.nickname.trim() || null,
      dob: form.dob || null,
      gender: form.gender || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      blood_type: form.blood_type || null,
      allergies: form.allergies,
      home_branch_id: form.home_branch_id || null,
    };

    startTransition(async () => {
      try {
        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(
            (json as { error?: { message?: string } })?.error?.message ??
              t("save_error"),
          );
          return;
        }
        const data = (json as { data: EditableProfile }).data;
        setProfile(data);
        setForm(toForm(data));
        setEditing(false);
        // Refresh server components on the page (e.g. avatar in welcome strip).
        router.refresh();
      } catch {
        setError(t("save_error"));
      }
    });
  };

  if (!editing) {
    return (
      <section className="rounded-2xl border bg-card shadow-soft divide-y">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("section_personal")}
          </p>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
          >
            <PencilLine className="h-3.5 w-3.5" />
            {t("edit")}
          </button>
        </div>
        <Row icon={<UserIcon />} label={t("nickname")} value={profile.nickname || "—"} />
        <Row icon={<UserIcon />} label={t("gender")} value={genderLabel(profile.gender, t)} />
        <Row
          icon={<CalendarDays />}
          label={t("dob")}
          value={profile.dob ? new Date(profile.dob).toLocaleDateString() : "—"}
        />
        <Row icon={<PhoneCall />} label={t("phone")} value={profile.phone || "—"} />
        <Row icon={<AtSign />} label={t("email")} value={profile.email || "—"} />
        <Row icon={<Droplet />} label={t("blood_type")} value={profile.blood_type || "—"} />
        <Row
          icon={<HeartPulse />}
          label={t("allergies")}
          value={
            Array.isArray(profile.allergies) && profile.allergies.length
              ? (profile.allergies as string[]).join(", ")
              : "—"
          }
        />
        <Row icon={<MapPin />} label={t("home_branch")} value={homeBranchLabel} />
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-card shadow-soft p-4 space-y-4">
      <header className="flex items-center justify-between">
        <p className="text-sm font-semibold">{t("edit_title")}</p>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <X className="h-3.5 w-3.5" />
          {t("cancel")}
        </button>
      </header>

      <Field label={t("nickname")} icon={<UserIcon />}>
        <input
          type="text"
          value={form.nickname}
          onChange={(e) => setForm({ ...form, nickname: e.target.value })}
          maxLength={80}
          className="form-input"
          placeholder={t("nickname_placeholder")}
        />
      </Field>

      <Field label={t("gender")} icon={<UserIcon />}>
        <select
          value={form.gender}
          onChange={(e) =>
            setForm({ ...form, gender: e.target.value as Form["gender"] })
          }
          className="form-input"
        >
          <option value="">—</option>
          <option value="MALE">{t("gender_male")}</option>
          <option value="FEMALE">{t("gender_female")}</option>
          <option value="OTHER">{t("gender_other")}</option>
          <option value="UNDISCLOSED">{t("gender_undisclosed")}</option>
        </select>
      </Field>

      <Field label={t("dob")} icon={<CalendarDays />}>
        <input
          type="date"
          value={form.dob}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setForm({ ...form, dob: e.target.value })}
          className="form-input"
        />
      </Field>

      <Field label={t("phone")} icon={<PhoneCall />}>
        <input
          type="tel"
          inputMode="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          maxLength={20}
          className="form-input"
          placeholder="08X-XXX-XXXX"
        />
      </Field>

      <Field label={t("email")} icon={<AtSign />}>
        <input
          type="email"
          inputMode="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          maxLength={120}
          className="form-input"
          placeholder="name@example.com"
        />
      </Field>

      <Field label={t("blood_type")} icon={<Droplet />}>
        <select
          value={form.blood_type}
          onChange={(e) => setForm({ ...form, blood_type: e.target.value })}
          className="form-input"
        >
          <option value="">—</option>
          {BLOOD_TYPES.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t("allergies")} icon={<HeartPulse />}>
        <div className="space-y-2">
          {form.allergies.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {form.allergies.map((a, i) => (
                <li
                  key={`${a}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full bg-accent text-accent-foreground px-2.5 py-1 text-xs"
                >
                  <span>{a}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveAllergy(i)}
                    className="hover:text-destructive"
                    aria-label={t("remove")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={allergyDraft}
              onChange={(e) => setAllergyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  onAddAllergy();
                }
              }}
              placeholder={t("allergy_placeholder")}
              maxLength={80}
              className="form-input flex-1"
            />
            <button
              type="button"
              onClick={onAddAllergy}
              disabled={!allergyDraft.trim()}
              className="inline-flex items-center gap-1 rounded-xl border bg-card px-3 text-xs font-medium hover:bg-accent disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("add")}
            </button>
          </div>
        </div>
      </Field>

      <Field label={t("home_branch")} icon={<MapPin />}>
        <select
          value={form.home_branch_id}
          onChange={(e) =>
            setForm({ ...form, home_branch_id: e.target.value })
          }
          className="form-input"
        >
          <option value="">{t("home_branch_none")}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </Field>

      {error && (
        <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="flex-1 h-11 rounded-xl border bg-card text-sm font-medium hover:bg-accent transition disabled:opacity-60"
        >
          {t("cancel")}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-60"
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("saving")}
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              {t("save")}
            </>
          )}
        </button>
      </div>

      <style>{`
        .form-input {
          height: 2.5rem;
          width: 100%;
          border-radius: 0.625rem;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          padding: 0 0.75rem;
          font-size: 0.875rem;
          color: hsl(var(--foreground));
        }
        .form-input:focus {
          outline: none;
          border-color: hsl(var(--primary));
          box-shadow: 0 0 0 3px hsl(var(--primary) / 0.15);
        }
      `}</style>
    </section>
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

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-2 mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span className="[&_svg]:h-3.5 [&_svg]:w-3.5 inline-flex">{icon}</span>
        {label}
      </label>
      {children}
    </div>
  );
}

function genderLabel(
  g: EditableProfile["gender"],
  t: (k: string) => string,
): string {
  switch (g) {
    case "MALE":
      return t("gender_male");
    case "FEMALE":
      return t("gender_female");
    case "OTHER":
      return t("gender_other");
    case "UNDISCLOSED":
      return t("gender_undisclosed");
    default:
      return "—";
  }
}
