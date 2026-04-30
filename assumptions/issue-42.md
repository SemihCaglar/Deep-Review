# Issue #42 — Aggregate Reviewer Score & Ranking Logic

## Scope

Issue #42 implements live aggregate scoring and lab-scoped reviewer rankings.

Affected files:
- NEW `backend/src/services/reviewerStatsService.ts`
- MODIFIED `backend/src/middleware/auth.ts`
- MODIFIED `backend/src/controllers/RatingAnalyticsController.ts`
- MODIFIED `backend/src/routes/index.ts`
- MODIFIED `frontend/src/lib/api.ts`
- MODIFIED `frontend/src/app/dashboard/page.tsx`

---

## How the Ranking & Analytics System Works

### 1. Score Computation

Every reviewer in a lab is scored using three dimensions, each rated 1–5 by paper authors after a review is completed:

| Dimension | Source field | Meaning |
|---|---|---|
| Quality | `Rating.qualityScore` | Depth and usefulness of the review |
| Quantity | `Rating.quantityScore` | Amount of feedback provided |
| Timeliness | `Rating.timeScore` | Whether the review was submitted on time |

The **aggregate score** is the arithmetic mean of the three sub-score averages:

```
aggregateScore = (avgQualityScore + avgQuantityScore + avgTimeScore) / 3
```

All three sub-scores carry equal weight. If a reviewer has received zero ratings, all scores — including aggregateScore — are `null`.

### 2. Stats Counted Per Reviewer

| Stat | Definition |
|---|---|
| `totalAssigned` | All assignments ever issued to the reviewer in this lab |
| `totalCompleted` | Assignments with `status = Completed` |
| `totalDeclined` | Assignments with `status = Declined` |
| `totalIncomplete` | Assignments with `status = Overdue`, OR `status = Accepted` while the parent round is `Closed` |
| `ratingCount` | Number of completed assignments that received a rating |

### 3. Ranking

Reviewers are ranked in descending order of `aggregateScore`. Rank 1 = best aggregate score. Reviewers with `aggregateScore = null` (no ratings yet) are always sorted to the bottom, below all scored reviewers.

### 4. Lab Scope

All stats and rankings are **scoped to the coordinator's own lab**. An assignment is counted only if the paper it belongs to is linked to the coordinator's lab (via `paper.labs`). A reviewer who is a member of multiple labs will have separate, independent stats for each lab where a coordinator views the leaderboard.

### 5. Live Computation

Stats are computed fresh from the `Assignment` and `Rating` tables on every analytics request. The existing `ReviewerStats` entity (designed in Issue #39) is **not used** by Issue #42 — it remains in the schema for potential future use.

---

## Architectural Decisions

### Live Computation vs Cache

**Decision**: Compute stats from raw `Assignment`/`Rating` rows on every request (Path 2 — live computation).

**Why**: Enabling lab-scoped stats would require adding a `labId` foreign key to `ReviewerStats` and changing its `OneToOne(User)` relation to allow multiple rows per user. This is a schema change. Live computation avoids it entirely, keeps the code simple, and is appropriate for a research lab platform where the reviewer count is small.

### ReviewerStats Not Updated

**Decision**: The `recomputeReviewerStats` call after `rateReviewer` is not implemented. The `ReviewerStats` entity is left as-is and not written to by Issue #42.

**Why**: Since rankings are computed live and are lab-scoped, a global per-user cache (which ReviewerStats would be) is not the right shape for the data. Writing to an unused cache would add noise without benefit.

### Authorization Model

**Decision**: Both `/ratings/overall` and `/ratings/user/:id` are protected by `authenticateRequest` + `requireCoordinator` middleware. Only users with `role = Coordinator` can call these endpoints.

**Why**: Rankings are a management tool for coordinators. Lab members have no ranking UI and no access to their own or others' stats via these endpoints.

**For `/ratings/user/:id` specifically**: The coordinator may only request analytics for a user who is a member of their own lab. A 403 is returned if the target userId is not in the coordinator's lab.

### Role Filtering in Rankings

**Decision**: Only `LabMember` users are included in lab rankings. Coordinators, LocalAdmins, and GlobalAdmins are excluded even if they are listed as lab members.

**Why**: These roles are excluded from reviewer candidate suggestions (Issue #24 assumption). They cannot receive reviewer assignments, so they will always have zero stats and should not appear in the leaderboard.

### requireCoordinator Middleware

**Decision**: A new `requireCoordinator` middleware function is added to `backend/src/middleware/auth.ts`, consistent with the existing `requireAdmin` pattern.

---

## API Reference

### `GET /ratings/overall`
- **Auth**: `authenticateRequest` + `requireCoordinator`
- **Returns**: All LabMember rankings in the coordinator's lab, sorted by aggregateScore descending (nulls last), plus a summary object.
- **Response shape**:
```json
{
  "rankings": [
    {
      "rank": 1,
      "userId": "...",
      "name": "Emily Chen",
      "email": "emily@lab.com",
      "aggregateScore": 4.60,
      "avgQualityScore": 4.90,
      "avgQuantityScore": 4.70,
      "avgTimeScore": 4.20,
      "totalAssigned": 5,
      "totalCompleted": 4,
      "totalIncomplete": 0,
      "totalDeclined": 1,
      "ratingCount": 3
    }
  ],
  "summary": {
    "totalReviewers": 6,
    "avgAggregateScore": 3.85,
    "highestScore": 4.60,
    "lowestScore": 2.10,
    "totalRatingsGiven": 11
  }
}
```

### `GET /ratings/user/:id`
- **Auth**: `authenticateRequest` + `requireCoordinator`
- **Access rule**: target user must be a LabMember of the coordinator's lab; returns 403 otherwise.
- **Returns**: The target reviewer's stats plus their rank and the total reviewer count in the lab.
- **Response shape**: same fields as a single rankings entry, plus `totalReviewers`.

---

## Frontend Behavior

The coordinator dashboard (`/dashboard`) shows a **Reviewer Leaderboard** section that is **not visible to lab members**.

- On load, `GET /ratings/overall` is called.
- A summary row shows: total reviewers, average aggregate score, highest score, lowest score.
- A table lists all LabMembers with their rank, name, email, aggregate score, three sub-scores, and a Done/Incomplete/Declined breakdown.
- Column headers for the four score columns are clickable sort toggles. Clicking the same header reverses direction; clicking a new header sorts descending. Nulls always sort to the bottom regardless of direction.
- The `rank` column always reflects the aggregate-score rank returned from the API and does not change when sorting by sub-scores.
- The top-ranked row (rank 1) is highlighted in amber when sorted by aggregate score descending (the default view).

Lab members see no leaderboard or personal stats section.

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Reviewer with zero ratings | `aggregateScore`, all avg scores = `null`; shown as `–` in UI; sorted to bottom |
| All reviewers unrated | Rankings show all names with `–` scores; summary scores all `null` |
| Coordinator with no lab assigned | `GET /ratings/overall` returns 404 |
| Target user not in coordinator's lab | `GET /ratings/user/:id` returns 403 |
| Lab has no LabMember users | Rankings array is empty; table shows "No reviewers in your lab yet" |
