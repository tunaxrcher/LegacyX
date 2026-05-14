import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 bg-background/85 backdrop-blur-md border-b pt-safe-top",
        className,
      )}
    >
      <div className="mx-auto max-w-md px-4 h-14 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold truncate">{title}</h1>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
        {right}
      </div>
    </header>
  );
}
