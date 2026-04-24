# Frontend Account/Profile Flow Test Summary

## Scope
This test summary covers the implemented account/profile flow, including:
- login
- profile view
- profile update
- interests update
- custom `Other` interests
- change password
- logout/login persistence checks

---

## 1. Login Flow Tests

### 1.1 Approved user can log in successfully
Tested with newly created and approved users.

Example flow:
1. `POST /api/account/signup`
2. `POST /api/account/approve/:id`
3. login through frontend `/login`
4. verify redirect to dashboard
5. verify sidebar user updates immediately without manual refresh

Expected result:
- login succeeds
- JWT token is stored
- safe authenticated user is stored
- sidebar/app shell updates immediately

Observed result:
- passed

### 1.2 Pending user cannot log in
Tested previously with pending users before approval.

Expected result:
- backend rejects login
- frontend displays error message

Observed result:
- passed

### 1.3 Invalid credentials show error
Tested by attempting login with invalid email/password combinations.

Expected result:
- backend returns error
- frontend shows error box

Observed result:
- passed

---

## 2. Profile Navigation Tests

### 2.1 Sidebar navigation to My Profile
Tested that `My Profile` appears in the sidebar and routes correctly.

Expected result:
- `My Profile` visible under `My Dashboard`
- clicking it opens `/profile`

Observed result:
- passed

### 2.2 Profile action buttons
Tested the profile page buttons:
- `Update Profile`
- `Change Password`
- `Add / Remove Interests`

Expected result:
- `Update Profile` opens `/profile/edit`
- `Change Password` opens `/profile/change-password`
- `Add / Remove Interests` opens `/profile/interests`

Observed result:
- passed

---

## 3. Profile View Tests

### 3.1 Profile page loads current user from backend
Tested that `/profile` uses `GET /api/account/profile` and displays current authenticated user information.

Verified fields:
- full name
- email
- interests

Expected result:
- current backend profile is shown
- frontend does not rely only on stale local storage

Observed result:
- passed

### 3.2 Empty interests state
Tested with a user that had no selected interests.

Expected result:
- a clear empty-state message is shown

Observed result:
- passed

---

## 4. Profile Update Tests

### 4.1 Update name and email
Tested through `/profile/edit`.

Test flow:
1. log in
2. open `/profile/edit`
3. change name and/or email
4. save
5. return to `/profile`

Expected result:
- backend `PUT /api/account/profile` succeeds
- updated name/email is shown on `/profile`
- sidebar user card updates immediately

Observed result:
- passed

### 4.2 Updated email can be used for login
Tested after profile email change.

Expected result:
- old email no longer used
- new email works on login

Observed result:
- passed

### 4.3 Duplicate email rejected
Tested by attempting to update profile email to another existing user’s email.

Expected result:
- backend rejects with conflict/error
- frontend shows failure

Observed result:
- passed

---

## 5. Interests Flow Tests

### 5.1 Topics list loads from backend
Tested with:
- `GET /api/topics`
- `/profile/interests`

Expected result:
- predefined topic list is visible in interests editing UI

Observed result:
- passed after backend topics endpoint was seeded correctly

### 5.2 Select and save predefined interests
Test flow:
1. open `/profile/interests`
2. select several predefined topics
3. save
4. return to `/profile`

Expected result:
- selected topics saved through `PUT /api/account/interests`
- selected topics displayed as pills on `/profile`

Observed result:
- passed

### 5.3 Interests persist after logout/login
This was an important regression case.

Test flow:
1. select interests
2. save
3. confirm they appear on `/profile`
4. logout
5. log in again
6. reopen `/profile`

Expected result:
- same interests still appear
- persistence comes from `GET /api/account/profile`

Observed result:
- passed after current-profile endpoint integration

---

## 6. Custom `Other` Interest Tests

### 6.1 `Other` reveals custom input
Tested on `/profile/interests`.

Expected result:
- selecting `Other` shows an input area for custom interest text

Observed result:
- passed

### 6.2 Single custom interest save
Initially tested with one custom interest.

Expected result:
- backend accepts custom `Other` interest
- `/profile` displays the custom value

Observed result:
- passed

