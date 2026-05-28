'use client'

import { useEffect, useMemo, useState } from "react"

import { SurfaceCard } from "@/components/design-system"
import type { TrainingAnalysisPayload } from "@/lib/training-analysis"

function formatDigitalCountdown(targetTime: string, now: number) {
  const diffMs = new Date(targetTime).getTime() - now
  if (diffMs <= 0) {
    return "你已准备好再次训练"
  }

  const totalSeconds = Math.floor(diffMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return `恢复时间剩余：${String(hours).padStart(2, "0")}h, ${String(minutes).padStart(2, "0")}m, ${String(seconds).padStart(2, "0")}s`
}

export function RecoveryCountdownCard({
  report,
  className = "",
  title = "Recovery Timer",
}: {
  report: TrainingAnalysisPayload | null
  className?: string
  title?: string
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const summary = useMemo(() => {
    const readyAt = report?.context.recovery.readyAt
    if (!readyAt) {
      return null
    }

    return {
      label: formatDigitalCountdown(readyAt, now),
    }
  }, [now, report])

  if (!summary) {
    return null
  }

  return (
    <SurfaceCard className={`w-full border-cyan-300/15 bg-[linear-gradient(180deg,rgba(34,211,238,0.12),rgba(8,47,73,0.08))] p-4 ${className}`}>
      <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-200/80">{title}</div>
      <div className="mt-3 font-[family:var(--font-display)] text-[1.55rem] font-semibold tracking-tight text-white">{summary.label}</div>
    </SurfaceCard>
  )
}
