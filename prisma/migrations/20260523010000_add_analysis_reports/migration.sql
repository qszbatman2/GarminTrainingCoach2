CREATE TABLE "AnalysisReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "analysis" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnalysisReport_userId_reportType_key" ON "AnalysisReport"("userId", "reportType");
CREATE INDEX "AnalysisReport_userId_updatedAt_idx" ON "AnalysisReport"("userId", "updatedAt");

ALTER TABLE "AnalysisReport" ADD CONSTRAINT "AnalysisReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
