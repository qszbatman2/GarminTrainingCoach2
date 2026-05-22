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
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const metricDateSet = useMemo(() => new Set(metricDates), [metricDates])
  const activityDateSet = useMemo(() => new Set(activityDates), [activityDates])
  const days = useMemo(() => getCalendarDays(currentMonth), [currentMonth])
  const currentMonthKey = monthLabel(currentMonth)
  const currentMonthMetricCount = metricDates.filter((date) => date.startsWith(currentMonthKey)).length
  const currentMonthActivityCount = activityDates.filter((date) => date.startsWith(currentMonthKey)).length
  const currentMonthDualCount = days.filter((day) => {
    const dateKey = day.toISOString().slice(0, 10)
    return day.getMonth() === currentMonth.getMonth() && metricDateSet.has(dateKey) && activityDateSet.has(dateKey)
  }).length

  return (
    <section>
      <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_18px_50px_rgba(15,23,42,0.24)] backdrop-blur-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-cyan-300/72">Calendar View</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">月度覆盖视图</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/[0.08]"
              onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              type="button"
            >
              上个月
            </button>
            <div className="min-w-28 text-center text-sm font-medium text-slate-200">{monthLabel(currentMonth)}</div>
            <button
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/[0.08]"
              onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              type="button"
            >
              下个月
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.035] p-5">
            <div className="text-sm text-slate-400">当月 Daily 天数</div>
            <div className="mt-3 text-3xl font-semibold text-white">{currentMonthMetricCount}</div>
          </div>
          <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.035] p-5">
            <div className="text-sm text-slate-400">当月活动天数</div>
            <div className="mt-3 text-3xl font-semibold text-white">{currentMonthActivityCount}</div>
          </div>
          <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.035] p-5">
            <div className="text-sm text-slate-400">双覆盖天数</div>
            <div className="mt-3 text-3xl font-semibold text-white">{currentMonthDualCount}</div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-300">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 shadow-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
            Daily
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 shadow-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            活动
          </span>
        </div>

        <div className="mt-6 overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.04]">
          <div className="grid grid-cols-7 bg-white/[0.04] px-4 py-3 text-center text-xs uppercase tracking-[0.18em] text-slate-500">
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
              const isSelected = selectedDate === dateKey

              return (
                <button
                  className={`min-h-24 border-t border-white/8 p-3 text-left transition ${
                    isCurrentMonth ? "bg-transparent text-slate-200 hover:bg-white/[0.04]" : "bg-black/10 text-slate-500"
                  } ${isSelected ? "ring-1 ring-cyan-300/70" : ""}`}
                  key={dateKey}
                  onClick={() => setSelectedDate(dateKey)}
                  type="button"
                >
                  <div className="text-sm font-medium">{day.getDate()}</div>
                  <div className="mt-4 flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${hasMetric ? "bg-cyan-400" : "bg-slate-700"}`} />
                    <span className={`h-2.5 w-2.5 rounded-full ${hasActivity ? "bg-emerald-400" : "bg-slate-700"}`} />
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {selectedDate ? (
          <div className="mt-6 rounded-[1.35rem] border border-white/8 bg-white/[0.035] p-5">
            <div className="text-sm text-slate-400">选中日期</div>
            <div className="mt-2 text-2xl font-semibold text-white">{selectedDate}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {metricDateSet.has(selectedDate) ? <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">已拉 Daily</span> : null}
              {activityDateSet.has(selectedDate) ? <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">有活动</span> : null}
              {!metricDateSet.has(selectedDate) && !activityDateSet.has(selectedDate) ? (
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">暂无数据</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
