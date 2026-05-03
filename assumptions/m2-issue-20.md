# Milestone 2 — Issue #20: Reviewer Assignment Flow

This document records every design decision, constraint, and assumption established for **Issue #20** (Implement reviewer assignment flow for a paper round). All decisions below were explicitly discussed and approved before implementation.

---

## 1. Candidate Suggestion & Intra-Lab Constraints

_(Carried over from original assumptions — not changed)_

1. **Intra-Lab Scope Exclusivity:** The backend restricts reviewer candidates to users who share at least one Lab link with the requested Paper. Cross-lab candidates are excluded from suggestions.
2. **Hard COI Protection:** No author of the targeted Paper can be suggested or assigned as a reviewer. The query drops any User overlapping `paper.authors`.
3. **Reviewer Reuse Across Rounds:** A candidate can be suggested and assigned in a later round even if they submitted a review or have `status = Completed` in an earlier round for the same paper. Prior-round activity may be shown as context, but it is not a hard exclusion.

---

## 2. Temporary Proposal Tracking

_(Carried over — not changed)_

1. **Scope Caching:** When a Coordinator calls `addProposeReviewer`, the user is cached in `Round.proposedReviewers`. Calling `assignReviewers` does not wipe this array — it is preserved for historical candidate analytics.

---

## 3. Pre-Acceptance Assignment State Machine

_(Carried over — not changed)_

1. **Eager Instantiation:** The backend does not wait for reviewer acceptance before creating the database row. `assignReviewers` immediately commits an `Assignment` record with `status = Invited` and `invitedAt` set via `@CreateDateColumn`.
2. **Audit Trail Preservation:** If a reviewer later declines or is cancelled, the Assignment row is retained (not deleted) to preserve the historical action trace for coordinator re-assignment decisions.

---

## 4. Schema Changes Introduced by This Issue

1. **`Paper.coordinator` → ManyToMany:** The relationship between `Paper` and `Coordinator` is changed from `ManyToOne` to `ManyToMany`. A collaborative paper (spanning multiple labs) can have multiple coordinators — one per involved lab.
2. **`Coordinator.coordinatedPapers` → ManyToMany:** The inverse side changes from `OneToMany` to `ManyToMany` to match.
3. **At-least-one validation:** Every paper must have at least one coordinator and at least one lab assigned. This is enforced at the API layer (not the DB schema) — any request that would result in zero coordinators or zero labs is rejected with `400`.
4. **`AssignmentStatus.Cancelled` added:** A new `Cancelled` value is added to the `AssignmentStatus` enum for coordinator-initiated cancellations.
5. **New `DeclineRequest` entity:** A new entity captures reviewer decline requests awaiting coordinator approval (see Section 7).

---

## 5. Authorization Model

1. **No distinct Reviewer role:** There is no `UserRole.Reviewer` in the system. Lab members act as reviewers. Reviewer-side authorization is checked by verifying `req.user.id === assignment.reviewer.id` — the authenticated user must be the one assigned.
2. **Coordinator ownership check:** Because a paper can have multiple coordinators (Section 4.1), coordinator authorization is verified by checking whether `req.user.id` appears in `paper.coordinators`. Role check alone (`UserRole.Coordinator`) is not sufficient.
3. **JWT migration:** All assignment and reviewer-response routes are protected by the `authenticateRequest` middleware. `coordinatorId` is no longer passed in request bodies — coordinator identity is read from `req.user`. This supersedes the temporary manual `coordinatorId` pattern used in Issue #19.

---

## 6. Assignment Creation (`POST /assignments`)

