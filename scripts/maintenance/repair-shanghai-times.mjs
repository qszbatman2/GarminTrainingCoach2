import "dotenv/config"

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const DRY_RUN = process.argv.includes("--dry-run")
const BATCH_SIZE = 200
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value
}

function parseGarminDateTime(value, mode) {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (match) {
    const [, year, month, day, hour, minute, second = "00"] = match
    const utcMillis = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
    return new Date(mode === "utc" ? utcMillis : utcMillis - SHANGHAI_OFFSET_MS)
  }

  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getCorrectedActivityDate(raw, fallback) {
  const record = asRecord(raw)

  return parseGarminDateTime(record?.startTimeGMT, "utc") ?? parseGarminDateTime(record?.startTimeLocal, "shanghai") ?? fallback
}

async function main() {
  let cursor = undefined
  let total = 0
  let updated = 0
  let unchanged = 0
  let skipped = 0
  const samples = []

  while (true) {
    const activities = await prisma.activity.findMany({
      take: BATCH_SIZE,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        garminId: true,
        date: true,
        raw: true,
      },
    })

    if (activities.length === 0) {
      break
    }

    for (const activity of activities) {
      total += 1
      const correctedDate = getCorrectedActivityDate(activity.raw, activity.date)

      if (!(correctedDate instanceof Date) || Number.isNaN(correctedDate.getTime())) {
        skipped += 1
        continue
      }

      if (activity.date.getTime() === correctedDate.getTime()) {
        unchanged += 1
        continue
      }

      if (!DRY_RUN) {
        await prisma.activity.update({
          where: { id: activity.id },
          data: {
            date: correctedDate,
          },
        })
      }

      updated += 1
      if (samples.length < 20) {
        samples.push({
          garminId: activity.garminId,
          before: activity.date.toISOString(),
          after: correctedDate.toISOString(),
        })
      }
    }

    cursor = activities[activities.length - 1]?.id
  }

  let clearedReports = 0
  if (!DRY_RUN) {
    const result = await prisma.analysisReport.deleteMany({})
    clearedReports = result.count
  }

  console.log(JSON.stringify({ dryRun: DRY_RUN, total, updated, unchanged, skipped, clearedReports, samples }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
