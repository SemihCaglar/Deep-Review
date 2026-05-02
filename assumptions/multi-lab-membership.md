# Multi-Lab Membership Assumptions

## Current Model

- Lab membership is represented through `LabMembership`, not a direct user-lab join table.
- A membership has one per-lab status: `Pending`, `Active`, or `Alumni`.
- A user can have at most one membership row per lab.
- Existing account/profile responses still expose a `labs` array for frontend compatibility.
- `currentPosition` remains part of profile/account compatibility and is not part of lab selection state.

## Selection Behavior

- Lab members enter the app through `/lab-select`.
- `Active` labs can be selected for normal work.
- `Alumni` labs can be selected for read-only review of existing lab context.
- `Pending` labs are visible but cannot be selected.
- The selected lab is persisted in local storage as `bilsen_selected_lab`.
- `LabContext` validates the stored lab against the logged-in user's labs and clears stale selections.
- `AppLayout` sends logged-in lab members without a valid selected lab back to `/lab-select`.
- Coordinators and admins are not required to select a lab.

## Implemented Scoping

- Lab Members is scoped to the selected lab.
- Papers is scoped to papers whose `labs` include the selected lab.
- My Reviews is scoped to assignments whose paper belongs to the selected lab.
- Dashboard lab-dependent sections are scoped to the selected lab where applicable.
- Paper registration now uses the selected lab for member lookup and paper creation when a lab member has selected a lab.

## Coordinator Join Requests

- Lab members can submit pending join requests for labs where they do not already have membership.
- Coordinators review pending join requests for their lab on Pending Approvals.
- Approve changes the membership to `Active`.
- Reject deletes the pending membership request.
- The coordinator UI confirms approve/reject before calling the backend action.

## Known Limitations

- Sidebar lab switching changes the selected lab but does not yet add broader backend query scoping.
- Paper detail remains paper-specific and relies on backend authorization rather than a selected-lab page guard.
- Round Management is coordinator-only and currently remains scoped by coordinated papers, not by selected lab.
- Some backend services still support legacy `labs` compatibility accessors while the LabMembership model is phased in.
