# Admin Role — Simplified Single-Admin Architecture

This document captures the transition from the two-tier `GlobalAdmin` / `LocalAdmin` model to a single `Admin` role, and records all resulting design decisions.

## Summary of Change

The original tiered hierarchy (`GlobalAdmin` + `LocalAdmin`) has been replaced with a single `Admin` role. Local-admin responsibilities (lab signup approval, member management, lab topic management) have been transferred to **Coordinators**. Admins manage the system globally and have no involvement in day-to-day lab research activities.

---

## Architectural Decisions

### 1. Single Admin Role via STI
- **Decision**: The `GlobalAdmin` and `LocalAdmin` child entities are replaced by a single `Admin` entity (`GlobalAdmin.ts` now exports the `Admin` class). `LocalAdmin.ts` has been emptied and is no longer registered with TypeORM.
- **DB migration**: Existing `GlobalAdmin` rows were updated to `role = 'Admin'`, `type = 'Admin'`. Existing `LocalAdmin` rows were deleted.
- **Enum**: `UserRole.GlobalAdmin` and `UserRole.LocalAdmin` are removed. `UserRole.Admin` is the single admin value.

### 2. Admin Scope — Everything System-Level
- **Decision**: Admins can do everything at the system level.
- **Capabilities**: Create/delete labs, assign coordinators to labs, full user pool management (lock/unlock/delete any account), view global audit logs, configure system-wide default policies and email templates, manage topics for any lab.
- **No research features**: Admins have no access to papers, rounds, review assignments, or the reviewer leaderboard. The sidebar for admin users shows only: Dashboard, Profile, Admin Dashboard.

### 3. Coordinator Scope — Own Lab Only
- **Decision**: Coordinators manage their own lab exclusively.
- **Capabilities**: Approve or reject signup requests for their lab, manage lab members, manage lab topics, view/update lab-level policies and templates, use the reviewer leaderboard for their lab.
- **Signup approval**: The existing `POST /account/approve/:id` and `POST /account/reject/:id` routes (coordinator-gated) are the canonical approval flow. The old admin-level lab signup approval routes (`/admin/pending-signups`, `/admin/approve-signup/:id`, `/admin/remove-member`) have been removed.

### 4. Notification Emails Removed
- **Decision**: The `notificationEmails` array (previously on `LocalAdmin`) is removed entirely. The `LocalAdmin` entity no longer exists, and no replacement for this feature is planned at this time.

### 5. One Coordinator per Lab
- **Decision**: Unchanged. Every lab still has exactly one coordinator. Assignment is done by an Admin via `POST /admin/labs/coordinator`.

### 6. Lab-Targeted Signups
- **Decision**: Unchanged. The signup form includes a lab selection dropdown. Coordinators approve members into their own lab.

---

## Role Summary

| Role | Manages | Research Features |
|---|---|---|
| `Admin` | Labs, all users, system policies, templates, audit logs, topics (all labs) | None |
| `Coordinator` | Own lab (approvals, members, topics, policies/templates for their lab) | Full (papers, rounds, assignments, leaderboard) |
| `LabMember` | Own profile, interests, blackout periods | Full (reviews, papers) |
