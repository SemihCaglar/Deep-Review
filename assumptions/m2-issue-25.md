# Milestone 2 Issue 25 Assumptions

## Scope assumptions
- Issue #25 covers the backend data model for reviewer responses, decline/extension requests, and submitted review feedback.
- This issue is limited to TypeORM entities and their database relationships.
- Controller behavior for accepting invitations, requesting declines, requesting extensions, processing coordinator decisions, and submitting reviews belongs to later issues (#26, #27, #28, and #30).

## Canonical review task model
- `Assignment` is the canonical reviewer-specific task record.
- One `Assignment` represents one reviewer assigned to one review `Round`.
- `Assignment.status` is the canonical lifecycle state for the reviewer task.
- The `@Unique(['round', 'reviewer'])` constraint remains the primary rule preventing duplicate assignments for the same reviewer in the same round.

## ReviewerResponse compatibility model
- `ReviewerResponse` is retained because parallel work may reference a reviewer response model, controller, or route names.
- `ReviewerResponse` is not an independent source of truth for the review lifecycle.
- `ReviewerResponse` is linked to `Assignment` with a one-to-one relationship.
- Each `Assignment` can have at most one `ReviewerResponse`.
- Compatibility fields such as `reviewer`, `reviewRound`, and `lab` may exist on `ReviewerResponse`, but `Assignment` remains the canonical source for reviewer, round, deadline, and task lifecycle state.

## Decline request assumptions
- A reviewer decline request is represented by:
  - `Assignment.status = PendingDecline`
  - `Assignment.declineReason`
- Coordinator approval changes the assignment to `Declined`.
- Coordinator rejection should return the assignment to an active state such as `Accepted`, depending on the previous workflow state.
- `ReviewerResponse.status = PendingDecline` may be mirrored for compatibility, but it should not override `Assignment.status`.

## Extension request assumptions
- `Extension` represents a reviewer deadline extension request for a specific `Assignment`.
- An `Assignment` can have multiple `Extension` records.
- A pending extension does not require changing `Assignment.status`; the assignment can remain `Accepted` while one or more extension requests are pending.
- When a coordinator approves an extension, the approved deadline should update the corresponding `Assignment.deadline`.
- Changing an individual assignment deadline must not modify the parent `Round.deadline`.
- Later Issue #27-28 workflow decisions intentionally use `Assignment.status = PendingExtension` while a request is waiting for coordinator action; that newer workflow note takes precedence over this model-only assumption.
- Creating an extension request should be atomic: the `Assignment`, `Extension`, and compatibility `ReviewerResponse` updates should be committed together or rolled back together.

## Feedback assumptions
- `ReviewFeedback` stores submitted feedback/rating details for an `Assignment`.
- `ReviewFeedback` is linked directly to `Assignment`.
- `ReviewFeedback` may also link to `ReviewerResponse` for compatibility with Issue #25 wording and parallel code paths.
- `Assignment.status = Completed` is the canonical marker that the assigned review task has been completed.

## Testing assumptions
- Issue #25 model verification uses the isolated database file `db/selin_m2.sqlite`.
- Tests for this issue must not use or modify `db/damla_m1.sqlite` or `db/esra_m1.sqlite`.
- Manual test commands are documented in `test/m2-review-assignment-model-test.md`.
