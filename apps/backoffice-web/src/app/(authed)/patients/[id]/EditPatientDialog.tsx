"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { clientApi } from "@/lib/clientApi";

const GENDER_OPTIONS = [
  { value: "MALE", labelKey: "gender_male" },
  { value: "FEMALE", labelKey: "gender_female" },
  { value: "OTHER", labelKey: "gender_other" },
] as const;

type Props = {
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    nickname?: string | null;
    phone?: string | null;
    email?: string | null;
    nationalId?: string | null;
    dob?: string | null;
    gender?: string | null;
    bloodType?: string | null;
    allergies: unknown;
    chronicConditions: unknown;
  };
};

function listifyJson(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (v && typeof v === "object") return Object.values(v as object).map(String);
  return [];
}

export function EditPatientDialog({ patient }: Props) {
  const router = useRouter();
  const t = useTranslations("patients");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const [firstName, setFirstName] = React.useState(patient.firstName);
  const [lastName, setLastName] = React.useState(patient.lastName);
  const [nickname, setNickname] = React.useState(patient.nickname ?? "");
  const [phone, setPhone] = React.useState(patient.phone ?? "");
  const [email, setEmail] = React.useState(patient.email ?? "");
  const [nationalId, setNationalId] = React.useState(patient.nationalId ?? "");
  const [dob, setDob] = React.useState(
    patient.dob ? new Date(patient.dob).toISOString().slice(0, 10) : "",
  );
  const [gender, setGender] = React.useState(patient.gender ?? "__none");
  const [bloodType, setBloodType] = React.useState(patient.bloodType ?? "");
  const [allergies, setAllergies] = React.useState(
    listifyJson(patient.allergies).join(", "),
  );
  const [chronic, setChronic] = React.useState(
    listifyJson(patient.chronicConditions).join(", "),
  );

  // Re-sync local state if the patient prop changes (after a refresh)
  React.useEffect(() => {
    if (open) return;
    setFirstName(patient.firstName);
    setLastName(patient.lastName);
    setNickname(patient.nickname ?? "");
    setPhone(patient.phone ?? "");
    setEmail(patient.email ?? "");
    setNationalId(patient.nationalId ?? "");
    setDob(patient.dob ? new Date(patient.dob).toISOString().slice(0, 10) : "");
    setGender(patient.gender ?? "__none");
    setBloodType(patient.bloodType ?? "");
    setAllergies(listifyJson(patient.allergies).join(", "));
    setChronic(listifyJson(patient.chronicConditions).join(", "));
  }, [open, patient]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast.error(t("validation_name_required"));
      return;
    }
    setSubmitting(true);
    try {
      const allergyList = allergies
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      const chronicList = chronic
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      await clientApi.patch(`/api/v1/patients/${patient.id}`, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        nickname: nickname.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        national_id: nationalId.trim() || undefined,
        dob: dob ? new Date(dob).toISOString() : undefined,
        gender: gender !== "__none" ? gender : undefined,
        blood_type: bloodType.trim() || undefined,
        allergies: allergyList,
        chronic_conditions: chronicList,
      });
      toast.success(t("update_success") ?? "Patient updated");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(t("update_failed") ?? "Failed to update patient", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-3.5 w-3.5" />
          {tCommon("edit")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("edit_title") ?? "Edit patient"}</DialogTitle>
          <DialogDescription>
            {t("edit_subtitle") ??
              "PII fields are encrypted; previous values are decrypted on display."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="firstName">{t("first_name")}*</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">{t("last_name")}*</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="nickname">{t("nickname") ?? "Nickname"}</Label>
              <Input
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{t("phone")}</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="0812345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="dob">{t("dob")}</Label>
              <Input
                id="dob"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("email") ?? "Email"}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="gender">{t("gender")}</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger id="gender">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">
                    <span className="text-muted-foreground">— {t("not_specified")}</span>
                  </SelectItem>
                  {GENDER_OPTIONS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {t(g.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bloodType">{t("blood_type")}</Label>
              <Input
                id="bloodType"
                placeholder="A+, B-, …"
                value={bloodType}
                onChange={(e) => setBloodType(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nationalId">{t("national_id")}</Label>
            <Input
              id="nationalId"
              placeholder="1-2345-67890-12-3"
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="allergies">{t("allergies")}</Label>
              <Textarea
                id="allergies"
                rows={2}
                placeholder={t("allergies_placeholder")}
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chronic">{t("chronic")}</Label>
              <Textarea
                id="chronic"
                rows={2}
                placeholder={t("chronic_placeholder") ?? "DM, HT, …"}
                value={chronic}
                onChange={(e) => setChronic(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
