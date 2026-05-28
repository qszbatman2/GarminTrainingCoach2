import { AppPage, SurfaceCard, SubtleCard } from "@/components/design-system"

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-white/10 ${className}`} />
}

export default function Loading() {
  return (
    <AppPage>
      <SurfaceCard className="p-7">
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <SubtleCard className="p-6">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="mt-4 h-9 w-48" />
            <SkeletonBlock className="mt-3 h-4 w-full max-w-2xl" />
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <SkeletonBlock className="h-28 w-full" />
              <SkeletonBlock className="h-28 w-full" />
              <SkeletonBlock className="h-28 w-full" />
              <SkeletonBlock className="h-28 w-full" />
            </div>
          </SubtleCard>

          <SubtleCard className="p-6">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="mt-4 h-8 w-40" />
            <div className="mt-6 space-y-3">
              <SkeletonBlock className="h-16 w-full" />
              <SkeletonBlock className="h-16 w-full" />
              <SkeletonBlock className="h-16 w-full" />
            </div>
          </SubtleCard>
        </div>
      </SurfaceCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SurfaceCard className="p-6">
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="mt-4 h-8 w-40" />
          <div className="mt-6 space-y-3">
            <SkeletonBlock className="h-20 w-full" />
            <SkeletonBlock className="h-20 w-full" />
          </div>
        </SurfaceCard>
        <SurfaceCard className="p-6">
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="mt-4 h-8 w-40" />
          <div className="mt-6 space-y-3">
            <SkeletonBlock className="h-20 w-full" />
            <SkeletonBlock className="h-20 w-full" />
          </div>
        </SurfaceCard>
      </div>
    </AppPage>
  )
}
