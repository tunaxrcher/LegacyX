import { PageHeader } from "@/components/page-header";
import { Skeleton, SkeletonList } from "@/components/skeleton";

export default function WalletLoading() {
  return (
    <>
      <PageHeader title=" " subtitle=" " />
      <main className="px-4 pt-4 pb-4 space-y-4">
        <Skeleton className="h-32 w-full" rounded="rounded-3xl" />
        <Skeleton className="h-4 w-24 mt-2" rounded="rounded-md" />
        <SkeletonList count={3} height="h-12" />
      </main>
    </>
  );
}
