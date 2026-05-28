'use client'

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { AccentPill, MetricTile, SubtleCard, SurfaceCard } from "@/components/design-system"
import { SUPPORTED_FIELD_GROUPS } from "@/lib/sync-supported-fields"

type BackfillJobSnapshot = {
  id: string
  status: string
  totalDates: number
  currentIndex: number
  targetDates?: unknown
  syncedDates: unknown
  skippedDates: unknown
  failedDates: unknown
  message: string | null
  lastError?: string | null
  createdAt: string
  updatedAt: string
  startedAt?: string | null
  finishedAt?: string | null
  heartbeatAt?: string | null
}

export type SyncCalendarDayStatus = "future" | "partial" | "empty" | "complete"

export type SyncCalendarDay = {
  date: string
  dayNumber: number
  status: SyncCalendarDayStatus
  hasMetric: boolean
  metricComplete: boolean
  activityCount: number
  incompleteActivityCount: number
  isToday: boolean
}

export type SyncCalendarMonth = {
  monthLabel: string
  startWeekday: number
  days: SyncCalendarDay[]
}

type DataSyncCenterProps = {
  garminEmail: string | null
  metricsCount: number
  activitiesCount: number
  latestMetricDate: string | null
  last30MetricCount: number
  last30ActivityDays: number
  initialBackfillJob: BackfillJobSnapshot | null
  activeSupportedFieldIds: string[]
  syncCalendarMonths: SyncCalendarMonth[]
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : []
}

function getUpdatedFields(message?: string | null) {
  if (!message || !message.includes("；已更新字段：")) {
    return []
  }

  const [, fieldsText = ""] = message.split("；已更新字段：")
  return fieldsText
    .split("、")
    .map((item) => item.trim())
    .filter(Boolean)
}