### 6.3 Multiple custom interests save
After backend/frontend upgrade to `otherInterests: string[]`, tested multiple custom interests.

Test flow:
1. select `Other`
2. add multiple custom entries
   - example: `Bioinformatics`
   - example: `Formal Methods`
3. save
4. return to `/profile`

Expected result:
- backend stores:
  - `topicIds`
  - `otherInterests`
- `/profile` displays each custom interest as its own pill
- literal `Other` label is not displayed as a separate final pill

Observed result:
- passed

### 6.4 Multiple custom interests persist after relogin
Test flow:
1. save custom interests
2. logout
3. login again
4. reopen `/profile`

Expected result:
- custom interest pills still appear

Observed result:
- passed

### 6.5 Validation when `Other` is selected
Tested that `Other` requires custom input.

Expected result:
- cannot submit interests if `Other` is selected but no custom interest is provided

Observed result:
- passed

---

## 7. Change Password Tests

### 7.1 Backend authenticated change password
Tested directly with curl.

Test flow:
1. create and approve fresh user
2. log in to receive token
3. call `POST /api/account/change-password`
4. attempt login with new password

Expected result:
- old password no longer valid
- new password works

Observed result:
- passed

### 7.2 Frontend change password page integration
Tested through `/profile/change-password`.

Test flow:
1. log in
2. open `/profile/change-password`
3. enter:
   - current password
   - new password
   - confirm new password
4. submit
5. logout
6. login with new password

Expected result:
- success message shown
- fields cleared after successful submission
- new password works on next login

Observed result:
- passed

### 7.3 Validation checks
Tested:
- wrong current password
- mismatched new passwords
- same old/new password

Expected result:
- backend returns appropriate validation error
- frontend displays the backend error message

Observed result:
- passed

---

## 8. Forgot Password Entry-Point Tests

### 8.1 Link on login page
Expected result:
- `Forgot your password?` visible on `/login`
- routes to `/forgot-password`

Observed result:
- passed

### 8.2 Link on change-password page
Expected result:
- `Forgot your password?` visible on `/profile/change-password`
- routes to `/forgot-password`

Observed result:
- passed

---

## 9. Storage / UI Synchronization Tests

### 9.1 Sidebar updates immediately after login
Earlier issue:
- sidebar only updated after refresh

After fix:
- login success now updates `UserContext` immediately

Expected result:
- correct user appears immediately in sidebar after login

Observed result:
- passed

### 9.2 Sidebar/profile updates immediately after profile save
Expected result:
- updated name/email reflected immediately in sidebar/profile

Observed result:
- passed

### 9.3 Stored auth user remains synchronized
Expected result:
- `bilsen_auth_user` is refreshed from backend profile endpoint
- profile/interests remain consistent across page navigation and relogin

Observed result:
- passed

---

## 10. Backend/Schema/Runtime Issues Encountered And Resolved During Testing

### 10.1 Topics endpoint initially returned empty list
Issue:
- `/api/topics` returned `[]`
- interests UI had no selectable topics

Fix:
- reran seed / ensured topics were inserted

Result:
- resolved

### 10.2 Profile endpoint initially unavailable
Issue:
- frontend received `Cannot GET /api/account/profile`

Fix:
- backend route added and server restarted

Result:
- resolved

### 10.3 SQLite schema error for `otherInterests`
Issue:
- backend startup failed due to invalid SQLite default generated for `simple-json`

Fix:
- removed DB-level default
- used nullable simple-json field
- normalized to `[]` in application logic

Result:
- resolved

### 10.4 Old data incompatible with new `otherInterests` model
Issue:
- old stored data caused JSON parse errors

Fix:
- continued testing with fresh users / fresh flow after backend changes

Result:
- resolved for current tested flow

---

## Final Manual Verification Status

### Verified working
- login
- sidebar auth sync
- profile page
- update profile
- interests editing
- predefined topics
- multiple custom `Other` interests
- interest persistence after logout/login
- authenticated change password
- forgot-password navigation entry points

### Remaining known non-blocking items
- full forgot/reset password frontend completion may still be handled separately
- unrelated pre-existing dashboard TypeScript errors remain outside this account/profile flow scope