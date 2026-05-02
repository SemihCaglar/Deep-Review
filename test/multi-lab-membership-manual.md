# Multi-Lab Membership Manual Verification

## Lab Selection

- Log in as a lab member with one `Active` membership and confirm login routes to `/lab-select`.
- Select an `Active` lab and confirm `bilsen_selected_lab` is written and the app routes to `/dashboard`.
- Confirm a `Pending` lab appears but cannot be selected.
- Confirm an `Alumni` lab can be selected and is visually distinguished as alumni/read-only context.
- Clear or corrupt `bilsen_selected_lab`, refresh a protected app page, and confirm the user is sent back to `/lab-select`.

## Scoped Pages

- With a selected lab, confirm Lab Members shows only members for that lab.
- With a selected lab, confirm Papers shows only papers whose `labs` include that lab.
- With a selected lab, confirm My Reviews shows only assignments whose paper belongs to that lab.
- With a selected lab, confirm dashboard lab-dependent sections show only that lab where implemented.

## Paper Registration

- As a multi-lab lab member, select an `Active` lab and open Register Paper.
- Confirm author choices come from the selected lab.
- Confirm the selected lab is excluded from collaboration lab choices.
- Complete registration and confirm the created paper belongs to the selected lab context.

## Coordinator Join Requests

- Submit a lab join request as a lab member.
- Log in as that lab's coordinator and open Pending Approvals.
- Confirm the request appears in Lab Join Requests with user, email, lab, and requested date.
- Click Approve and confirm the modal appears before the request is approved.
- Repeat with Reject and confirm the modal appears before the request is rejected.
- Confirm existing signup approval and approval history behavior still works.
