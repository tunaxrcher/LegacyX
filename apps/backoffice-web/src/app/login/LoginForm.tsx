"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { LogIn, AlertCircle, Loader2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { loginAction, type LoginResult } from "./actions";

type Tenant = { id: string; slug: string; name: string };
type Props = {
  tenants: Tenant[];
  defaultTenantSlug?: string;
  defaultEmail?: string;
};

const initialState: LoginResult = { ok: true, submitted: false };

export default function LoginForm({
  tenants,
  defaultTenantSlug,
  defaultEmail,
}: Props) {
  const t = useTranslations("login");
  const router = useRouter();
  const [state, formAction] = useFormState(loginAction, initialState);
  const [tenantSlug, setTenantSlug] = React.useState<string>(
    defaultTenantSlug ?? tenants[0]?.slug ?? "legacyx",
  );

  // Redirect on successful submit (we deliberately don't `redirect()` inside
  // the server action because it breaks useFormState).
  React.useEffect(() => {
    if (state.ok && "submitted" in state && state.submitted) {
      router.replace("/");
      router.refresh();
    }
  }, [state, router]);

  const error = state.ok === false ? state.error : null;

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="tenant_slug">{t("tenant")}</Label>
        {tenants.length > 0 ? (
          <>
            <input type="hidden" name="tenant_slug" value={tenantSlug} />
            <Select value={tenantSlug} onValueChange={setTenantSlug}>
              <SelectTrigger id="tenant_slug">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((tn) => (
                  <SelectItem key={tn.id} value={tn.slug}>
                    <span className="font-medium">{tn.name}</span>
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                      {tn.slug}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : (
          // Fallback: free-text input if /public/tenants is unavailable
          <Input
            id="tenant_slug"
            name="tenant_slug"
            autoComplete="organization"
            defaultValue={defaultTenantSlug ?? "legacyx"}
            placeholder="legacyx"
            required
          />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={defaultEmail ?? "admin@legacyx.local"}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={6}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <SubmitButton label={t("sign_in")} pendingLabel={t("signing_in")} />
    </form>
  );
}

function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
      {pending ? pendingLabel : label}
    </Button>
  );
}
