## `assumptions/m2-issue-9-profile-interests.md`
```md
# Issue #9 Profile and Interests API Assumptions

## Scope
This update implements the backend portion of issue #9 for:
- profile update
- topic interests update
- topic list retrieval

## Profile model assumption
The existing `name` field in `User` is treated as the user’s full name for now.
A separate `surname` / `lastName` field is not introduced in this iteration.

## Email update assumption
Email is included in profile update for this issue.
The backend:
- normalizes email with `trim().toLowerCase()`
- allows the current user to keep their own existing email
- rejects email collisions with other users using `409 Email is already in use`

No email verification or double-confirmation flow is added in this iteration.

## Interests model assumption
A user’s interests are represented as a list of `Topic` entities.
The backend accepts topic selection by `topicIds` and replaces the authenticated user’s interests with the provided list.

## Topic retrieval assumption
A permanent endpoint is provided for topic selection:
- `GET /api/topics`

This endpoint:
- returns all topics
- returns only `id` and `name`
- is public
- is intended for frontend dropdown / checkbox / selection use

## Default topic assumption
Because full topic management is not yet implemented, the system seeds a default topic list including:
- Machine Learning
- Deep Learning
- Natural Language Processing
- Computer Vision
- Data Mining
- Software Engineering
- Human-Computer Interaction
- Distributed Systems
- Security
- Databases
- Other

## Seed behavior assumption
Normal `seed.ts` is non-destructive and idempotent.
It can be used to ensure default topics exist without wiping the database.

A separate `reset-and-seed.ts` script exists for development-only destructive reset flows.

## Authentication assumption
These profile and interests endpoints rely on authenticated current-user context from JWT auth.
They use `req.user` and do not accept a body-level `userId`.

## Explicitly out of scope
The following are not part of this issue:
- availability schedule
- lab membership editing
- role-based authorization changes
- email verification workflow