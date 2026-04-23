# Milestone 2 Issue 27-28 Assumptions

## Scope assumptions
- This note covers the backend workflow assumptions for Issue #27 (reviewer extension request) and Issue #28 (coordinator processing of decline and extension requests).
- `Assignment` remains the canonical source of truth for review-task lifecycle state.
- `ReviewerResponse` remains a compatibility mirror for routes or code paths that still reference reviewer responses directly.

## Assignment lifecycle assumptions
- `Assignment.status = PendingDecline` means there is a decline request waiting for coordinator action.
- `Assignment.status = PendingExtension` means there is an extension request waiting for coordinator action.
- Once the coordinator makes a decision on either request type, the waiting state ends immediately:
  - decline approved -> `Assignment.status = Declined`
  - decline rejected -> `Assignment.status = Accepted`
  - extension approved -> `Assignment.status = Accepted`
  - extension rejected -> `Assignment.status = Accepted`

## Extension request assumptions
- A reviewer may request an extension only after the assignment has already been accepted.
- Reviewer extension requests must include a non-empty reason.
- Each extension request is stored as a separate `Extension` row linked to one `Assignment`.
- The current reviewer-specific working deadline is represented by `Assignment.deadline`. In requirement wording, this acts as the assignment's "current deadline".

## Coordinator deadline decision assumptions
- The reviewer may propose a deadline through the extension request, but the final approved extension deadline is chosen by the coordinator.
- When approving an extension request, the coordinator must explicitly provide `newDeadline`.
- On approval:
  - `Extension.status = Approved`
  - `Extension.approvedDeadline = newDeadline`
  - `Assignment.deadline = newDeadline`
  - `Assignment.status = Accepted`
- On rejection:
  - `Extension.status = Rejected`
  - `Assignment.deadline` stays unchanged
  - `Assignment.status = Accepted`

## Deadline boundary assumptions
- The coordinator-approved deadline may be later than the reviewer's requested deadline.
- The coordinator-approved deadline must not exceed the parent `Round.deadline`.
- Updating `Assignment.deadline` for one reviewer must not modify `Round.deadline`.

## Access-control assumptions
- Coordinator processing actions are lab-scoped.
- The acting user must be the coordinator of the same `Lab` that owns the assignment through the paper-lab relationship.
- A non-coordinator user in the same lab is not allowed to process decline or extension requests.

## API and compatibility assumptions
- Canonical coordinator-processing endpoints live under `/assignments/:id/process-decline` and `/assignments/:id/process-extension`.
- Compatibility routes under `/responses/...` may delegate to the same coordinator-processing logic, but they do not change the source-of-truth model.
- The current schema uses UUID identifiers, so `extensionId` is treated as a string in the backend implementation.

## Documentation precedence
- For extension-processing behavior, the assumptions in this file supersede earlier broad notes that described pending extensions differently during Issue #25 model design.