1. **Default deadline:** When `assignReviewers` creates an Assignment, `assignment.deadline` is automatically set to `round.deadline`. This is the starting individual deadline.
2. **Deadline isolation:** `assignment.deadline` and `round.deadline` are always independent. Changing one never cascades to the other (established in Issue #19 assumptions).
3. **Response payload:** The endpoint returns `{ id, reviewerId, status, deadline }` for each newly created assignment.

---

## 7. Decline Request Flow

1. **All declines require coordinator approval.** There is no immediate/unilateral decline. This applies to a reviewer declining their initial invitation (status still `Invited`). Post-acceptance withdrawal was removed — see point 3.

2. **`respondToInvitation` handles both accept and decline:**
   - `accept` → `Assignment.status = Accepted` immediately.
   - `decline` → creates a `DeclineRequest` record with `status = Pending`. Assignment status remains `Invited`. Coordinator must approve before the assignment moves to `Declined`.

3. **Post-acceptance withdrawal — removed:** Per professor's instruction, a reviewer who has already accepted cannot later request to withdraw. `POST /responses/decline` is deleted. This is documented in Issue #21 assumptions.

4. **Coordinator approval step:**
   - Coordinator calls `POST /responses/process-decline` (`processDeclineRequest`) to approve or reject.
   - If **approved**: `DeclineRequest.status = Approved`, `Assignment.status = Declined`.
   - If **rejected**: `DeclineRequest.status = Rejected`, Assignment status is **unchanged**.

5. **Repeated decline requests:** A reviewer may submit multiple decline requests over time (e.g. after a previous rejection). Each creates a new `DeclineRequest` record. All require coordinator approval.

6. **`DeclineRequest` entity fields:** `id`, `reason` (text), `status` (Pending / Approved / Rejected), `requestedAt` (CreateDateColumn), `ManyToOne → Assignment`.

---

## 8. Review Completion Flow

1. **Single endpoint:** `POST /responses/complete` replaces both `submitReviewSummary` and `markReviewCompleted`. The separate `POST /responses/summary` route is removed.
2. **Summary is optional:** The request body accepts an optional `summary` text field. If provided, a `Summary` record is created and linked to the assignment. If omitted, no `Summary` record is created.
3. **Auto-completion:** In both cases (with or without summary), `Assignment.status` is set to `Completed` and `Assignment.submittedAt` is set to now.
4. **Triggered by reviewer:** The reviewer (verified via `req.user.id === assignment.reviewer.id`) calls this endpoint when they consider their review done.

---

## 9. Assignment Cancellation (`DELETE /assignments/:id`)

1. **Soft cancel:** Cancellation does not hard-delete the record. It sets `Assignment.status = Cancelled`.
2. **Coordinator only:** Only a coordinator listed in `paper.coordinators` can cancel an assignment.
3. **Audit trail:** The record is retained after cancellation for historical tracking.

---

## 10. Assignment Deadline Update (`PUT /assignments/:id/deadline`)

1. **Coordinator-initiated, no request required:** A coordinator can update `assignment.deadline` at any time without a prior reviewer request. This is a proactive deadline change.
2. **No round deadline cascade:** Only `assignment.deadline` is updated. `round.deadline` is never touched.

---

## 11. Extension Request Flow (`processExtensionRequest`)

1. **Reviewer-initiated:** Reviewer submits `POST /responses/extension` with a `reason` and a `requestedDeadline`. An `Extension` record is created with `status = Pending`.
2. **Coordinator responds:** Coordinator calls `POST /responses/process-extension` with an `approvedDeadline`. The approved date does **not** need to match the reviewer's requested date — the coordinator can set any date they choose.
3. **On approval:** `Extension.status = Approved`, `Extension.approvedDeadline` is set, `Assignment.deadline` is updated to the approved date.
4. **On rejection:** `Extension.status = Rejected`. `Assignment.deadline` is unchanged.
5. **No upper bound on requested date:** The `requestedDeadline` is only validated to be strictly after `assignment.deadline` (it must extend, not shorten). There is no constraint tying it to `round.deadline` — the purpose of an extension request is precisely to exceed the round boundary.

---

## 12. Email Notification Service

1. **In scope for this issue:** The email notification service is implemented as part of Issue #20 (not deferred to a later issue).
2. **Existing infrastructure:** The `EmailNotification` entity already exists with `subject`, `body`, `sentAt`, `status` (Pending / Sent / Failed), and a `ManyToOne` link to `User` (recipient).
3. **`sendInvitations` endpoint (`POST /assignments/invite`):** Implemented — triggers email notifications to assigned reviewers with `status = Invited`.
4. **Email service is a service-layer class** (`backend/src/services/emailService.ts`) following the architecture convention. Controllers call the service; the service creates `EmailNotification` records and dispatches the email.
5. **Transport:** Nodemailer (or equivalent) is used. SMTP configuration is read from environment variables. If SMTP is not configured, the service logs the notification and records `status = Failed` without crashing.

---

## 13. Out of Scope for Issue #20

The following stubs remain `501 Not Implemented` and are owned by other issues:

| Endpoint | Owning Issue |
|---|---|
| `POST /assignments/remind` (`sendReminders`) | Issue #22 |
| `GET /rounds/:id/status` (`trackReviewStatus`) | Issue #23 |
| `POST /rounds/:id/alerts` (`alertOverdueReviews`) | Issue #22 |
| `POST /rounds/:id/close` (`closeRound`) | Issue #23 |
| `POST /rounds/next` (`startNextRound`) | Issue #23 |
| Checklist endpoints | Issue #23 |
