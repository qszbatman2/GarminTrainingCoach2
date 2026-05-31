# All Garmin 90-Day Backfill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a one-off server-side backfill entry that creates per-user Garmin backfill jobs for the latest 90 days, skipping any date that already has stored Garmin data.

**Architecture:** Reuse the existing `BackfillJob` table and per-user runner instead of adding a new global job model. A new planner computes missing dates per bound Garmin account by checking existing `DailyMetric` and `Activity` records in the 90-day window, then creates per-user jobs only for those missing dates.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, existing Garmin backfill job runner.

---

### Task 1: Add planner tests

**Files:**
- Create: `src/lib/garmin-backfill-planner.test.ts`
- Create: `src/lib/garmin-backfill-planner.ts`

**Step 1: Write the failing test**

```ts
test("returns only missing dates within 90 days", () => {
  const result = getMissingBackfillDates({
    days: 90,
    metricDates: ["2026-05-01"],
    activityDates: ["2026-05-02"],
    rangeEndDate: "2026-05-03",
  })

  assert.deepEqual(result, ["2026-05-03"])
})
```

**Step 2: Run test to verify it fails**

Run: `node --test --experimental-transform-types src/lib/garmin-backfill-planner.test.ts`
Expected: FAIL because the planner module or export does not exist yet.

**Step 3: Write minimal implementation**

```ts
export function getMissingBackfillDates(...) {
  // build date range, union existing dates, return uncovered dates
}
```

**Step 4: Run test to verify it passes**

Run: `node --test --experimental-transform-types src/lib/garmin-backfill-planner.test.ts`
Expected: PASS

### Task 2: Extend job creation for precomputed dates

**Files:**
- Modify: `src/lib/backfill-jobs.ts`
- Test: `src/lib/garmin-backfill-planner.test.ts`

**Step 1: Write the failing test**

Add coverage proving dates with either metric or activity data are excluded from target dates.

**Step 2: Run test to verify it fails**

Run: `node --test --experimental-transform-types src/lib/garmin-backfill-planner.test.ts`
Expected: FAIL on new expectation.

**Step 3: Write minimal implementation**

Add a helper in `backfill-jobs.ts` that creates a job from explicit target dates, preserving the existing single-user API.

**Step 4: Run test to verify it passes**

Run: `node --test --experimental-transform-types src/lib/garmin-backfill-planner.test.ts`
Expected: PASS

### Task 3: Add global backfill trigger

**Files:**
- Modify: `src/lib/backfill-jobs.ts`
- Create: `src/app/api/cron/garmin-backfill-all/route.ts`

**Step 1: Write the failing test**

Add planner coverage proving users with full existing coverage receive no target dates.

**Step 2: Run test to verify it fails**

Run: `node --test --experimental-transform-types src/lib/garmin-backfill-planner.test.ts`
Expected: FAIL on the new all-covered case.

**Step 3: Write minimal implementation**

Create a CRON-secret-protected route that finds all bound Garmin users, computes missing dates for the latest 90 days, creates jobs only when at least one missing date remains, and triggers runners asynchronously.

**Step 4: Run test to verify it passes**

Run: `node --test --experimental-transform-types src/lib/garmin-backfill-planner.test.ts`
Expected: PASS

### Task 4: Verify and ship

**Files:**
- Modify: `src/app/api/cron/garmin-reconcile/route.ts` (only if queue kicking is needed)
- Check: `src/lib/backfill-jobs.ts`
- Check: `src/app/api/cron/garmin-backfill-all/route.ts`

**Step 1: Run focused verification**

Run: `node --test --experimental-transform-types src/lib/garmin-backfill-planner.test.ts`
Expected: PASS

**Step 2: Run lint on touched files**

Run: `npx eslint src/lib/backfill-jobs.ts src/lib/garmin-backfill-planner.ts src/lib/garmin-backfill-planner.test.ts src/app/api/cron/garmin-backfill-all/route.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add docs/plans/2026-05-31-all-garmin-90d-backfill-design.md src/lib/backfill-jobs.ts src/lib/garmin-backfill-planner.ts src/lib/garmin-backfill-planner.test.ts src/app/api/cron/garmin-backfill-all/route.ts
git commit -m "[Trae] Feat: add 90-day Garmin backfill for all accounts"
git push
```
