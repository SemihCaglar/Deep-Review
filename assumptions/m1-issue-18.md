# Milestone 1 Issue 18 Assumptions

## Scope assumptions
- Milestone 1 Issue 18 covers the backend data layer (entities) for Review Rounds and Assignments.
- The implemented scope focuses strictly on the TypeORM entities (`Round`, `Assignment`, `Extension`, `Rating`, `Summary`).
- Business logic (controllers) and frontend integration are outside the scope of this PR. Controllers currently return `501 Not Implemented`.

## Round & Assignment deadline assumptions
- The `Round` deadline represents the general due date for all reviews in a given round.
- The `Assignment` entity has a distinct `deadline` field. This allows the Coordinator to update a specific reviewer's deadline (e.g., if re-assigning late) without changing the overall `Round` deadline.
- When an `Extension` is requested and approved, the `newDeadline` applies ONLY to that individual reviewer (`Assignment`), not the entire `Round`.

## Rating assumptions
- **Timing:** Authors and Coordinators may only rate reviewers after the `Round` has completely closed, and must wait until all active extensions for all reviewers have expired. This rule is documented as a business constraint but not explicitly enforced as a database entity check.
- The ratings (quality, quantity, timeliness) are tracked as `float` values (1-5 range) per the mock data requirements.
- The `createdAt` property acts as the audit record of when the rating was submitted.

## Summary Optionality
- A `Summary` submitted by a reviewer does NOT include a PDF or file upload. The response format is exclusively a text box.
- The `text` field is nullable because submitting a written summary is optional. A reviewer may mark their task as complete without writing anything.

## Consistency and Flow tracking assumptions (Audit)
- **NFR-2 (Idempotent Assignments):** A TypeORM `@Unique(['round', 'reviewer'])` constraint has been applied to the `Assignment` entity. This ensures a reviewer cannot be assigned multiple active duplicate assignments for the exact same round.
- **Reliability:** Reviewers who accept an assignment but fail to submit a review trigger the `reliabilityFlag` boolean. This is meant for soft tracking (e.g., lowering priority in future assignment suggestions) and does NOT result in a hard ban.
- The `acceptedAt` field on the assignment definitively tracks the exact exact timestamp a reviewer clicked "Accept".
- "Reviewer ineligibility for future rounds" is purely based on whether a reviewer has a `submittedAt` timestamp in any past assignment for the paper. Declining an assignment does not make them ineligible for the next round.

## Database & Seeding assumptions
- The TypeORM `synchronize: true` flag remains responsible for automatically applying schema adjustments to the SQLite local database.
- The `seed.ts` script was updated to ensure that `Assignment` entities are appropriately linked to `Round` instances, resolving dangling foreign keys from earlier mock implementations.
