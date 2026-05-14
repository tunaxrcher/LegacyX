"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { UserPlus, Loader2 } from "lucide-react";
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

export function NewPatientDialog() {
  const router = useRouter();
  const t = useTranslations("patients");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [dob, setDob] = React.useState("");
  const [gender, setGender] = React.useState<string>("__none");
  const [nationalId, setNationalId] = React.useState("");
  const [bloodType, setBloodType] = React.useState("");
  const [allergies, setAllergies] = React.useState("");

  function reset() {
    setFirstName("");
    setLastName("");
    setPhone("");
    setDob("");
    setGender("__none");
    setNationalId("");
    setBloodType("");
    setAllergies("");
  }

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
      const res = await clientApi.post<{ data: { id: string; hn: string } }>(
        "/api/v1/patients",
        {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || undefined,
          dob: dob ? new Date(dob).toISOString() : undefined,
          gender: gender !== "__none" ? gender : undefined,
          national_id: nationalId.trim() || undefined,
          blood_type: bloodType.trim() || undefined,
          allergies: allergyList.length > 0 ? allergyList : undefined,
        },
      );
      toast.success(t("create_success", { hn: res.data.hn }));
      setOpen(false);
      reset();
      router.refresh();
      router.push(`/patients/${res.data.id}`);
    } catch (err) {
      toast.error(t("create_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4" /> {t("new")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("new_title")}</DialogTitle>
          <DialogDescription>{t("new_subtitle")}</DialogDescription>
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
              <Label htmlFor="phone">{t("phone")}</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="0812345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dob">{t("dob")}</Label>
              <Input
                id="dob"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
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

          <div className="space-y-2">
            <Label htmlFor="allergies">{t("allergies")}</Label>
            <Textarea
              id="allergies"
              rows={2}
              placeholder={t("allergies_placeholder")}
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("allergies_hint")}
            </p>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {tCommon("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
