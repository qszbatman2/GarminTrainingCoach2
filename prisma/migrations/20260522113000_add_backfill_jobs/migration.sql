-- CreateTable
CREATE TABLE "BackfillJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "totalDates" INTEGER NOT NULL,
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "targetDates" JSONB NOT NULL,
    "syncedDates" JSONB NOT NULL,
    "skippedDates" JSONB NOT NULL,
    "failedDates" JSONB NOT NULL,
    "message" TEXT,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackfillJob_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BackfillJob" ADD CONSTRAINT "BackfillJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
