# Tiered Admin Hierarchy & Multi-Lab Security Decisions

This document tracks the key architectural decisions, assumptions, and constraints implemented during the transition from a singular admin system to the **Tiered Admin Hierarchy** (Global Admin vs. Local Admin).

## Core Architectural Decisions

### 1. Role Splitting via Single Table Inheritance (STI)
- **Decision**: The deprecated `Admin` role was replaced with `GlobalAdmin` and `LocalAdmin`. Both were implemented as `ChildEntity` classes extending the base `User` entity.
- **Rationale**: This leverages TypeORM's Single Table Inheritance, maintaining consistency with how `Coordinator` and `LabMember` are modeled without requiring complex joins or intermediate tables.
- **Constraint**: Because STI utilizes a single `type`/`role` discriminator column per row, a single database record *cannot* be instantiated as multiple entity types simultaneously.

### 2. Strict Role Separation (Coordinator vs. Local Admin)
- **Decision**: If a lab's Coordinator is also acting as the lab's Local Admin, they must maintain two distinct accounts (e.g., `coordinator@lab.com` and `localadmin@lab.com`).
- **Rationale**: Due to the STI constraint mentioned above, merging the "management persona" (LocalAdmin) with the "research persona" (Coordinator) would require tearing down the STI structure or creating complex multi-role bitmaps. Keeping them separate enforces a strict context boundary (Admin Dashboard vs. Research Dashboard).
- **Assumption**: Users are willing to switch logins to perform administrative/configuration tasks versus daily research activities.

### 3. One-to-One Lab Management
- **Decision**: A `LocalAdmin` is mapped `OneToOne` to a `Lab`. Every lab has exactly one dedicated Local Admin.
- **Assumption**: A single administrative account is sufficient to manage the configuration and membership of a specific lab.

### 4. Multiple Notification Contacts
- **Decision**: Instead of creating multiple `LocalAdmin` accounts to distribute lab alerts, the `LocalAdmin` entity includes a `notificationEmails` array (stored as simple-json).
- **Rationale**: Lab updates (like new signups) often need to notify a group of stakeholders (TAs, head professors, administrative staff) while only one person actually logs in to manage the system.

## Workflow & Security Scope

### 5. Lab-Targeted Signups
- **Decision**: The signup form now includes a public dropdown to select a specific lab, saving the choice as `requestedLabId`.
- **Assumption**: A user knows which lab they are joining at the time of registration. Global/unassigned users are not supported in the standard flow.

### 6. Delegated Approval Logic
- **Decision**: Local Admins are responsible for approving users into their respective labs. When a Local Admin approves a user, that user is simultaneously granted system-wide access and automatically linked to the lab they requested.
- **Assumption**: The Local Admin is the ultimate authority on who should be allowed into their specific research environment. 

### 7. Strict Local Admin Data Isolation
- **Decision**: The backend heavily restricts Local Admin operations. They can *only* interact with data tied to their lab.
- **Scope**:
  - **Signups**: Can only see pending users who requested their lab.
  - **Members**: Can only remove members from their own lab.
  - **Topics**: Can only modify topics linked to their lab.
  - **Policies & Templates**: Can only read and update overrides specific to their lab.
- **Assumption**: Strict data isolation is required so that one lab's administrator cannot accidentally or maliciously alter another lab's configuration or access their papers.

### 8. Global Admin Responsibilities
- **Decision**: Global Admins manage the macro-architecture of the system.
- **Scope**: Includes creating/deleting labs, assigning Coordinators to labs, full user pool management (locking/unlocking/deleting any account), viewing global audit logs, and configuring system-wide default policies.
- **Assumption**: Global Admins act as platform maintainers and do not require granular, lab-specific dashboards for daily tasks like topic management or reviewer assignment.