function getMessageWithoutUpdatedFields(message?: string | null) {
  if (!message) {
    return "--"
  }

  return message.split("；已更新字段：")[0] ?? message
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "--"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function getHeartbeatStatus(job: BackfillJobSnapshot | null) {
  if (!job || !job.heartbeatAt || !["pending", "running"].includes(job.status)) {
    return null
  }

  const diffMs = Date.now() - new Date(job.heartbeatAt).getTime()
  if (diffMs <= 90_000) {
    return { label: "仍在运行", tone: "bg-emerald-50 text-emerald-600" }
  }

  return { label: "长时间无心跳", tone: "bg-amber-50 text-amber-700" }
}

const CALENDAR_STATUS_META: Record<
  SyncCalendarDayStatus,
  {
    label: string
    description: string
    pillTone: "neutral" | "amber" | "rose" | "emerald"
    squareClassName: string
  }
> = {
  future: {
    label: "未到达",
    description: "日期还没到，先不判断同步完整度。",
    pillTone: "neutral",
    squareClassName: "border-white/8 bg-white/[0.025] hover:border-slate-400/35 hover:bg-white/[0.05]",
  },
  partial: {
    label: "待补齐",
    description: "已有数据，但当天仍可能继续更新或存在缺口。",
    pillTone: "amber",
    squareClassName: "border-amber-300/30 bg-[linear-gradient(135deg,rgba(251,191,36,0.72),rgba(245,158,11,0.92))] shadow-[0_0_0_1px_rgba(251,191,36,0.08)_inset] hover:brightness-110",
  },
  empty: {
    label: "无数据",
    description: "当前没有拉到 Daily 或活动记录。",
    pillTone: "rose",
    squareClassName: "border-rose-300/30 bg-[linear-gradient(135deg,rgba(251,113,133,0.72),rgba(225,29,72,0.92))] shadow-[0_0_0_1px_rgba(251,113,133,0.08)_inset] hover:brightness-110",
  },
  complete: {
    label: "已拉全",
    description: "Daily 完整，活动明细也已补齐。",
    pillTone: "emerald",
    squareClassName: "border-emerald-300/30 bg-[linear-gradient(135deg,rgba(45,212,191,0.78),rgba(20,184,166,0.96))] shadow-[0_0_0_1px_rgba(45,212,191,0.08)_inset] hover:brightness-110",
  },
}

export function DataSyncCenter({
  garminEmail,
  metricsCount,
  activitiesCount,
  latestMetricDate,
  last30MetricCount,
  last30ActivityDays,
  initialBackfillJob,
  activeSupportedFieldIds,
  syncCalendarMonths,
}: DataSyncCenterProps) {
  const router = useRouter()
  const [syncDate, setSyncDate] = useState(new Date().toISOString().split("T")[0])
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncResult, setSyncResult] = useState("")
  const [syncUpdatedFields, setSyncUpdatedFields] = useState<string[]>([])
  const [backfillLoading, setBackfillLoading] = useState(false)
  const [resumeLoading, setResumeLoading] = useState(false)
  const [backfillResult, setBackfillResult] = useState("")
  const [backfillJob, setBackfillJob] = useState<BackfillJobSnapshot | null>(initialBackfillJob)
  const [resultTab, setResultTab] = useState<"failed" | "synced" | "skipped">("failed")
  const [calendarMonthIndex, setCalendarMonthIndex] = useState(() => Math.max(syncCalendarMonths.length - 1, 0))
  const currentCalendar = syncCalendarMonths[calendarMonthIndex] ?? syncCalendarMonths[syncCalendarMonths.length - 1] ?? null
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(
    () =>
      syncCalendarMonths[syncCalendarMonths.length - 1]?.days.find((day) => day.isToday)?.date ??
      syncCalendarMonths[syncCalendarMonths.length - 1]?.days.find((day) => day.status === "partial")?.date ??
      syncCalendarMonths[syncCalendarMonths.length - 1]?.days[0]?.date ??
      null
  )

  const hasBinding = Boolean(garminEmail)
  const heartbeatStatus = useMemo(() => getHeartbeatStatus(backfillJob), [backfillJob])
  const backfillTargetDates = useMemo(() => asStringArray(backfillJob?.targetDates), [backfillJob?.targetDates])
  const backfillSyncedDates = useMemo(() => asStringArray(backfillJob?.syncedDates), [backfillJob?.syncedDates])
  const backfillSkippedDates = useMemo(() => asStringArray(backfillJob?.skippedDates), [backfillJob?.skippedDates])
  const backfillFailedDates = useMemo(() => asStringArray(backfillJob?.failedDates), [backfillJob?.failedDates])
  const backfillUpdatedFields = useMemo(() => getUpdatedFields(backfillJob?.message), [backfillJob?.message])
  const observedFieldIdSet = useMemo(() => new Set(activeSupportedFieldIds), [activeSupportedFieldIds])
  const observedFieldCount = observedFieldIdSet.size
  const totalSupportedFieldCount = useMemo(
    () => SUPPORTED_FIELD_GROUPS.reduce((sum, group) => sum + group.fields.length, 0),
    []
  )
  const currentBackfillDate = useMemo(() => {
    if (!backfillJob || !["pending", "running"].includes(backfillJob.status)) {
      return null
    }

    return backfillTargetDates[backfillJob.currentIndex] ?? null
  }, [backfillJob, backfillTargetDates])
  const canResumeBackfill =
    !!backfillJob &&
    (backfillJob.status === "failed" || (backfillJob.status === "running" && heartbeatStatus?.label === "长时间无心跳") || backfillJob.status === "pending")
  const progressPercent = backfillJob && backfillJob.totalDates > 0 ? Math.min(100, Math.round((backfillJob.currentIndex / backfillJob.totalDates) * 100)) : 0
  const calendarSummary = useMemo(
    () =>
      (currentCalendar?.days ?? []).reduce(
        (summary, day) => {
          summary[day.status] += 1
          return summary
        },
        { future: 0, partial: 0, empty: 0, complete: 0 }
      ),
    [currentCalendar]
  )
  const effectiveSelectedCalendarDate = useMemo(() => {
    if (!currentCalendar) {
      return null
    }

    if (selectedCalendarDate && currentCalendar.days.some((day) => day.date === selectedCalendarDate)) {
      return selectedCalendarDate
    }

    return currentCalendar.days.find((day) => day.isToday)?.date ?? currentCalendar.days.find((day) => day.status === "partial")?.date ?? currentCalendar.days[0]?.date ?? null
  }, [currentCalendar, selectedCalendarDate])
  const selectedCalendarDay = useMemo(
    () => currentCalendar?.days.find((day) => day.date === effectiveSelectedCalendarDate) ?? null,
    [currentCalendar, effectiveSelectedCalendarDate]
  )

  useEffect(() => {
    if (!backfillJob || !["pending", "running"].includes(backfillJob.status)) {
      return
    }

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/garmin-backfill/${backfillJob.id}`, {
          cache: "no-store",
        })
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || "获取任务状态失败")
        }

        setBackfillJob(data.job)

        if (!["pending", "running"].includes(data.job?.status ?? "")) {
          router.refresh()
        }
      } catch {
        window.clearInterval(timer)
      }
    }, 3000)

    return () => window.clearInterval(timer)
  }, [backfillJob, router])

  async function handleSync(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSyncLoading(true)
    setSyncResult("")
    setSyncUpdatedFields([])

    try {
      const response = await fetch("/api/garmin-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: syncDate }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "同步失败")
      }

      const updatedFields = Array.isArray(data.updatedFields) ? data.updatedFields.map((item: unknown) => String(item)) : []
      setSyncUpdatedFields(updatedFields)
      setSyncResult(
        data.dataChanged
          ? `同步完成：写入 1 条每日快照，活动 ${data.activitiesCount} 条。已更新 ${updatedFields.length > 0 ? updatedFields.join("、") : "缺口数据"}。`
          : `同步完成：当前日期无新增差异，活动 ${data.activitiesCount} 条。`
      )
      router.refresh()
    } catch (error: unknown) {
      setSyncUpdatedFields([])
      setSyncResult(error instanceof Error ? error.message : "同步失败")
    } finally {
      setSyncLoading(false)
    }
  }

  async function handleBackfill() {
    setBackfillLoading(true)
    setBackfillResult("")

    try {
      const response = await fetch("/api/garmin-backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 30 }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "补拉失败")
      }

      setBackfillJob(data.job)
      setBackfillResult(data.job?.message || "后台补拉任务已创建，服务端开始执行。")
    } catch (error: unknown) {
      setBackfillResult(error instanceof Error ? error.message : "补拉失败")
    } finally {
      setBackfillLoading(false)
    }
  }

  async function handleResumeBackfill() {
    if (!backfillJob) {
      return
    }

    setResumeLoading(true)
    setBackfillResult("")

    try {
      const response = await fetch(`/api/garmin-backfill/${backfillJob.id}`, {
        method: "POST",
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "恢复补拉失败")
      }

      setBackfillJob(data.job)
      setBackfillResult(data.resumed ? "已重新触发后台补拉，继续观察运行日志。" : "当前任务无需恢复。")
    } catch (error: unknown) {
      setBackfillResult(error instanceof Error ? error.message : "恢复补拉失败")
    } finally {
      setResumeLoading(false)
    }
  }

  if (!hasBinding) {
    return (
      <section className="rounded-[1.75rem] border border-dashed border-white/12 bg-white/[0.04] px-6 py-12 text-center shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
        <h2 className="text-2xl font-semibold tracking-tight text-white">当前还没有绑定 Garmin 账号</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-400">
          同步状态页只负责展示拉取与补拉进度。你需要先回到首页完成 Garmin 绑定，系统才能开始拉取 Daily 和活动数据。
        </p>
        <div className="mt-6 flex justify-center">
          <Link className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-200" href="/">
            返回首页绑定 Garmin
          </Link>
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-6">
      <SurfaceCard className="p-7">
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-cyan-300/72">Sync Overview</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">同步控制台</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricTile detail={`最近 30 天覆盖 ${last30MetricCount}/30`} label="Daily 快照" value={`${metricsCount}`} />
              <MetricTile detail={`近 30 天活动日 ${last30ActivityDays}`} label="活动记录" value={`${activitiesCount}`} />
              <MetricTile detail="用于判断数据是否足够新" label="最新同步日期" value={latestMetricDate ?? "--"} />
              <MetricTile detail={backfillJob ? `${backfillJob.currentIndex}/${backfillJob.totalDates}` : "暂无后台补拉任务"} label="补拉状态" value={backfillJob?.status ?? "idle"} />
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Actions</div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">同步动作</h2>
            <form className="mt-6 space-y-4" onSubmit={handleSync}>
              <div>
                <label className="mb-2 block text-sm text-slate-400">同步日期</label>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none focus:border-cyan-400/60"
                  onChange={(event) => setSyncDate(event.target.value)}
                  required
                  type="date"
                  value={syncDate}
                />
              </div>
              {syncResult ? <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">{syncResult}</div> : null}
              {syncUpdatedFields.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {syncUpdatedFields.map((field) => (
                    <AccentPill key={field} tone="cyan">
                      {field}
                    </AccentPill>
                  ))}
                </div>
              ) : null}
              <button
                className="w-full rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={syncLoading}
                type="submit"
              >
                {syncLoading ? "同步中..." : "同步指定日期"}
              </button>
            </form>
            {backfillResult ? <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">{backfillResult}</div> : null}
            <div className="mt-4 grid gap-3">
              {canResumeBackfill ? (
                <button
                  className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={resumeLoading}
                  onClick={handleResumeBackfill}
                  type="button"
                >
                  {resumeLoading ? "恢复中..." : "恢复补拉任务"}
                </button>
              ) : null}
              <button
                className="rounded-2xl bg-white px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={backfillLoading || ["pending", "running"].includes(backfillJob?.status ?? "")}
                onClick={handleBackfill}
                type="button"
              >
                {backfillLoading ? "创建任务中..." : ["pending", "running"].includes(backfillJob?.status ?? "") ? "补拉任务执行中" : "补拉最近 30 天"}
              </button>
            </div>
          </div>
        </div>
      </SurfaceCard>

      {currentCalendar ? (
        <SurfaceCard className="overflow-hidden p-0">
          <div className="relative">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_left_top,rgba(45,212,191,0.08),transparent_28%),radial-gradient(circle_at_85%_18%,rgba(59,130,246,0.08),transparent_24%)]" />
            <div className="relative grid gap-0 xl:grid-cols-[minmax(0,1fr)_248px]">
              <div className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-2 rounded-full border border-white/8 bg-black/10 px-2 py-1 backdrop-blur-md">
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-sm text-slate-200 transition hover:border-white/14 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
                      disabled={calendarMonthIndex === 0}
                      onClick={() => setCalendarMonthIndex((value) => Math.max(0, value - 1))}
                      type="button"
                    >
                      ←
                    </button>
                    <div className="min-w-28 text-center font-[family:var(--font-display)] text-xl font-semibold tracking-tight text-white">{currentCalendar.monthLabel}</div>
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-sm text-slate-200 transition hover:border-white/14 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
                      disabled={calendarMonthIndex === syncCalendarMonths.length - 1}
                      onClick={() => setCalendarMonthIndex((value) => Math.min(syncCalendarMonths.length - 1, value + 1))}
                      type="button"
                    >
                      →
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                    {(["future", "partial", "empty", "complete"] as SyncCalendarDayStatus[]).map((status) => (
                      <span className="inline-flex items-center gap-1.5" key={status}>
                        <span className={`h-[9px] w-[9px] rounded-[3px] border ${CALENDAR_STATUS_META[status].squareClassName}`} />
                        {CALENDAR_STATUS_META[status].label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-5 rounded-[1.6rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <div className="mx-auto w-fit">
                    <div className="grid grid-cols-7 gap-2 text-center text-[10px] uppercase tracking-[0.22em] text-slate-500">
                      {["一", "二", "三", "四", "五", "六", "日"].map((label) => (
                        <span className="w-[15px]" key={label}>
                          {label}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-7 gap-2">
                      {Array.from({ length: currentCalendar.startWeekday }).map((_, index) => (
                        <div className="h-[15px] w-[15px] rounded-[5px] border border-transparent" key={`empty-${index}`} />
                      ))}
                      {currentCalendar.days.map((day) => {
                        const isSelected = effectiveSelectedCalendarDate === day.date

                        return (
                          <button
                            aria-label={`${day.date} ${CALENDAR_STATUS_META[day.status].label}`}
                            className={`relative h-[15px] w-[15px] rounded-[5px] border transition duration-150 ${CALENDAR_STATUS_META[day.status].squareClassName} ${
                              isSelected ? "scale-[1.22] border-cyan-200/60 ring-2 ring-cyan-300/55 shadow-[0_0_0_1px_rgba(255,255,255,0.12)_inset,0_0_18px_rgba(34,211,238,0.28)]" : ""
                            } ${day.isToday && !isSelected ? "ring-1 ring-amber-300/35" : ""}`}
                            key={day.date}
                            onClick={() => setSelectedCalendarDate(day.date)}
                            title={`${day.date} · ${CALENDAR_STATUS_META[day.status].label}`}
                            type="button"
                          >
                            {day.isToday ? <span className="absolute inset-[3px] rounded-[2px] border border-white/15" /> : null}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-white/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 xl:border-l xl:border-t-0">
                {selectedCalendarDay ? (
                  <div className="rounded-[1.5rem] border border-white/8 bg-[linear-gradient(180deg,rgba(10,18,34,0.82),rgba(12,20,38,0.64))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Selected Day</div>
                        <div className="mt-2 font-[family:var(--font-display)] text-2xl font-semibold tracking-tight text-white">
                          {selectedCalendarDay.date}
                        </div>
                      </div>
                      <AccentPill tone={CALENDAR_STATUS_META[selectedCalendarDay.status].pillTone}>
                        {CALENDAR_STATUS_META[selectedCalendarDay.status].label}
                      </AccentPill>
                    </div>

                    <div className="mt-4 grid gap-2">
                      <div className="rounded-2xl border border-white/6 bg-white/[0.03] px-3 py-2.5">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Daily</div>
                        <div className="mt-1 text-sm font-medium text-slate-100">
                          {selectedCalendarDay.metricComplete ? "完整" : selectedCalendarDay.hasMetric ? "待补齐" : "无"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/6 bg-white/[0.03] px-3 py-2.5">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Activity</div>
                        <div className="mt-1 text-sm font-medium text-slate-100">
                          {selectedCalendarDay.activityCount > 0
                            ? selectedCalendarDay.incompleteActivityCount > 0
                              ? `${selectedCalendarDay.activityCount} 条 / 缺口 ${selectedCalendarDay.incompleteActivityCount}`
                              : `${selectedCalendarDay.activityCount} 条完整`
                            : "无"}
                        </div>
                      </div>
                    </div>

                    {selectedCalendarDay.isToday ? (
                      <div className="mt-3 text-xs leading-6 text-slate-400">今天默认按待补齐处理，避免把当日增量误判为缺失。</div>
                    ) : null}

                    <div className="mt-4 grid grid-cols-4 gap-2">
                      {[
                        { key: "future", count: calendarSummary.future },
                        { key: "partial", count: calendarSummary.partial },
                        { key: "empty", count: calendarSummary.empty },
                        { key: "complete", count: calendarSummary.complete },
                      ].map((item) => (
                        <div className="rounded-xl border border-white/6 bg-black/10 px-2 py-2 text-center" key={item.key}>
                          <div className="mx-auto h-[8px] w-[8px] rounded-[3px] border border-white/10" />
                          <div
                            className={`mx-auto -mt-[8px] h-[8px] w-[8px] rounded-[3px] border ${
                              CALENDAR_STATUS_META[item.key as SyncCalendarDayStatus].squareClassName
                            }`}
                          />
                          <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                            {CALENDAR_STATUS_META[item.key as SyncCalendarDayStatus].label.slice(0, 1)}
                          </div>
                          <div className="mt-1 text-sm font-semibold text-slate-200">{item.count}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </SurfaceCard>
      ) : null}

      {backfillJob ? (
        <SurfaceCard className="p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-white">任务进度</h3>
            {heartbeatStatus ? <AccentPill tone={heartbeatStatus.label === "仍在运行" ? "emerald" : "amber"}>{heartbeatStatus.label}</AccentPill> : null}
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-cyan-300" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="mt-3 text-sm text-slate-300">
            {progressPercent}% · {backfillJob.currentIndex}/{backfillJob.totalDates}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricTile detail="当前任务命中的日期" label="当前检查日期" value={currentBackfillDate ?? "--"} />
            <MetricTile detail="最近一步服务器反馈" label="当前步骤" value={getMessageWithoutUpdatedFields(backfillJob.message)} />
            <MetricTile detail="任务启动时间" label="开始时间" value={formatDateTime(backfillJob.startedAt)} />
            <MetricTile detail="最近运行心跳" label="最近心跳" value={formatDateTime(backfillJob.heartbeatAt)} />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <MetricTile detail="已成功补齐日期" label="成功" value={`${backfillSyncedDates.length}`} />
            <MetricTile detail="无变化而跳过" label="跳过" value={`${backfillSkippedDates.length}`} />
            <MetricTile detail="需要人工关注" label="失败" value={`${backfillFailedDates.length}`} />
          </div>

          {backfillJob.lastError ? <div className="mt-4 text-sm text-rose-300">最近错误：{backfillJob.lastError}</div> : null}
          {backfillUpdatedFields.length > 0 ? (
            <div className="mt-4">
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300/72">本次累计更新</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {backfillUpdatedFields.map((field) => (
                  <AccentPill key={field} tone="cyan">
                    {field}
                  </AccentPill>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { key: "failed", label: "失败日期" },
              { key: "synced", label: "成功日期" },
              { key: "skipped", label: "跳过日期" },
            ].map((item) => (
              <button
                className={`rounded-full px-4 py-2 text-sm transition ${
                  item.key === resultTab ? "bg-white text-slate-950" : "border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
                }`}
                key={item.key}
                onClick={() => setResultTab(item.key as "failed" | "synced" | "skipped")}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          <SubtleCard className="mt-4">
            <div className="max-h-56 space-y-2 overflow-auto text-sm text-slate-300">
              {(resultTab === "failed" ? backfillFailedDates : resultTab === "synced" ? backfillSyncedDates : backfillSkippedDates).length > 0 ? (
                (resultTab === "failed" ? backfillFailedDates : resultTab === "synced" ? backfillSyncedDates : backfillSkippedDates).map((date) => (
                  <div key={date}>{date}</div>
                ))
              ) : (
                <div className="text-slate-500">暂无</div>
              )}
            </div>
          </SubtleCard>
        </SurfaceCard>
      ) : null}

      <details className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_18px_50px_rgba(15,23,42,0.24)] backdrop-blur-xl">
        <summary className="cursor-pointer list-none">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-white">字段覆盖详情</h3>
            <div className="flex flex-wrap items-center gap-2">
              <AccentPill tone="emerald">最近 30 天已拉到 {observedFieldCount}</AccentPill>
              <AccentPill tone="violet">系统支持 {totalSupportedFieldCount}</AccentPill>
            </div>
          </div>
        </summary>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SUPPORTED_FIELD_GROUPS.map((group) => (
            <SubtleCard className="p-4" key={group.title}>
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{group.title}</div>
                <div className="text-xs text-slate-500">
                  {group.fields.filter((field) => observedFieldIdSet.has(field.id)).length}/{group.fields.length}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {group.fields.map((field) => (
                  <span
                    className={
                      observedFieldIdSet.has(field.id)
                        ? "inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/12 px-2.5 py-1 text-xs text-emerald-100 shadow-[0_0_0_1px_rgba(52,211,153,0.08)_inset]"
                        : "inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-slate-400"
                    }
                    key={field.id}
                  >
                    <span className={observedFieldIdSet.has(field.id) ? "h-1.5 w-1.5 rounded-full bg-emerald-300" : "h-1.5 w-1.5 rounded-full bg-slate-600"} />
                    {field.label}
                  </span>
                ))}
              </div>
            </SubtleCard>
          ))}
        </div>
      </details>
    </div>
  )
}
