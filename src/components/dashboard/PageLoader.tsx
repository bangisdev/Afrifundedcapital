import { Skeleton } from "@/components/ui/skeleton";

/**
 * Branded skeleton screen for query-driven pages. Replaces bare spinners with
 * a page-shaped placeholder: header block, stat cards, then list rows — so the
 * layout doesn't jump when data arrives.
 */
export function PageLoader({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading">
      {/* Header block */}
      <div className="space-y-2.5">
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="h-6 w-56 sm:w-72" />
        <Skeleton className="h-3 w-80 max-w-full" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card-subtle p-5 space-y-3">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-7 w-28" />
          </div>
        ))}
      </div>

      {/* List rows */}
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="card-subtle p-4 flex items-center justify-between gap-4">
            <div className="space-y-2 flex-1 min-w-0">
              <Skeleton className="h-3.5 w-40 sm:w-64" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-6 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
