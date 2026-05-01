## Manual Verification — Account, Signup Approval, Lab Members, and Email Reset

### 1. Bootstrap coordinator login
Test flow:
1. seed the backend
2. start backend and frontend
3. clear browser local storage
4. log in with the seeded coordinator account

Credentials:
- email: `eraytuzun@cs.bilkent.edu.tr`
- password: `123`

Expected result:
- login succeeds
- coordinator reaches the dashboard
- coordinator-only navigation items are visible
- `Pending Approvals` is visible in the sidebar
- `Lab Members` is visible in the sidebar

Observed result:
- passed

### 2. Signup page access
Test flow:
1. open `/login`
2. click `Don't have an account? Sign up`
3. verify navigation to `/signup`

Expected result:
- signup page opens correctly
- page includes:
  - full name
  - email
  - password
  - confirm password

Observed result:
- passed

### 3. New user signup request
Test flow:
1. open `/signup`
2. submit a new account request with valid data

Expected result:
- signup request is accepted
- frontend shows a message that the account is pending coordinator approval

Observed result:
- passed

### 4. Pending user cannot log in
Test flow:
1. after signup, open `/login`
2. try logging in with the newly created pending user

Expected result:
- login is rejected
- pending users cannot enter the system before approval

Observed result:
- passed

### 5. Pending approval appears for coordinator
Test flow:
1. log back in as the coordinator
2. open `/pending-approvals`

Expected result:
- the newly submitted signup request appears in the pending approvals list
- visible fields include:
  - name
  - email
  - submitted date
  - approve button
  - reject button

Observed result:
- passed

### 6. Coordinator approval flow
Test flow:
1. on `/pending-approvals`, click `Approve` for the pending user
2. verify the request disappears from the pending list

Expected result:
- approval succeeds
- user is removed from the pending section
- user appears in `Approval History` with:
  - Approved status
  - reviewed date
  - note if provided

Observed result:
- passed

### 7. Approved user can log in
Test flow:
1. log out as coordinator
2. open `/login`
3. log in using the approved user account

Expected result:
- login succeeds
- approved user can access the system normally

Observed result:
- passed

### 8. Rejection flow
Test flow:
1. create another new signup request
2. log in as coordinator
3. open `/pending-approvals`
4. click `Reject` for that user

Expected result:
- rejection succeeds
- user is removed from the pending list
- user appears in `Approval History` with `Rejected` status

Observed result:
- passed

### 9. Rejected user cannot log in
Test flow:
1. log out as coordinator
2. try to log in using the rejected user account

Expected result:
- login is rejected
- rejected users cannot enter the system

Observed result:
- passed

### 10. Approval history behavior
Test flow:
1. open `/pending-approvals`
2. scroll down to `Approval History`

Expected result:
- previously reviewed signup requests are listed
- newest reviewed decisions appear first
- bootstrap coordinator does not appear in approval history
- only real signup-review decisions appear there

Observed result:
- passed

### 11. Lab members behavior
Test flow:
1. open `/lab-members`
2. inspect the members list after approvals

Expected result:
- approved users appear in the list
- bootstrap coordinator appears in the list
- pending users do not appear
- rejected users do not appear
- members are shown vertically, one per row

Observed result:
- passed

### 12. Coordinator-only visibility
Test flow:
1. log in as coordinator
2. verify `Pending Approvals` sidebar item is visible
3. log in as a normal approved user
4. verify `Pending Approvals` is not visible

Expected result:
- only coordinator/admin users see and access pending approvals
- normal users do not see coordinator-only approval tools

Observed result:
- passed

### 13. Forgot password request
Test flow:
1. open `/forgot-password`
2. submit an existing approved user email

Expected result:
- loading state appears
- generic success message is shown
- backend generates a reset token and sends a reset email

Observed result:
- passed

### 14. Reset password from email link
Test flow:
1. open the reset email received by the user
2. click the link to `/reset-password?token=...`
3. enter a new password
4. submit the form

Expected result:
- reset page opens correctly
- password reset succeeds
- success message is shown
- user can later log in with the new password

Observed result:
- passed

### 15. Login with reset password
Test flow:
1. complete the reset-password flow
2. open `/login`
3. log in with the new password

Expected result:
- login succeeds with the new password

Observed result:
- passed

### 16. Delivery note
Observed note:
- in local testing, the reset email was successfully sent and recorded as `Sent` in the backend notification table
- the email arrived in the spam folder rather than the primary inbox


## How to Run the System Locally

### 1. Clone the repository
```bash
git clone <repo-url>
cd Team8 

2. Install dependencies

Backend
cd backend
npm install

Frontend 
cd ../frontend
npm install

3. Seed the backend database
cd ~/Team8/backend
npx ts-node src/seed.ts

This creates:

* default topic list
* bootstrap coordinator account

Seeded bootstrap coordinator credentials:

* email: eraytuzun@cs.bilkent.edu.tr
* password: 123

4. Start the backend

If email delivery is not needed: 
cd ~/Team8/backend
JWT_SECRET=supersecret123 npm run dev
If password reset email delivery is needed locally:

cd ~/Team8/backend
FRONTEND_BASE_URL=http://localhost:3000 \
SMTP_HOST=smtp.gmail.com \
SMTP_PORT=587 \
SMTP_USER=<your_smtp_user> \
SMTP_PASS='<your_smtp_password_or_app_password>' \
SMTP_FROM=<your_from_email> \
JWT_SECRET=supersecret123 \
npm run dev

5. Start the frontend 
cd ~/Team8/frontend
npm install
npm run dev

7. Main flows to test

Coordinator flow:

* login as seeded coordinator
* pending approvals
* approval history
* lab members

Signup flow:

* open /signup
* create a new signup request
* verify that the new user remains pending until approval

Approval flow:

* open /pending-approvals
* approve or reject signup requests

Password flow:

* forgot password
* reset password through email link
* login with new password