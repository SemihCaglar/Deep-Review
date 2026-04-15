# Milestone 1 Issue 18 Assumptions

## Scope assumptions
- Milestone 1 Issue 18 covers the backend data layer (entities) for Review Rounds and Assignments.
- The implemented scope focuses strictly on the TypeORM entities (`Round`, `Assignment`, `Extension`, `Rating`, `Summary`).
- Business logic (controllers) and frontend integration are outside the scope of this PR. Controllers currently return `501 Not Implemented`.
- **There is exactly one Coordinator in the BILSEN system.** The Coordinator oversees all papers in the lab and is automatically considered an author on every paper. This means the Coordinator is always linked in the `writtenPapers` relation of every `Paper` record, and every `Paper` record has its `coordinator` field pointing to this single user.

## Round & Assignment deadline assumptions
- The `Round` deadline represents the general due date for all reviews in a given round.
- The `Assignment` entity has a distinct `deadline` field. This allows the Coordinator to update a specific reviewer's deadline (e.g., if re-assigning late) without changing the overall `Round` deadline.
- When an `Extension` is requested, the reviewer specifies a `requestedDeadline` (which is required). When a Coordinator approves it, they assign an `approvedDeadline`. **The `approvedDeadline` is nullable because an extension begins in a `Pending` state, during which the Coordinator has not yet made a decision.** The Coordinator can match the requested date or set a different date constrained by the overarching paper submission timeline. These deadlines apply ONLY to that individual reviewer (`Assignment`), not the entire `Round`.

## Round lifecycle assumptions
- A `Round` can be drafted by the Coordinator before it is officially opened. `createdAt` (auto-managed by TypeORM) captures when the record was first saved to the database. `startedAt` is a separate **nullable** field that is only populated when the Coordinator explicitly opens the round and assignments begin — so `null` means the round is still in draft.
- `closedAt` is similarly nullable and is only set when the Coordinator closes the round. While `closedAt` is null, the round is considered active.
- This two-field design (`createdAt` vs `startedAt`) ensures "when was this drafted" and "when did the review clock officially start" are never conflated.

## Rating assumptions
- **Timing:** Authors and Coordinators may only rate reviewers after the `Round` has completely closed, and must wait until all active extensions for all reviewers have expired. This rule is documented as a business constraint but not explicitly enforced as a database entity check.
- The ratings (quality, quantity, timeliness) are tracked as `float` values (1-5 range) per the mock data requirements.
- The `createdAt` property acts as the audit record of when the rating was submitted.

## Summary Optionality
- A `Summary` submitted by a reviewer does NOT include a PDF or file upload. The response format is exclusively a text box.
- The `text` field is nullable because submitting a written summary is optional. A reviewer may mark their task as complete without writing anything.

## Consistency and Flow tracking assumptions (Audit)
- **NFR-2 (Idempotent Assignments):** A TypeORM `@Unique(['round', 'reviewer'])` constraint has been applied to the `Assignment` entity. Both FK columns (`roundId`, `reviewerId`) are also marked `nullable: false` because SQLite permits multiple NULL values in a UNIQUE index — without this, the uniqueness guarantee would break if either FK were ever absent. `onDelete: 'CASCADE'` is set so that deleting a `Round` or a `User` automatically removes their associated assignments, preventing dangling orphan records.
- **Reliability (future extension):** A `reliabilityFlag` boolean on `Assignment` was considered but omitted — reviewer unreliability can be derived from `acceptedAt IS NOT NULL AND submittedAt IS NULL AND round.deadline < now`. A stored flag can be added later if query performance requires it.
- The `invitedAt` field dynamically utilizes `@CreateDateColumn` since an assignment's default status corresponds to "Invited" upon its initial database insertion.
- The `acceptedAt` field on the assignment definitively tracks the exact timestamp a reviewer clicked "Accept".
- "Reviewer ineligibility for future rounds" is purely based on whether a reviewer has a `submittedAt` timestamp in any past assignment for the paper. Declining an assignment does not make them ineligible for the next round.

## Database & Seeding assumptions
- The TypeORM `synchronize: true` flag remains responsible for automatically applying schema adjustments to the SQLite local database.
- The `seed.ts` script was updated to ensure that `Assignment` entities are appropriately linked to `Round` instances, resolving dangling foreign keys from earlier mock implementations.
