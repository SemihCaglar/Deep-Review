# Issue #23 — Reassign Reviewer & Close Round / Start Next Round: Assumptions

All assumptions below were clarified directly with the coordinator during the planning session for Milestone 3, Issue #23.
Where a decision overrides a previous document, the source is noted.

---

## Round Status

**A1.** Round status is redesigned from `{ Open, Closed }` to `{ Draft, Open, Completed }`. The `Closed` value is removed.
> Overrides `doc/d2/assumptions.txt` assumption #1 ("a round is closed manually by the Coordinator").

**A2.** A round transitions to `Completed` **automatically** when all active assignment deadlines have passed. This is not a manual coordinator action.
> Overrides `doc/d2/assumptions.txt` assumption #1.

**A3.** After creation, a round starts in `Draft` state. The coordinator fills in venue info, deadline, and proposes/assigns reviewers while in `Draft`. The round does not become `Open` automatically after creation.

**A4.** The coordinator must explicitly **start** a round via a dedicated action (Draft → Open). Before starting, the following must all be set: `targetVenue`, `venueCategory`, `submissionDeadline` (if Conference), round deadline, and the paper's Overleaf link.

**A5.** Round deadline can be entered **after** creation but **before** starting the round. It is not required at creation time.

---

## Target Venue

**A6.** `targetVenue` is a property of **Round**, not Paper. Each round can target a different venue since a paper may be resubmitted to a different venue after rejection.
> Overrides `doc/d3/architecture_decisions_report.md` section 3 which added `targetVenue` to the Paper entity.

**A7.** Round has a `venueCategory` enum: `Conference | Article`. Conferences require a `submissionDeadline`; Articles do not. Both `venueCategory` and (when applicable) `submissionDeadline` must be set before starting a round.

**A8.** The `targetVenue` field is removed from the Paper entity as it is now redundant. The paper's current venue is always derived from its latest round.

---

## Deadline Rules

**A9.** Round deadline can be set up to and including the submission date (for conferences). This restriction applies both when creating a new round and when editing the deadline.

**A10.** A reviewer can request the submission deadline as the last day of a deadline extension (for conferences).

**A11.** A coordinator can extend an assignment deadline up to the submission date.

**A11a.** For non-conference (Article) rounds, a reviewer may request an extension of at most **5 days** beyond their current assignment deadline. There is no absolute ceiling from a submission deadline.

---

## Overleaf Link

**A11b.** The paper's **Overleaf link** (`overleafLink`) is stored on the Paper entity and must be set by a coordinator before any round can be started. It can be set or updated at any time through the coordinator UI. Reviewers can only see the Overleaf link after they have accepted their assignment (i.e., status is `Accepted`, `PendingExtension`, `PendingDecline`, `Completed`, or `Overdue`).

---

## Paper Status Transition

**A12.** Paper status changes to `HumanReview` when **invitations are sent**, not when the round is created or when the round is started. This transition occurs unconditionally, regardless of the paper's previous state (e.g., whether it was `Draft`, `AIReview`, or `Completed` from a prior round).

---

## Reassignment

**A13.** The reassignment flow opens immediately after either:
  - (a) a coordinator **approves a decline request**, or
  - (b) a coordinator **manually cancels an assignment**.
Both paths lead directly into the reassignment flow without an extra step.

**A14.** When a reviewer is reassigned, the replacement assignment's deadline is set to the **round deadline**, not the old assignment's deadline.

**A15.** The same COI/eligibility validation used in `suggestReviewers` applies during reassignment: the new reviewer must not be an author of the paper, must belong to the same lab, and must not already have an active assignment in the same round.

**A15a.** A reviewer who has **any** prior assignment in the current round — regardless of its status (including `Cancelled`, `Declined`, `Reassigned`) — is excluded from the `suggestReviewers` results. A coordinator who cancels an assignment cannot re-assign the same reviewer to that round.

**A16.** The `reassignReviewer` functionality is placed in `AssignmentController`, not `RoundController`.
> Note: it was previously purged from `RoundController` in `doc/d3/architecture_decisions_report.md` section 4. It is re-introduced here as a deliberate decision for Issue #23.

---

## Overdue Assignments

**A17.** An assignment's status automatically transitions to `Overdue` if the reviewer has not submitted feedback before the assignment deadline. This is enforced by a background scheduled job. The transition fires regardless of whether there are pending decline or extension requests — an unanswered request does not pause the overdue clock.

**A17a.** When an assignment transitions to `Overdue`, any pending `DeclineRequest` or `Extension` records for that assignment are automatically set to `Rejected`. The coordinator is not required to act on them.

**A18.** When an assignment becomes `Overdue`, it is only labeled as such. No automatic reassignment is triggered. Reassignment remains a manual coordinator action.

---

## Starting a New Round

**A19.** A new round can only be created when the previous round's status is at least `Completed`. A paper cannot have more than one `Open` round at a time.

**A20.** When a new round is started, the proposed reviewers list is **not** copied from the previous round. New proposed reviewers are selected fresh for the new round.
> Overrides `doc/d2/assumptions.txt` assumption #1 ("Start Next Round inherently creates a new round while pre-filling data from the previous round").

**A21.** The coordinator provides the new round's deadline manually. It is not auto-calculated.

---

## Assignment Status

**A22.** `Submitted` and `Completed` are the same terminal state for an assignment. When a reviewer submits their feedback, the assignment is immediately considered `Completed`. There is no separate confirmation step after submission.
> The state diagram uses `Submitted`; the codebase uses `Completed`. They refer to the same state.

**A22a.** When an assignment is completed, any pending `DeclineRequest` or `Extension` records for that assignment are automatically set to `Rejected`.

---

## Reviewer Decline & Extension Requests

**A24.** A reviewer may submit a decline request while in any of the following statuses: `Invited`, `Accepted`, `PendingExtension`, `PendingDecline`. A pending extension request does not block a decline request, and vice versa — the two requests are independent.

**A25.** If a reviewer submits a new decline request while one is already pending (i.e., status is `PendingDecline`), the new reason **overwrites** the previous pending request. Only one pending decline request exists at a time per assignment.

**A26.** While status is `PendingDecline`, the reviewer can still submit their review, request or update a deadline extension, and submit a new decline request. The `PendingDecline` status does not restrict any of these actions.

**A27.** When a reviewer's status is `PendingDecline` and they request a deadline extension, the assignment status remains `PendingDecline`. It is not overwritten by `PendingExtension`.

**A28.** A reviewer may submit a new extension request while one is already pending (status `PendingExtension`). The new request **overwrites** the existing pending extension. Only one pending extension request exists at a time per assignment. When the existing request is overwritten the assignment status remains `PendingExtension`.

---

## Suggest Reviewers

**A23.** In `suggestReviewers`, reviewers who accepted an assignment in a previous round but did not submit a review (e.g., status is `Accepted`, `PendingExtension`, or `Overdue`) are not permanently excluded but are flagged with a warning: *"Warning: Previously accepted but did not submit"*.
