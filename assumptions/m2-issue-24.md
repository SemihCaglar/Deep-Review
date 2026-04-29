# Milestone 2 — Issue #24: Coordinator Dashboard & Reviewer Response UI

This document records every design decision, constraint, and assumption established for **Issue #24** (coordinator dashboard for assignment management and reviewer-facing response UI).

---

## 1. Scope

Issue #24 covers:
- Coordinator dashboard: view all rounds and assignments for a paper, update assignment deadlines, process decline/extension requests
- Reviewer response UI (`/my-reviews` page): accept/decline invitations, request deadline extensions, submit completed reviews
- `GET /assignments/my` backend endpoint

---

## 2. Coordinator Dashboard (`/rounds` page)

1. **Paper-scoped view:** The dashboard shows all rounds for a single paper, each with its assignments, reviewer name/email, assignment status, and any pending requests.
2. **Assignment deadline editor:** Coordinator can update a specific assignment deadline inline. The input pre-fills with the current `assignment.deadline` so the coordinator sees the existing value before editing.
3. **Add Reviewer panel:** Coordinator selects from the `suggestReviewers` list (checkboxes). Clicking "Assign" calls `POST /assignments` followed immediately by `POST /assignments/invite` — invitation email is sent automatically without a separate button.
4. **No standalone "Send Invitations" button:** The separate invite step was merged into the assign action. There is no UI path to assign without sending an invitation.
5. **Pending decline requests:** Displayed per assignment. Coordinator approves or rejects inline. On approval the assignment moves to `Declined`; on rejection it stays unchanged.
6. **Pending extension requests:** Displayed per assignment with the reviewer's requested deadline and reason. Coordinator approves (sets `approvedDeadline`) or rejects inline.

---

## 3. Reviewer Response UI (`/my-reviews` page)

1. **Route:** `/my-reviews` in the Next.js App Router. Accessible to any authenticated user (lab members act as reviewers — there is no distinct Reviewer role).
2. **Data source:** Page calls `GET /assignments/my` on load and after each action (`onRefresh` pattern).
3. **Active vs Past grouping:** Assignments with status `Invited` or `Accepted` appear in the "Active Reviews" section. Assignments with status `Declined`, `Completed`, or `Cancelled` appear in "Past Reviews".
4. **`Invited` state actions:**
   - **Accept:** Calls `POST /responses/invitation` with `action = accept`. Assignment moves to `Accepted`.
   - **Decline:** Opens a textarea for an optional reason, then calls `POST /responses/invitation` with `action = decline`. Creates a `DeclineRequest` (Pending). Assignment remains `Invited`. UI shows "Decline Pending Approval" badge until resolved.
5. **`Accepted` state actions:**
   - **Submit Review:** Opens an optional summary textarea. Calls `POST /responses/complete`. Assignment moves to `Completed`.
   - **Request Extension:** Opens a date picker and reason textarea. Calls `POST /responses/extension`. No maximum date constraint enforced on the frontend (mirrors the backend — only "must be after current deadline" is validated).
   - **Pending extension badge:** If a `pendingExtensionRequest` exists, it is shown as an info badge (requested date + reason). The "Request Extension" form is still accessible to overwrite a pending request.
6. **No post-acceptance withdrawal:** The `/my-reviews` UI does not offer a "withdraw" or "decline" action to users in `Accepted` state, consistent with the removal of `POST /responses/decline`.

---

## 4. `GET /assignments/my` Endpoint

1. **Route:** `GET /assignments/my` — registered **before** `GET /assignments/:id` in the router to avoid the `:id` param matching the literal string `"my"`.
2. **Auth:** Protected by `authenticateRequest`. Returns assignments for `req.user.id`.
3. **Relations loaded:** `round`, `round.paper`, `declineRequests`, `extensions`.
4. **Response shape per assignment:**
   ```json
   {
     "id": "...",
     "status": "Invited",
     "deadline": "2025-06-01T00:00:00.000Z",
     "invitedAt": "...",
     "submittedAt": null,
     "round": { "id": "...", "roundNumber": 1, "deadline": "...", "status": "Open" },
     "paper": { "id": "...", "title": "..." },
     "pendingDeclineRequest": { ... } | null,
     "pendingExtensionRequest": { ... } | null
   }
   ```
5. **Ordering:** Descending by `invitedAt` (most recent first).

---

## 5. Reviewer Suggestion Exclusions

The following candidates are excluded from `GET /rounds/:id/suggest`:

| Exclusion rule | Reason |
|---|---|
| `role = Coordinator` or `role = Admin` | These roles cannot act as reviewers |
| Not sharing a lab with the paper | Intra-lab scope (Issue #20) |
| Is an author of the paper | Hard COI (Issue #20) |
| Has an active (non-`Cancelled`) assignment in the current round | Already assigned |
| Has a `Completed` assignment or `submittedAt` set in any prior round for this paper | Permanently disqualified from later rounds |

Reviewers with a prior `Accepted` but not submitted assignment appear with a warning reason ("Previously accepted but did not submit") rather than being excluded.

---

## 6. Integration Test Suite (`test/m2-integration.test.ts`)

1. **Location:** `D:\Repos\Team8\test\m2-integration.test.ts` — in the shared `test/` directory alongside `m1-auth-tests.md`.
2. **Runner config:** Jest config lives in `backend/package.json`. `roots` points to `<rootDir>/../test`. `modulePaths` is set to `<rootDir>/node_modules` so tests outside the backend directory can resolve packages. `diagnostics: false` in ts-jest config suppresses TypeScript module resolution errors caused by running from a sibling directory.
3. **DB isolation:** `test/jest.setup.ts` sets `process.env.DB_PATH` to `../db/test.sqlite` before any module imports. The test DB is separate from the development DB.
4. **Coverage (15 sections, ~45 tests):**
   - Authentication (login success/fail)
   - Paper & Round views (coordinator vs reviewer access control)
   - Reviewer suggestions (coordinator excluded, already-assigned excluded, completed excluded)
   - Assign reviewers (success, idempotency, coordinator role rejected, reviewer forbidden)
   - Send invitations (idempotency — second call does not re-send)
   - My assignments (reviewer sees their data)
   - Accept invitation (success, double-accept error, wrong-owner error)
   - Update assignment deadline (coordinator success, reviewer forbidden)
   - Deadline extension request (past date rejected, valid request, overwrite pending)
   - Process extension (reviewer forbidden, approve, double-approve error)
   - Complete review (with summary, double-complete error)
   - Suggestions after completion (completed reviewer excluded)
   - Cancel and re-assign (cancelled reviewer reappears in suggestions, new assignment created)
   - Decline invitation (without reason → 400, with reason → pending, coordinator sees it)
   - Process decline (reviewer forbidden, approve → Declined, double-process error, Declined excluded from suggestions)
