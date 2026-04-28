# Issue #40 Assumptions

## Scope

Issue #40 covers implementing the backend business logic for the following five GET endpoints
that were already declared in `routes/index.ts` but returned `501 Not Implemented`:

| Route | Controller Method | Description |
|---|---|---|
| `GET /papers/my-written` | `getMyWrittenPapers` | Papers the caller is an author of |
| `GET /papers/my-reviewed` | `getMyReviewedPapers` | All papers the caller has ever been assigned to review (any status, any round) |
| `GET /papers/my-current-reviewed` | `getMyCurrentReviewedPapers` | Papers the caller has an active review assignment on right now |
| `GET /papers/:id/history` | `getPaperHistory` | Full round-by-round history of a specific paper |
| `GET /papers/:id/status` | `getPaperStatus` | Current status snapshot and latest round summary of a paper |

This issue does **not** include auth middleware, new routes, new entities, or frontend changes.

---

## Authentication / Identity Convention

The codebase currently has **no session middleware or JWT token verification**. `AccountController.login`
returns the user object directly in the response body, but there is no `req.user` property
injected by any middleware.

**Decision:** The caller's identity is read from the `req.query.userId` query parameter.
- All five endpoints require `?userId=<uuid>`.
- If `userId` is absent or blank → respond `400 Bad Request`.
- The frontend is responsible for passing the logged-in user's ID from login state.

This follows the same convention already used in `SearchController.searchReviewsByReviewer`,
which reads the reviewer identity from the URL parameter.

> **⚠️ Future replacement required:** When proper authentication middleware (JWT / session cookies)
> is added to the project, every endpoint in this issue must be updated to read the caller's
> identity from `req.user` (or equivalent) instead of `req.query.userId`. The `userId` query
> param approach is a **temporary** scaffolding only — it must not be used as a permanent pattern
> for authenticated endpoints.

---

## Query Strategy: Filter at the Database Level

For user-specific endpoints (`getMyWrittenPapers`, `getMyReviewedPapers`,
`getMyCurrentReviewedPapers`), queries are constructed to filter at the **database level**
using TypeORM's `where` option with a join condition — not by loading all records into memory
and filtering in JavaScript.

**Correct approach (Issue #40):**
```typescript
// Query directly: papers WHERE this user is listed as an author
const papers = await paperRepo.find({
  where: { authors: { id: userId } },
  relations: ['authors', 'topics', 'rounds'],
});
```

**Wrong approach (avoided):**
```typescript
// Do NOT do this — loads every paper in the DB, then filters in memory
const allPapers = await paperRepo.find({ relations: ['authors', ...] });
const myPapers = allPapers.filter(p => p.authors.some(a => a.id === userId));
```

TypeORM translates the `where: { authors: { id: userId } }` form into a `JOIN` against the
`user_written_papers_paper` join table with a `WHERE userId = ?` clause, which is far more
efficient and scalable.

---

## Access Control for Paper-Specific Endpoints

`GET /papers/:id/history` and `GET /papers/:id/status` are restricted. Not every user may
view the full history of any paper.

**Access rule:** The `userId` from the query param must be either:
1. The **coordinator** directly attached to that paper (`paper.coordinator.id === userId`), or
2. The **coordinator** owning any of the `Labs` that the paper belongs to, or
3. Any of the **authors** of that paper (`paper.authors[].id` contains `userId`).

If none of these conditions are satisfied → respond `403 Forbidden`.

**Rationale:**
- Reviewers are not shown the full multi-round review history of a paper. They only know their own assignment.
- Lab members with no relation to the paper (not author, not coordinator) have no visibility into the paper history or other lab members' assignments. Privacy is strictly maintained inside labs.
- This rule is currently enforced by a manual database lookup (since there is no middleware).
  When auth middleware is available, role + ownership checks should be moved there.

---

## `getMyReviewedPapers` — Deduplication and "Most Recent Status"

A reviewer may be assigned to the same paper across multiple rounds (e.g., Round 1 Completed,
Round 2 Invited). `getMyReviewedPapers` must return each paper **exactly once**.

**Decision:** Deduplicate by `paper.id`. For the status tag shown alongside the paper, use
the status of the reviewer's **most recent assignment** (the assignment with the latest
`invitedAt` timestamp).

Response shape per paper:
```json
{
  "paperId": "...",
  "title": "...",
  "paperStatus": "HumanReview",
  "latestAssignmentStatus": "Invited",
  "latestRoundNumber": 2,
  "totalRoundsReviewed": 2
}
```

---

## `getMyCurrentReviewedPapers` — "Active" Definition

An assignment is considered **active** (i.e., currently in progress) when:
1. `assignment.status` is one of `Invited`, `Accepted`, or `Overdue`, **AND**
2. `assignment.round.status` is `Open`.

Assignments in `Declined`, `Completed`, or `Reassigned` status are excluded.
Assignments belonging to a `Closed` round are also excluded (historical only).

---

## `getPaperHistory` — Response Depth

Two levels of detail were considered:

**Option A — Deep (everything):** All rounds + assignments + summaries + extensions + ratings
+ checklist items + AI review reports in one call.

**Option B — Medium depth (chosen ✅):** All rounds + per-assignment reviewer info,
deadlines, submitted summary text, extension details, and ratings are included.
Checklist items and AI review reports are **excluded** from this endpoint — they are large
sub-objects that belong to their own dedicated endpoints.

**Reason:** Keeps the response readable and avoids over-fetching data the caller may not need.
Full checklist and AI report data can be retrieved via their respective routes when needed.

---

## Express Route Ordering Constraint

Express evaluates routes in the **order they are declared**. Static path segments must always
be declared **before** parameterized segments that could match the same position.

Specifically, these three routes:
- `GET /papers/my-written`
- `GET /papers/my-reviewed`
- `GET /papers/my-current-reviewed`

must appear **before**:
- `GET /papers/:id/history`
- `GET /papers/:id/status`

in `routes/index.ts`. If the `:id` routes appear first, Express will match the literal
string `"my-written"` as the value of the `:id` parameter, causing incorrect routing.

The current file (as of this issue) has the correct order. Any future additions of new
`/papers/...` routes must respect this constraint: **all static `/papers/<literal>` routes
before any `/papers/:id` routes**.
