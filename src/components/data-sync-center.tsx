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

type DataSyncCenterProps = {
  userEmail: string
  garminEmail: string | null
  metricsCount: number
  activitiesCount: number
  latestMetricDate: string | null
  last30MetricCount: number
  last30ActivityDays: number
  initialBackfillJob: BackfillJobSnapshot | null
  activeSupportedFieldIds: string[]
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

export function DataSyncCenter({
  userEmail,
  garminEmail,
  metricsCount,
  activitiesCount,
  latestMetricDate,
  last30MetricCount,
  last30ActivityDays,
  initialBackfillJob,
  activeSupportedFieldIds,
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
            <div className="mt-3 text-sm text-slate-400">
              {userEmail} · {garminEmail}
            </div>
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
