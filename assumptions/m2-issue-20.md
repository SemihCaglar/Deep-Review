# Milestone 2 Issue 20 Assumptions & Assignment Rules

This document tracks all design decisions, architectural limits, and constraints established during the implementation of **Issue #20** bridging the Reviewer Suggestion and Assignment workflow generation.

## 1. Candidate Suggestion & Intra-Lab Constraints
1. **Intra-Lab Scope Exclusivity:** The backend aggressively restricts cross-lab assignment visibility. The `suggestReviewers` service mathematically limits the candidate pool natively blocking any user who does not share at least one structural Lab link with the requested `Paper`.
2. **Hard COI Protection:** No existing structural Author of the targeted `Paper` can physically be suggested or submitted as a Reviewer candidate. The query rigorously drops any `User` matches overlapping `paper.authors`.
3. **Systematic Rule #8 Preservation:** Prior round disqualification is not uniformly applied. The algorithm disqualifies candidates iteratively only if they possess an old `Assignment` definitively containing an integrated `submittedAt` timestamp, or labeled manually as `Completed`.

## 2. Temporary Proposal Tracking
1. **Scope Caching:** When a Coordinator pushes a reviewer into `addProposeReviewer`, the logic natively caches it into `Round.proposedReviewers`. Activating `assignReviewers` explicitly skips deleting or wiping this temporary relation tracking array to preserve historical candidate analytics. 

## 3. Pre-Acceptance Assignment State Machine
1. **Eager Instantiation:** The backend does not wait for reviewer approval before structuring the SQLite row. Triggering `assignReviewers` dynamically commits definitive `Assignment` records containing `status = AssignmentStatus.Invited` and an immediate `invitedAt` date stamp.
2. **Rejection Analytics Framework:** This eager mapping is vital because if a reviewer eventually drops out, Issue #26 handles moving that specific row to `Declined`, letting Coordinators execute re-assignments correctly tracing previous historical actions inherently instead of deleting the data trace.
