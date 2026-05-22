'use client'

import { useMemo, useState } from "react"

type DataCalendarProps = {
  metricDates: string[]
  activityDates: string[]
}

function monthLabel(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function getCalendarDays(currentMonth: Date) {
  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
  const start = new Date(firstDay)
  start.setDate(firstDay.getDate() - ((firstDay.getDay() + 6) % 7))

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })
}

export function DataCalendar({ metricDates, activityDates }: DataCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const seed = metricDates[0] ?? activityDates[0] ?? new Date().toISOString().slice(0, 10)
    return new Date(`${seed}T00:00:00`)
  })

  const metricDateSet = useMemo(() => new Set(metricDates), [metricDates])
  const activityDateSet = useMemo(() => new Set(activityDates), [activityDates])
  const days = useMemo(() => getCalendarDays(currentMonth), [currentMonth])

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">数据日历</h2>
          <p className="mt-2 text-sm text-slate-500">快速看清楚哪些天已经同步了 Daily 数据，哪些天有运动活动。</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
            onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
            type="button"
          >
            上个月
          </button>
          <div className="min-w-28 text-center text-sm font-medium text-slate-700">{monthLabel(currentMonth)}</div>
          <button
            className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
            onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
            type="button"
          >
            下个月
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-sm text-slate-600">
        <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm">
          <span className="h-3 w-3 rounded-full bg-cyan-500" />
          已拉 Daily 数据
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm">
          <span className="h-3 w-3 rounded-full bg-emerald-500" />
          当天有运动活动
        </span>
      </div>

      <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
        <div className="grid grid-cols-7 bg-slate-50 px-4 py-3 text-center text-xs uppercase tracking-[0.18em] text-slate-400">
          {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dateKey = day.toISOString().slice(0, 10)
            const isCurrentMonth = day.getMonth() === currentMonth.getMonth()
            const hasMetric = metricDateSet.has(dateKey)
            const hasActivity = activityDateSet.has(dateKey)

            return (
              <div
                className={`min-h-28 border-t border-slate-100 p-3 ${isCurrentMonth ? "bg-white" : "bg-slate-50/70 text-slate-400"}`}
                key={dateKey}
              >
                <div className="text-sm font-medium">{day.getDate()}</div>
                <div className="mt-3 space-y-2">
                  {hasMetric ? <div className="rounded-2xl bg-cyan-50 px-3 py-2 text-xs text-cyan-700">已拉 Daily</div> : null}
                  {hasActivity ? <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">有活动</div> : null}
                  {!hasMetric && !hasActivity ? <div className="px-1 text-xs text-slate-400">暂无数据</div> : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
