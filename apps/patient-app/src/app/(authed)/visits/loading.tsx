import { PageHeader } from "@/components/page-header";
import { Skeleton, SkeletonList } from "@/components/skeleton";

/**
 * Loading skeleton for /visits — mirrors the real layout (header + two
 * sections of cards) so the user sees structure-not-spinner during fetch.
 */
export default function VisitsLoading() {
  return (
    <>
      <PageHeader title=" " subtitle=" " />
      <main className="px-4 pt-4 pb-4 space-y-7">
        <section>
          <Skeleton className="h-4 w-32 mb-3" rounded="rounded-md" />
          <SkeletonList count={2} height="h-32" />
        </section>
        <section>
          <Skeleton className="h-4 w-32 mb-3" rounded="rounded-md" />
          <SkeletonList count={3} height="h-36" />
        </section>
      </main>
    </>
  );
}
