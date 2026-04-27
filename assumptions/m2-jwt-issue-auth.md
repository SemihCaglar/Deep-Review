## `assumptions/m2-issue-jwt-auth.md`
```md
# Issue #6 JWT Authentication Assumptions

## Scope
This update completes the token-handling requirement of issue #6 by introducing JWT-based authentication for backend account routes.

## Authentication model
- The backend uses stateless bearer-token authentication.
- Successful login returns a JWT token.
- Clients are expected to send the token in the `Authorization` header using the format:
  - `Bearer <token>`

## Current-user context
- Protected routes identify the authenticated user from the JWT token.
- The authenticated user is attached to the request as `req.user`.
- This allows future profile-related endpoints to use authenticated current-user context instead of accepting a body-level `userId`.

## Secret handling
- `JWT_SECRET` is required from the environment.
- No hardcoded fallback secret is used.
- The backend is expected to fail fast if `JWT_SECRET` is missing.

## Protected route behavior
The following routes are protected by JWT authentication:
- `PUT /api/account/profile`
- `PUT /api/account/interests`
- `PUT /api/account/blackout-periods`

## Account-state enforcement
Even with a valid token:
- users whose `approvalStatus` is not `Approved` are rejected
- users whose account is currently locked are rejected

## Logout behavior
- Logout is currently stateless.
- It returns a success response but does not revoke or blacklist existing JWTs.
- Token invalidation or revocation is not yet implemented.

## Security assumptions
- JWTs are signed using a server-side secret.
- Token expiration is enforced.
- Role-based authorization middleware is not part of this change.
- This update adds authentication, not full authorization.

## Project compatibility
- The implementation remains compatible with the current `User`, `LabMember`, and `Coordinator` model.
- The implementation does not change the current multi-lab structure.

## Remaining follow-up items
These are not part of this JWT update but should be revisited:
- remove or restrict any remaining sensitive reset-token logging if present
- make password reset token consumption atomic
- implement the protected profile/interests/blackout handlers themselves