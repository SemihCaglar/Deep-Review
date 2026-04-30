# PR #72 Fixes - Assumptions & Decisions

This document records the key assumptions and decisions made while addressing Copilot's code review comments on PR #72.

## 1. UTC Date Usage
*   **Context:** In `frontend/src/app/rounds/page.tsx` and `my-reviews/page.tsx`, the `min` and `max` values for date inputs were computed using the local timezone, which could cause ±1 day off-by-one validation issues around midnight (00:00).
*   **Decision:** All date computations for input constraints now use UTC (`new Date().toISOString().split('T')[0]`). The system assumes that date comparisons across the application are UTC-based.

## 2. Reviewer Response (Decline Rejection) Status
*   **Context:** In `ReviewerResponseController`, when a coordinator rejected a Decline Request, the assignment status was unconditionally set to `Accepted`. However, the reviewer may have submitted the decline request directly from `Invited` status without ever accepting the assignment.
*   **Decision:** The `acceptedAt` field is checked to determine the correct fallback status. If `acceptedAt != null`, the status reverts to `Accepted`; otherwise it reverts to `Invited`. This assumes that `acceptedAt` is always correctly populated on every acceptance action.

## 3. Round Status ("Completed" instead of "Closed")
*   **Context:** The frontend paper detail page was checking `roundStatus === 'Closed'` to determine if a round had ended. However, the backend `RoundStatus` enum does not define a `Closed` value.
*   **Decision:** The check was updated to use `Completed` to match the backend enum (`Draft`, `Open`, `Completed`).

## 4. Frontend Paper & AuthoredPaper Types
*   **Context:** `papers/page.tsx` uses `getAllPapersRequest` (returns `Paper[]`) and `getMyWrittenPapersRequest` (returns `AuthoredPaper[]`), both assigned to a single `allPapers` state. A force-cast (`as AuthoredPaper[]`) was previously used to silence TypeScript.
*   **Decision:** The state is now typed as `(Paper | AuthoredPaper)[]` to avoid unsafe casts. Access to `AuthoredPaper`-specific fields (e.g. `latestRoundNumber`) is guarded with an `in` check.
*   **Note (Filter Logic):** The `reviews` filter on `papers/page.tsx` was a broken workaround that showed all papers where the current user was not an author — not just assigned reviews. Since a dedicated `/my-reviews` page already exists with correct assignment-based data, the `reviews` filter was removed entirely. The back button in `papers/[id]/page.tsx` was updated to point to `/my-reviews` instead of `/papers?filter=reviews`.

## 5. Paper History Types
*   **Context:** `PaperHistoryRound.deadline` can be `null` in the backend (the `Round.deadline` column is nullable).
*   **Decision:** The frontend type in `api.ts` was updated from `string` to `string | null`. The UI handles null deadlines by displaying "No deadline".

## 6. Logout Race Condition
*   **Context:** When a user logs out from a page like `papers/page.tsx`, the `useEffect` could still fire an API call with a cleared token, resulting in a 401 error. In some timing scenarios, the component would get stuck showing "Loading papers..." indefinitely.
*   **Decision:** A guard was added to skip API calls when `user.id` is empty. `user.id` was also added to the `useEffect` dependency array so that the effect re-runs (and short-circuits) immediately on logout.

## 7. Paper Action Button Routing
*   **Context:** The "Start Round & Assign" and "Assign Reviewers" buttons on the paper detail page linked to `/papers/:id/assign`, a route that does not exist, resulting in a 404.
*   **Decision:** Both buttons now redirect to `/rounds?paper={paperId}`, which opens the Round Management page with the relevant paper pre-selected. This assumes the rounds page reads the `paper` query parameter to auto-select the paper on load.
