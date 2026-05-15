import { Skeleton } from "@/components/skeleton";

export default function CategoryLoading() {
  return (
    <main className="mx-auto max-w-md px-4 pt-4 pb-6">
      <Skeleton className="h-5 w-24 mb-4" rounded="rounded-md" />
      <Skeleton className="h-9 w-2/3 mb-4" rounded="rounded-lg" />
      <ul className="grid gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <li
            key={i}
            className="animate-slide-up rounded-3xl border bg-card overflow-hidden shadow-soft"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <Skeleton className="aspect-[16/10] w-full" rounded="rounded-none" />
            <div className="p-4 space-y-2">
              <Skeleton className="h-4 w-3/4" rounded="rounded-md" />
              <Skeleton className="h-3 w-full" rounded="rounded-md" />
              <Skeleton className="h-10 w-full mt-3" rounded="rounded-2xl" />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
