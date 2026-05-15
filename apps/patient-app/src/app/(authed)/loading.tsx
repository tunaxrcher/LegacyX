import { Skeleton } from "@/components/skeleton";

/**
 * Loading state for the (guest + authed) home / welcome page. Two-column
 * grid skeletons match the category-card layout so the layout doesn't shift
 * once the real data renders.
 */
export default function HomeLoading() {
  return (
    <main className="min-h-screen px-4 sm:px-6 lg:px-10 py-8">
      <div className="mx-auto max-w-7xl">
        {/* Hero placeholder */}
        <div className="text-center mb-10">
          <Skeleton
            className="h-7 w-44 mx-auto mb-4"
            rounded="rounded-full"
          />
          <Skeleton className="h-14 w-64 mx-auto" rounded="rounded-xl" />
          <Skeleton className="h-3 w-72 mx-auto mt-4" rounded="rounded-md" />
        </div>

        {/* Category grid placeholder */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="animate-slide-up"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <Skeleton
                className="aspect-[3/4] md:aspect-[4/5] w-full"
                rounded="rounded-[28px]"
              />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
