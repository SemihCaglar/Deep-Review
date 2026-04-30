---
name: Issue #22 — Reminder Scheduling & Overdue Alert Logic
type: project
---

# Issue #22 Assumptions

## A1 — Reminder triggers: both manual and automated
Reminders can be sent in two ways:
1. **Manual**: Coordinator explicitly sends via `POST /assignments/remind` at any time
2. **Automated**: Background job sends exactly once, 1 day (≤25 hours) before the assignment deadline

## A2 — Automated reminder timing window
The hourly job sends an automated reminder when `assignment.deadline` is between `now` and `now + 25 hours` AND `autoReminderSentAt` is null. The 25-hour window (not 24) ensures the job never misses an assignment due to the ±1 hour job cadence.

## A3 — Deduplication for automated reminders only
A new `autoReminderSentAt: Date | null` column is added to the `Assignment` entity. Only the background job sets this field when it sends the automated reminder. Manual coordinator sends never touch this field, so manual reminders are always allowed regardless of automated reminder state.

## A4 — Manual reminder eligible statuses
Manual reminders (`POST /assignments/remind`) are sent only for assignments with an active status: `Invited`, `Accepted`, `PendingExtension`, `PendingDecline`. Assignments that are `Overdue`, `Completed`, `Declined`, `Cancelled`, or `Reassigned` are silently skipped and counted in the `skipped` response field.

## A5 — Automated reminder eligible statuses
The background job only sends automated reminders for assignments with status `Accepted`, `PendingExtension`, or `PendingDecline` (reviewers who have accepted and need to submit). `Invited` assignments are excluded because the reviewer has not yet committed.

## A6 — Overdue alert recipients
When the background job marks an assignment as Overdue, two emails are sent:
- **Coordinator(s)** of the paper: notified that reviewer X missed their deadline
- **Reviewer**: notified that their assignment is now Overdue

## A7 — Coordinator alert fires inside checkAndMarkOverdue
Overdue alerts are sent directly inside `RoundService.checkAndMarkOverdue()` at the moment the assignment status is changed to Overdue. No separate endpoint or job is needed.

## A8 — POST /rounds/:id/alerts removed
The `alertOverdueReviews` endpoint (`POST /rounds/:id/alerts`) is deleted. Overdue alerts are handled automatically by the background job (A7), making a manual trigger redundant.

## A9 — Manual remind response shape
`POST /assignments/remind` returns `{ sent: number, skipped: number }` where `sent` = emails dispatched and `skipped` = assignment IDs that were invalid, not owned by the coordinator, or in a non-active status.

## A10 — Frontend reminder button placement
A "Send Reminder" button is added per assignment row in the coordinator's rounds page. It is visible only for assignments with active statuses (`Invited`, `Accepted`, `PendingExtension`, `PendingDecline`). It calls the manual remind endpoint with just that one assignment's ID.
