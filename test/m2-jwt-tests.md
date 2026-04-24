# Issue #6 JWT Authentication Test Notes

## Purpose
This document records the manual verification steps for the JWT-based authentication update added to the backend.

## Environment
Run the backend with a JWT secret:

```bash
cd ~/Team8/backend
JWT_SECRET=supersecret123 npm run dev

Tested Behavior

1. Signup creates a pending account
curl -X POST http://localhost:3001/api/account/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "JWT Test User",
    "email": "jwttest@example.com",
    "password": "secret123"
  }'
Expected:

* pending account is created

2. Pending account cannot log in
curl -X POST http://localhost:3001/api/account/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jwttest@example.com",
    "password": "secret123"
  }'
  Expected:

* Account is not approved

3. Approved account can log in and receives JWT
curl -X POST http://localhost:3001/api/account/approve/fe841e93-2d25-460d-82f7-24d76f3ac1a8 \
  -H "Content-Type: application/json" \
  -d '{
    "note": "Approved for JWT auth test."
  }'
  curl -X POST http://localhost:3001/api/account/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jwttest@example.com",
    "password": "secret123"
  }'

  Expected:

* Login successful
* response includes token
* response includes safe user payload

4. Protected route without token is rejected
curl -X PUT http://localhost:3001/api/account/profile \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Name"
  }'

  Expected:

* Authentication required

5. Protected route with invalid token is rejected
curl -X PUT http://localhost:3001/api/account/profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer abc.def.ghi" \
  -d '{
    "name": "Test Name"
  }'
  Expected:

* Invalid or expired token

6. Protected route with valid token passes authentication

Use the JWT returned by login:
curl -X PUT http://localhost:3001/api/account/profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <VALID_JWT_TOKEN>" \
  -d '{
    "name": "Test Name"
  }'
  Expected:

* authentication passes
* current handler returns Not Implemented

This confirms:

* token verification works
* current-user context is attached successfully
* route protection is active

7. Logout remains stateless but works
curl -X POST http://localhost:3001/api/account/logout \
  -H "Content-Type: application/json" \
  -d '{}'
  Expected:

* Logout successful

8. TypeScript compile check
cd ~/Team8/backend
./node_modules/.bin/tsc --noEmit
Expected:

* no TypeScript errors

9. Backend fails fast when JWT secret is missing

cd ~/Team8/backend
npm run dev

Expected:

* backend does not start
* startup fails with JWT_SECRET environment variable is required

10. Backend starts normally when JWT secret is provided
cd ~/Team8/backend
JWT_SECRET=supersecret123 npm run dev
Expected:

* backend starts successfully

11. Pending user remains blocked from login
curl -X POST http://localhost:3001/api/account/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Pending JWT User",
    "email": "pendingjwt@example.com",
    "password": "secret123"
  }'

  curl -X POST http://localhost:3001/api/account/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "pendingjwt@example.com",
    "password": "secret123"
  }'

  Expected:

* Account is not approved

12. Duplicate email is rejected
curl -X POST http://localhost:3001/api/account/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lock JWT User",
    "email": "lockjwt@example.com",
    "password": "secret123"
  }'

  Run again with the same email.

Expected:

* second request returns Email is already in use

13. Lockout is enforced after repeated failed logins
curl -X POST http://localhost:3001/api/account/approve/f9bb9dad-c32c-4b1f-bcc9-5964f0011801 \
  -H "Content-Type: application/json" \
  -d '{
    "note": "Approved for lockout auth test."
  }'

  Then run this login request five times:
  curl -X POST http://localhost:3001/api/account/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "lockjwt@example.com",
    "password": "wrongpass"
  }'

  Expected:

* attempts 1 to 4 return Invalid email or password
* attempt 5 returns Account is temporarily locked

14. Locked account remains blocked even with correct password
curl -X POST http://localhost:3001/api/account/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "lockjwt@example.com",
    "password": "secret123"
  }'

  Expected:

* Account is temporarily locked

Verified Result

The JWT authentication layer is functioning as expected:

* login returns JWT
* protected account routes reject missing and invalid tokens
* valid JWT allows authenticated access to protected handlers
* approval enforcement remains active
* duplicate email checks remain active
* lockout behavior remains active
* logout remains a stateless success response
* backend fails fast if JWT secret is missing
* backend compiles successfully