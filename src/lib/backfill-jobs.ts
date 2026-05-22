import { Prisma } from "@prisma/client"

import prisma from "@/lib/prisma"
import { getDateKey, isActivityComplete, isMetricComplete, syncGarminDateForUser } from "@/lib/garmin-sync"

const BACKFILL_SECRET = () => process.env.CRON_SECRET ?? process.env.AUTH_SECRET ?? ""
const JOB_CHUNK_SIZE = 4

type JsonStringArray = Prisma.InputJsonValue & string[]

function arrayFromJson(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : []
}

function toJsonArray(values: string[]) {
  return values as JsonStringArray
}

export function getBackfillDateRange(days: number) {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)

  const dates: string[] = []
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const current = new Date(yesterday)
    current.setDate(yesterday.getDate() - offset)
    dates.push(getDateKey(current))
  }

  return dates
}

export async function createBackfillJob(userId: string, days = 30) {
  const boundedDays = Math.max(1, Math.min(days, 30))
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      metrics: true,
      activities: true,
    },
  })

  if (!user) {
    throw new Error("用户不存在")
  }

  if (!user.garminEmail || !user.garminPassword) {
    throw new Error("请先绑定 Garmin 账号")
  }

  const targetDates = getBackfillDateRange(boundedDays)
  const metricMap = new Map(user.metrics.map((metric) => [getDateKey(metric.date), metric]))
  const activitiesByDate = new Map<string, typeof user.activities>()

  for (const activity of user.activities) {
    const dateKey = getDateKey(activity.date)
    const current = activitiesByDate.get(dateKey) ?? []
    current.push(activity)
    activitiesByDate.set(dateKey, current)
  }

  const queuedDates = targetDates.filter((date) => {
    const metric = metricMap.get(date)
    const activities = activitiesByDate.get(date) ?? []
    return !metric || !isMetricComplete(metric.raw) || activities.some((activity) => !isActivityComplete(activity.raw))
  })

  const job = await prisma.backfillJob.create({
    data: {
      userId,
      status: queuedDates.length > 0 ? "pending" : "completed",
      days: boundedDays,
      totalDates: queuedDates.length,
      targetDates: toJsonArray(queuedDates),
      syncedDates: toJsonArray([]),
      skippedDates: toJsonArray(targetDates.filter((date) => !queuedDates.includes(date))),
      failedDates: toJsonArray([]),
      message: queuedDates.length > 0 ? "任务已创建，等待服务端执行" : "最近 30 天没有需要补拉的日期",
      finishedAt: queuedDates.length > 0 ? null : new Date(),
    },
    select: {
      id: true,
      status: true,
      totalDates: true,
      currentIndex: true,
      syncedDates: true,
      skippedDates: true,
      failedDates: true,
      message: true,
      createdAt: true,
      updatedAt: true,
      finishedAt: true,
    },
  })

  return job
}

export async function getBackfillJob(jobId: string, userId?: string) {
  return prisma.backfillJob.findFirst({
    where: {
      id: jobId,
      ...(userId ? { userId } : {}),
    },
    select: {
      id: true,
      status: true,
      totalDates: true,
      currentIndex: true,
      syncedDates: true,
      skippedDates: true,
      failedDates: true,
      message: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
      startedAt: true,
      finishedAt: true,
      heartbeatAt: true,
    },
  })
}

export async function getLatestBackfillJob(userId: string) {
  return prisma.backfillJob.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      totalDates: true,
      currentIndex: true,
      syncedDates: true,
      skippedDates: true,
      failedDates: true,
      message: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
      startedAt: true,
      finishedAt: true,
      heartbeatAt: true,
    },
  })
}

export function getBackfillSecret() {
  return BACKFILL_SECRET()
}

export async function triggerBackfillRunner(origin: string, jobId: string) {
  const secret = getBackfillSecret()
  await fetch(`${origin}/api/garmin-backfill/${jobId}/run`, {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
    cache: "no-store",
  })
}

export async function processBackfillJob(jobId: string) {
  const job = await prisma.backfillJob.findUnique({
    where: { id: jobId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          garminEmail: true,
          garminPassword: true,
        },
      },
    },
  })

  if (!job) {
    throw new Error("任务不存在")
  }

  if (!job.user.garminEmail || !job.user.garminPassword) {
    await prisma.backfillJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        lastError: "Garmin 账号未绑定",
        message: "Garmin 账号未绑定，无法继续补拉",
        finishedAt: new Date(),
      },
    })
    return { done: true }
  }

  const targetDates = arrayFromJson(job.targetDates)
  const syncedDates = arrayFromJson(job.syncedDates)
  const skippedDates = arrayFromJson(job.skippedDates)
  const failedDates = arrayFromJson(job.failedDates)

  if (job.currentIndex >= targetDates.length) {
    await prisma.backfillJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        message: failedDates.length > 0 ? `补拉完成，但仍有 ${failedDates.length} 天失败` : "补拉完成",
        finishedAt: new Date(),
        heartbeatAt: new Date(),
      },
    })
    return { done: true }
  }

  await prisma.backfillJob.update({
    where: { id: jobId },
    data: {
      status: "running",
      startedAt: job.startedAt ?? new Date(),
      heartbeatAt: new Date(),
      message: "服务端正在执行补拉任务",
      lastError: null,
    },
  })

  const endIndex = Math.min(job.currentIndex + JOB_CHUNK_SIZE, targetDates.length)
  let cursor = job.currentIndex

  for (let index = job.currentIndex; index < endIndex; index += 1) {
    const date = targetDates[index]
    try {
      await syncGarminDateForUser({
        userId: job.user.id,
        garminEmail: job.user.garminEmail,
        garminPassword: job.user.garminPassword,
        date,
      })
      syncedDates.push(date)
    } catch (error: unknown) {
      failedDates.push(date)
      await prisma.backfillJob.update({
        where: { id: jobId },
        data: {
          lastError: error instanceof Error ? error.message : "补拉失败",
          heartbeatAt: new Date(),
        },
      })
    }

    cursor = index + 1
  }

  const done = cursor >= targetDates.length
  await prisma.backfillJob.update({
    where: { id: jobId },
    data: {
      currentIndex: cursor,
      syncedDates: toJsonArray(syncedDates),
      skippedDates: toJsonArray(skippedDates),
      failedDates: toJsonArray(failedDates),
      status: done ? "completed" : "running",
      message: done
        ? failedDates.length > 0
          ? `补拉完成，但仍有 ${failedDates.length} 天失败`
          : "补拉完成"
        : `补拉进行中：${cursor}/${targetDates.length}`,
      finishedAt: done ? new Date() : null,
      heartbeatAt: new Date(),
    },
  })

  return {
    done,
    currentIndex: cursor,
    totalDates: targetDates.length,
  }
}
