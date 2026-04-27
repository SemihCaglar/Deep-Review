# Milestone 2 — Issue #21: Idempotent Reviewer Assignment & Duplicate Invitation Protection

This document records every design decision and constraint established for **Issue #21**.

---

## 1. Duplicate Assignment Protection

1. **Unique constraint removed:** The `@Unique(['round', 'reviewer'])` database-level constraint on `Assignment` is removed. Enforcement is handled in code to allow re-assignment after cancellation.
2. **Active assignment check:** When assigning reviewers, the system checks for an existing assignment with a status other than `Cancelled`. If one exists (any of `Invited`, `Accepted`, `Declined`, `Completed`, `Overdue`, `Reassigned`), the reviewer is skipped silently.
3. **Declined blocks re-assignment:** A reviewer who has `Declined` an assignment for a round cannot be re-assigned to that same round.
4. **Cancelled does not block:** A coordinator may accidentally cancel an assignment. `Cancelled` status does not prevent re-assignment — a new `Assignment` record is created for that reviewer on the same round.
5. **At most one active assignment:** Code strictly enforces that no reviewer can have more than one non-`Cancelled` assignment per round at any time.

---

## 2. Invitation Email Deduplication

1. **`invitationSent` flag:** A new `invitationSent: boolean` field (default `false`) is added to the `Assignment` entity.
2. **Send once only:** `sendInvitations` only sends emails to assignments where `invitationSent = false`. After sending, `invitationSent` is set to `true`.
3. **Calling `sendInvitations` multiple times is safe:** Repeated calls do not re-send emails to reviewers who already received one.

---

## 3. Post-Acceptance Decline — Removed

1. **No withdrawal after acceptance:** Per professor's instruction, a reviewer who has accepted an assignment cannot later request to withdraw.
2. **`requestDecline` endpoint removed:** `POST /responses/decline` route and `requestDecline` method are deleted.
3. **Initial decline still supported:** A reviewer can still decline via `respondToInvitation` before accepting. This creates a `DeclineRequest` record requiring coordinator approval.
4. **`DeclineRequest` entity kept:** Still needed for the initial invitation decline flow.

---

## 4. Extension Request Overwrite

1. **At most one pending extension:** There can only be one `Pending` extension request per assignment at any time.
2. **Overwrite pending:** If a reviewer submits a new extension request while a `Pending` one already exists, the existing record is updated in place (same ID, new `reason` and `requestedDeadline`). A new notification email is sent to the coordinator.
3. **New record after resolved:** If the previous extension was `Approved` or `Rejected`, a new `Extension` record is created (history is preserved).
4. **Extension date validation — one rule:**
   - `requestedDeadline` must be **strictly after** the current `assignment.deadline` (it must actually extend, not shorten)
   - The upper-bound rule ("must be before `round.deadline`") was removed: an extension request is by definition meant to exceed the round deadline, so capping it there made every extension invalid.
5. **Coordinator notification email content:** Includes reviewer name, paper title, round number, current assignment deadline, and requested deadline.
6. **Extension entity relation changed:** `Extension` → `Assignment` is changed from `OneToOne` to `ManyToOne` to allow multiple extension records per assignment over time (history of requests).

---

## 5. Out of Scope for Issue #21

- Reminder scheduling and overdue alerts — Issue #22
- Round close / start next round — Issue #23
