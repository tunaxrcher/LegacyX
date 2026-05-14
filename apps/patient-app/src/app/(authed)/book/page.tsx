import { getTranslations } from "next-intl/server";
import { getPatientSession } from "@/lib/session";
import { patientJson } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { BookFlow } from "./BookFlow";

type Branch = {
  id: string;
  code: string;
  name: string;
  address: string | null;
};

export default async function BookPage() {
  const session = getPatientSession()!;
  const t = await getTranslations("book");
  let branches: Branch[] = [];
  try {
    const res = await patientJson<{ data: Branch[] }>(
      session,
      "/api/v1/patient/branches",
    );
    branches = res.data ?? [];
  } catch {
    /* empty state handled in client */
  }
  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <main className="px-4 pt-4 animate-fade-in">
        <BookFlow branches={branches} />
      </main>
    </>
  );
}
