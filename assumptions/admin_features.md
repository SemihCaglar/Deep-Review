# BILSEN — Admin & Multi-Lab Architecture Decisions

This document tracks the key architectural decisions, assumptions, and constraints implemented as part of Issue #44 (Admin Features).

## Core Assumptions

### 1. Permanent User Roles
- **Decision**: Once a user is created with a specific role (Admin, Coordinator, LabMember), their role cannot be changed.
- **Rationale**: The system uses Single Table Inheritance (STI) with a discriminator. Changing roles would require moving records between subclasses, which is complex and can lead to data integrity issues. It also ensures strict account accountability.
- **Constraint**: The `updateUserRole` endpoint was explicitly removed.

### 2. Lab-Coordinator Topology
- **Decision**: Every Lab must have **exactly one** Coordinator, and a Coordinator can only manage **one Lab**.
- **Implementation**: Enforced via a `OneToOne` relationship in the database and validation logic in `AdminController`.
- **Assumption**: A Lab can exist without a coordinator temporarily, but the UI prioritizes assignment.

### 3. Lab Isolation
- **Decision**: Papers, Reviews, and Assignments are scoped to a specific Lab.
- **Assumption**: A Lab Member only interacts with the papers of their own lab. Admins have a global view but usually don't intervene in lab-level review logic.

## Topic Management (Shared Pool vs. Lab Lists)

### 4. Many-to-Many Relationship
- **Decision**: Topics belong to labs via a `ManyToMany` relationship.
- **Rationale**: Topics like "AI" or "Security" are universal concepts. We don't want duplicate "AI" strings in a global search. However, each lab wants to curate its own list of relevant topics.

### 5. Rename-as-Forking Logic
- **Decision**: When a user "renames" a topic within a lab, the system **unlinks** the lab from the old topic and **links** it to a new/existing topic with the new name.
- **Important Note**: This prevents "side-effect" renames where Lab A renames "AI" to "Robotics" and accidentally changes it for Lab B as well. 
- **Assumption**: Users prefer isolation of their lab's nomenclature over global consistency during edits.

## Security & Permissions

### 6. Admin Privileges
- **Decision**: Admins can perform any action in any lab.
- **Assumption**: Admins are trusted system maintainers.

### 7. Lab Member Permissions
- **Decision**: Lab Members are allowed to add, remove, and "rename" (fork) topics within their own lab.
- **Rationale**: Topics are often dynamic research interests; forcing a Coordinator to manage every new topic would be a bottleneck.

### 8. Audit Logging
- **Decision**: Every write operation in the Admin Panel (User lock, Lab creation, Policy update) must generate an `AuditLog` entry.
- **Implementation**: Handled via the `AdminController.logAction` utility.

## System Configuration

### 9. Policies & Templates
- **Decision**: System policies (e.g., `MAX_FAILED_LOGINS`) and Email Templates are stored in the database.
- **Assumption**: There is a global default (where `labId` is null), and labs can have their own overrides. The current UI focuses on managing the global defaults.
