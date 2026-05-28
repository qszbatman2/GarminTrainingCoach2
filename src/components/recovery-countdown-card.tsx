'use client'

import { useEffect, useMemo, useState } from "react"

import { AccentPill, SurfaceCard } from "@/components/design-system"
import type { TrainingAnalysisPayload } from "@/lib/training-analysis"

function formatTime(value?: string) {
  if (!value) {
    return "--"
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
  })
}

function formatDigitalCountdown(targetTime: string, now: number) {
  const diffMs = new Date(targetTime).getTime() - now
  if (diffMs <= 0) {
    return "随时开始"
  }

  const totalSeconds = Math.floor(diffMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return `${String(hours).padStart(2, "0")}h : ${String(minutes).padStart(2, "0")}m : ${String(seconds).padStart(2, "0")}s`
}

function countdownTone(diffMs: number): "emerald" | "amber" | "violet" {
  if (diffMs <= 0) {
    return "emerald"
  }

  return diffMs <= 6 * 60 * 60 * 1000 ? "amber" : "violet"
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

    const remainingMs = new Date(readyAt).getTime() - now
    return {
      label: formatDigitalCountdown(readyAt, now),
      readyAt,
      tone: countdownTone(remainingMs),
    }
  }, [now, report])

  if (!summary) {
    return null
  }

  return (
    <SurfaceCard className={`w-full border-cyan-300/15 bg-[linear-gradient(180deg,rgba(34,211,238,0.12),rgba(8,47,73,0.08))] p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-200/80">{title}</div>
        <AccentPill tone={summary.tone}>Timer</AccentPill>
      </div>
      <div className="mt-3 font-[family:var(--font-display)] text-[1.55rem] font-semibold tracking-tight text-white">{summary.label}</div>
      <div className="mt-1 text-[11px] text-slate-400">可开始 {formatTime(summary.readyAt)}</div>
    </SurfaceCard>
  )
}
