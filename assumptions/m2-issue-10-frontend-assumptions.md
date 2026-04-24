
# Issue #10 Frontend Account/Profile Flow Assumptions
## Scope
This implementation covers the frontend account-management flow for:
- login
- profile viewing
- profile info update
- interests management
- change password
- forgot-password entry points
The work is limited to the frontend and the backend endpoints already implemented or extended in this branch.
## Authentication assumption
The frontend assumes JWT-based authentication is already available and working on the backend.
A successful login returns:
- a JWT token
- a safe authenticated user payload
The frontend stores these in local storage and uses them as the basis for the authenticated UI session.
## Current-user profile assumption
The frontend assumes the backend current-profile endpoint is the source of truth for account details:
- `GET /api/account/profile`
This endpoint is used to load the current user’s:
- name
- email
- interests
- custom other interests
The frontend no longer assumes that local storage alone is authoritative for persisted profile/interests data.
## UserContext compatibility assumption
The frontend still uses a compatibility bridge with the existing mock-based `UserContext`.
The current implementation assumes:
- `bilsen_auth_user` is checked first
- legacy `bilsen_user` is only a fallback
- the UI still internally uses the simplified legacy user shape for shell/sidebar rendering
This is a transitional compatibility decision, not a full auth architecture refactor.
## Profile-page structure assumption
Profile management is intentionally split into separate pages instead of one large inline form.
Routes assumed in this flow:
- `/profile` → profile overview
- `/profile/edit` → name/email update only
- `/profile/interests` → interests editing only
- `/profile/change-password` → authenticated password change
- `/forgot-password` → password reset request entry point
This separation is intentional for clarity and cleaner UX.
## Profile update assumption
`/profile/edit` is assumed to edit only:
- full name
- email
It does not manage topic interests anymore.
Interests are treated as a separate concern and are edited only through `/profile/interests`.
## Interests model assumption
The system assumes two categories of interests:
1. predefined topic interests selected from backend topics
2. custom interests entered by the user when `Other` is selected
Backend-supported request shape:
```json
{
  "topicIds": ["id1", "id2"],
  "otherInterests": ["Bioinformatics", "Formal Methods"]
}

Other-interest assumption

The Other option is treated as an enablement flag for custom free-text interests.

Assumed behavior:

* if Other is selected, the user may enter one or more custom interests
* if Other is not selected, custom interests are not kept
* on the profile display page, custom interests are shown as normal interest pills
* the literal label Other is not displayed as a final interest pill when custom values exist

This is a UX decision to make the displayed interests more meaningful.

Topics source assumption

The selectable predefined topics come from:

* GET /api/topics

The frontend assumes this endpoint returns the current available topic list.
If this endpoint returns an empty list, the interests editing UI cannot present selectable predefined interests.

Storage synchronization assumption

After successful profile or interests updates, the frontend updates:

* bilsen_auth_user
* in-memory UserContext

This is assumed necessary so the sidebar and profile UI update immediately without requiring a manual page refresh.

Change-password assumption

The authenticated change-password flow is separate from forgot/reset password.

Authenticated change-password uses:

* current password
* new password
* confirm new password

and calls the backend authenticated endpoint:

* POST /api/account/change-password

The user remains logged in after password change unless logout is performed manually.

Forgot-password assumption

Forgot-password is treated as a separate recovery flow from authenticated password change.

In this implementation:

* forgot-password entry points exist in the UI
* full reset flow may still be completed separately depending on backend/email flow readiness

Persistence assumption

Interests persistence across logout/login depends on backend profile retrieval, not only local storage.
The frontend assumes that if interests are successfully saved, they will later be returned by:

* GET /api/account/profile

Backend-compatibility assumption

This frontend flow assumes the backend branch used with it includes:

* JWT login support
* authenticated current-profile endpoint
* authenticated change-password endpoint
* interests update endpoint with otherInterests: string[] support
* safe profile serialization including:
    * interests
    * otherInterests

Non-goals

This implementation does not assume or provide:

* a full frontend auth architecture rewrite
* token refresh / session rotation redesign
* route-guard refactor across the whole app
* arbitrary user-profile lookup
* uncontrolled user-created global topic taxonomy

Known limitation assumption

The dashboard currently contains unrelated pre-existing frontend issues outside this account/profile flow.
These are treated as separate cleanup work and not as blockers for the account/profile implementation itself.

