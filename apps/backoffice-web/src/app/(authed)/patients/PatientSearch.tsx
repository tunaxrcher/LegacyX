"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function PatientSearch({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const t = useTranslations("patients");
  const [value, setValue] = React.useState(defaultValue);

  // Debounced navigate
  React.useEffect(() => {
    const handle = setTimeout(() => {
      const q = value.trim();
      const url = q ? `/patients?q=${encodeURIComponent(q)}` : "/patients";
      router.replace(url);
    }, 300);
    return () => clearTimeout(handle);
  }, [value, router]);

  return (
    <div className="relative max-w-md">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("search_placeholder")}
        className="pl-9"
      />
    </div>
  );
}
