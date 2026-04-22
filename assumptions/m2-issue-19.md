# Milestone 2 Issue 19 Assumptions & Multi-Lab Architecture Scope

This document finalizes every design decision and assumption integrated during the implementation of **Issue #19** covering the migration toward supporting Multi-Lab logic and the Round management endpoints.

## Core Multi-Lab Architecture (Tenant Scaling)
1. **Single-Database Multi-Tenant Model:** The system uses a centralized database containing "large" core tables (i.e., a central pool of Users, Papers, etc.) natively managed by TypeORM. There are **no separate tables** (like `bilsen_users` vs `cicek_users`).
2. **Lab Entity as an Anchor:** Physical isolation is handled exclusively by linking records back to rows on the centralized `Lab` table through invisible junction tables, which acts as the clean architectural separator allowing for limitless horizontal scaling of labs.

## Entity Relationships
1. **User Memberships (Many-to-Many):** A single user account can simultaneously belong to any mathematical number of Labs. A junction table automatically tracks these cross-memberships (e.g., `user_labs`).
2. **Paper Collaborations (Many-to-Many):** A paper is **not** exclusively restricted to a single lab. The database is intentionally shaped as a `ManyToMany` relation to completely support cross-lab paper collaborations (e.g. one paper authored conjunctly between Bilsen Lab and Çiçek Lab).
3. **Coordinators (One-to-One):** The relationship mapping strictly enforces a `OneToOne` linkage. Exactly one coordinator distinctly governs one specific lab. One Lab can securely only hold exactly one overarching coordinator.

## Round Deadlines vs Assignment Internal Deadlines
1. **Isolated Responsibilities:** `createReviewRound` automatically infers the `roundNumber` sequentially inside the database, mapping out the `Round` successfully. 
2. **Round Deadline Bounds:** When the Coordinator directly patches or extends the overall deadline of a Round (via `editRoundDeadline`), this is treated structurally only as the timeline for the overall round.
3. **No Cascading Overrides:** Under no circumstances does modifying a `Round`'s deadline blindly edit or cascade to active, internal `Assignment` bounds. 
4. **Assignment Extension:** When a reviewer demands, and a coordinator later agrees to extend a deadline specifically for that active assignment, the system solely updates the `Assignment.deadline` property without ever modifying or shifting the parent `Round.deadline`.

## Authorization & Validation Constraints
1. **Coordinator Authorization:** The API enforces a temporary manual authorization layer specifically for Issue #19 endpoints. The routes physically require the frontend to pass `coordinatorId` down in the body (`req.body.coordinatorId`). The controller manually queries the DB and forcefully rejects (`403 Forbidden`) any user whose role is not actively mapped as `UserRole.Coordinator`. This explicitly patches the gap until global routing middleware supersedes it! 
2. **Deadline Quality Validations:** While HTTP routing validates format parsing defensively (`isNaN`), we enforce the rule that format sanitation must structurally happen inside the controller instantly blocking bad Date formats.
