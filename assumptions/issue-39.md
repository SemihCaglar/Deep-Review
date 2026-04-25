# Issue #39 Assumptions

## Scope

Issue #39 covers the creation of the following TypeORM entity models:
- `AuditLog` — tracks critical system actions
- `SystemPolicy` — stores global configurable parameters
- `Template` — stores email notification templates
- `ReviewerStats` — caches per-reviewer analytics for the dashboard

This issue does **not** include controllers, service logic, API routes, or frontend changes. Those are expected in follow-up issues.

---

## AuditLog Assumptions

- **What counts as a "critical action":** We defined this as any action that changes the state of a user, paper, round, assignment, or system configuration. Routine reads (GET requests) are not logged.
- **Actor nullable:** If a system-triggered action occurs (e.g., auto-lock after failed logins), no actor is present. The `actor` relation is therefore `nullable`.
- **`details` as serialized JSON string:** SQLite does not have a native `json` column type, so we store action context (e.g., old/new values) as a `JSON.stringify()`-ed text string. The service layer parses it with `JSON.parse()` on read.
- **`AuditAction` enum:** Rather than free-text strings (which risk typos), we defined a strict `AuditAction` enum. Each enum value corresponds to one specific operation. If a new action type is needed in the future, it must be added to the enum.
- **`entityType` / `entityId` optional:** Not all log entries will reference a specific database entity (e.g., a system start event), so both fields are nullable.

---

## SystemPolicy Assumptions

- **`PolicyKey` enum for keys:** To prevent typos and ensure only valid policy names can be stored, the `key` column is typed with a `PolicyKey` enum.
- **All values stored as strings:** The `value` column is always a `text` string regardless of the policy's actual data type (integer, boolean, etc.). The service layer must cast the string to the correct type based on the known key (e.g., `parseInt(value)` for `MAX_FAILED_LOGINS`, `value === 'true'` for `ENABLE_AI_REVIEW`). This avoids a complex typed schema while keeping the model flexible.
- **Default values are documented, not enforced in the model:** The table in `docs/configuration.md` lists the intended defaults for each key, but these are not hardcoded in the entity. Defaults are applied at seeding time.
- **`description` is for admin UI only:** The `description` field is purely explanatory (e.g., shown in the Admin Dashboard next to each setting). It has no functional effect.

---

## Template Assumptions

- **`TemplateName` enum for names:** Similar to `SystemPolicy`, we use a `TemplateName` enum instead of a free-form string for the `name` column to preserve consistency and prevent duplicates.
- **Placeholders are `{{camelCase}}`:** All placeholder tokens in `subject` and `body` follow the `{{camelCase}}` format (e.g., `{{userName}}`, `{{paperTitle}}`). This is documented in `docs/configuration.md`.
- **Templates seeded, not hardcoded:** Template content (subject/body) will be populated via the seeder. This allows coordinators or admins to edit them later without code changes.
- **No per-user template overrides:** A single global template exists per `TemplateName`. There is no per-coordinator or per-paper template customization at this stage.

---

## ReviewerStats Assumptions

- **Cached table, not a live query:** SQLite does not support materialized views (auto-refreshed pre-computed query results). We therefore use an explicit `ReviewerStats` table that is recomputed by a service when a `Rating` or `Assignment` changes.
- **One row per reviewer:** The `user` relation is a `OneToOne` with `CASCADE` on delete. When a user is deleted, their stats row is also deleted.
- **Null score fields:** `avgQualityScore`, `avgQuantityScore`, and `avgTimeScore` are nullable. They remain `null` until at least one `Rating` has been submitted for that reviewer.
- **`totalIncomplete` tracked:** Reviewers who accepted but did not submit are counted in `totalIncomplete` as a soft reliability signal. This is displayed informationally and is not a hard eligibility ban (per the project's NFR notes).
- **`updatedAt` used as cache freshness indicator:** The `@UpdateDateColumn()` decorator automatically updates the timestamp whenever the row is saved, making it easy to check when stats were last recomputed.
