# Milestone 2 Issue 25 Review Assignment Model Test Commands

## Concept
This file documents the revised review assignment model for Issue 25.

The project keeps `Assignment` as the canonical reviewer task record. `ReviewerResponse` is retained for compatibility with parallel work, but it is linked to one `Assignment` instead of acting as a separate source of truth.

This test uses only:

```text
db/selin_m2.sqlite
```

## What This Verifies

- `Assignment` supports reviewer-specific lifecycle state, including `PendingDecline`.
- `ReviewerResponse` exists and links to `Assignment`.
- `Extension` supports multiple requests for the same `Assignment`.
- `ReviewFeedback` links to `Assignment`.
- TypeORM can create the schema in the isolated `selin_m2.sqlite` database.

## Run Isolated Schema Test

```bash
cd backend

# Compile TypeScript without touching any database
npx tsc --noEmit

# Create/reset only db/selin_m2.sqlite and verify entity schema initialization
npx ts-node -e "import 'reflect-metadata'; import path from 'path'; import { DataSource } from 'typeorm'; const ds = new DataSource({ type: 'sqlite', database: path.join(process.cwd(), '../db/selin_m2.sqlite'), synchronize: true, dropSchema: true, logging: false, entities: [path.join(process.cwd(), 'src/entities/*.{ts,js}')] }); ds.initialize().then(async () => { console.log('✅ selin_m2.sqlite schema initialized for Issue 25 model test'); await ds.destroy(); }).catch((error) => { console.error(error); process.exit(1); });"
```

Expected output:

```text
✅ selin_m2.sqlite schema initialized for Issue 25 model test
```

If this command succeeds, the Issue 25 entity model can be synchronized by TypeORM using the isolated test database.

## Manual Relationship Check

After the schema test, inspect `db/selin_m2.sqlite` with a SQLite viewer and confirm these tables exist:

```text
assignment
reviewer_response
extension
review_feedback
round
user
lab
paper
```

Relevant expected relationships:

```text
assignment.response -> reviewer_response.assignment
assignment.extensions -> extension.assignment
assignment.feedback -> review_feedback.assignment
```
