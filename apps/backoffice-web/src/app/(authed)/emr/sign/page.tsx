import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import SignEmrForm from "./SignEmrForm";

export default async function SignEmrPage() {
  const t = await getTranslations("emr");
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <SignEmrForm />
    </div>
  );
}
