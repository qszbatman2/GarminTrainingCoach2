import { Prisma } from "@prisma/client"

import prisma from "@/lib/prisma"
import { formatUpdatedFieldsSummary, getDateKey, mergeUpdatedFields, syncGarminDateForUser } from "@/lib/garmin-sync"

const BACKFILL_SECRET = () => process.env.CRON_SECRET ?? process.env.AUTH_SECRET ?? ""
const JOB_CHUNK_SIZE = 4

type JsonStringArray = Prisma.InputJsonValue & string[]

function arrayFromJson(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : []
}

function toJsonArray(values: string[]) {
  return values as JsonStringArray
}

function parseUpdatedFieldsFromMessage(message?: string | null) {
  if (!message || !message.includes("已更新字段：")) {
    return []
  }

  const [, fieldsText = ""] = message.split("已更新字段：")
  return fieldsText
    .split("、")
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildJobMessage(base: string, updatedFields: string[]) {
  return updatedFields.length > 0 ? `${base}；${formatUpdatedFieldsSummary(updatedFields)}` : base
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
    select: {
      id: true,
      garminEmail: true,
      garminPassword: true,
    },
  })

  if (!user) {
    throw new Error("用户不存在")
  }

  if (!user.garminEmail || !user.garminPassword) {
    throw new Error("请先绑定 Garmin 账号")
  }

  const targetDates = getBackfillDateRange(boundedDays)

  const job = await prisma.backfillJob.create({
    data: {
      userId,
      status: targetDates.length > 0 ? "pending" : "completed",
      days: boundedDays,
      totalDates: targetDates.length,
      targetDates: toJsonArray(targetDates),
      syncedDates: toJsonArray([]),
      skippedDates: toJsonArray([]),
      failedDates: toJsonArray([]),
      message: targetDates.length > 0 ? "任务已创建，将逐日比对远端差异并补齐缺口" : "最近 30 天没有可检查的日期",
      finishedAt: targetDates.length > 0 ? null : new Date(),
    },
    select: {
      id: true,
      status: true,
      totalDates: true,
      currentIndex: true,
      targetDates: true,
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
      targetDates: true,
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
      targetDates: true,
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
  let updatedFields = parseUpdatedFieldsFromMessage(job.message)

  if (job.currentIndex >= targetDates.length) {
    await prisma.backfillJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        message: buildJobMessage(failedDates.length > 0 ? `补拉完成，但仍有 ${failedDates.length} 天失败` : "补拉完成", updatedFields),
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
      message: buildJobMessage(`服务端正在执行补拉任务，准备检查 ${targetDates[job.currentIndex] ?? "当前日期"}`, updatedFields),
      lastError: null,
    },
  })

  const endIndex = Math.min(job.currentIndex + JOB_CHUNK_SIZE, targetDates.length)
  let cursor = job.currentIndex

  for (let index = job.currentIndex; index < endIndex; index += 1) {
    const date = targetDates[index]
    try {
      await prisma.backfillJob.update({
        where: { id: jobId },
        data: {
          heartbeatAt: new Date(),
          message: buildJobMessage(`正在检查 ${date}（${index + 1}/${targetDates.length}）：抓取远端并比对缺口`, updatedFields),
        },
      })
      const result = await syncGarminDateForUser({
        userId: job.user.id,
        garminEmail: job.user.garminEmail,
        garminPassword: job.user.garminPassword,
        date,
      })
      updatedFields = mergeUpdatedFields(updatedFields, result.updatedFields)
      if (result.dataChanged) {
        syncedDates.push(date)
      } else {
        skippedDates.push(date)
      }
      await prisma.backfillJob.update({
        where: { id: jobId },
        data: {
          heartbeatAt: new Date(),
          message: buildJobMessage(
            result.dataChanged ? `${date} 已补齐缺口，继续检查下一天` : `${date} 无新增差异，已跳过`,
            updatedFields
          ),
        },
      })
    } catch (error: unknown) {
      failedDates.push(date)
      await prisma.backfillJob.update({
        where: { id: jobId },
        data: {
          lastError: error instanceof Error ? error.message : "补拉失败",
          heartbeatAt: new Date(),
          message: buildJobMessage(`${date} 检查失败，继续后续日期`, updatedFields),
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
      message: buildJobMessage(
        done
          ? failedDates.length > 0
            ? `比对完成：补齐 ${syncedDates.length} 天，跳过 ${skippedDates.length} 天，失败 ${failedDates.length} 天`
            : `比对完成：补齐 ${syncedDates.length} 天，跳过 ${skippedDates.length} 天`
          : `比对进行中：${cursor}/${targetDates.length}`,
        updatedFields
      ),
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
