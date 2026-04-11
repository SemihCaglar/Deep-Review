# Milestone 1 Auth Backend Test Commands

## Start backend

```bash
cd ~/Team8/backend
npm run dev


# 1) HEALTH CHECK
curl http://localhost:3001/health


# 2) SIGNUP SUCCESS
curl -X POST http://localhost:3001/api/account/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Final Test One",
    "email": "finaltest1@example.com",
    "password": "secret123"
  }'

# Expected:
# {"message":"Signup submitted and pending approval", ...}
# Copy the returned user.id. In this example:
# e106f6b2-b829-4849-ae26-74e8b1c7715d


# 3) DUPLICATE EMAIL
curl -X POST http://localhost:3001/api/account/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Final Test One",
    "email": "finaltest1@example.com",
    "password": "secret123"
  }'

# Expected:
# {"message":"Email is already in use"}


# 4) APPROVE SUCCESS
curl -X POST http://localhost:3001/api/account/approve/e106f6b2-b829-4849-ae26-74e8b1c7715d \
  -H "Content-Type: application/json" \
  -d '{
    "note": "Approved during final backend test."
  }'

# Expected:
# {"message":"Signup approved", ... "approvalStatus":"Approved" ...}


# 5) RE-APPROVE BLOCKED
curl -X POST http://localhost:3001/api/account/approve/e106f6b2-b829-4849-ae26-74e8b1c7715d \
  -H "Content-Type: application/json" \
  -d '{
    "note": "Try approving again."
  }'

# Expected:
# {"message":"Only pending signups can be approved"}


# 6) APPROVED USER LOGIN SUCCESS
curl -X POST http://localhost:3001/api/account/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "finaltest1@example.com",
    "password": "secret123"
  }'

# Expected:
# {"message":"Login successful", ...}


# 7) PENDING USER SIGNUP
curl -X POST http://localhost:3001/api/account/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Final Pending User",
    "email": "finalpending@example.com",
    "password": "pending123"
  }'

# Expected:
# {"message":"Signup submitted and pending approval", ...}


# 8) PENDING USER LOGIN BLOCKED
curl -X POST http://localhost:3001/api/account/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "finalpending@example.com",
    "password": "pending123"
  }'

# Expected:
# {"message":"Account is not approved"}


# 9) LOGOUT
curl -X POST http://localhost:3001/api/account/logout \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected:
# {"message":"Logout successful"}


# 10) LOCKOUT TEST USER SIGNUP
curl -X POST http://localhost:3001/api/account/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Final Lock User",
    "email": "finallock@example.com",
    "password": "lock123"
  }'

# Expected:
# {"message":"Signup submitted and pending approval", ...}
# Copy the returned user.id. In this example:
# 6435e229-c63b-44a9-8883-ee5e7c015ab5


# 11) LOCKOUT TEST USER APPROVE
curl -X POST http://localhost:3001/api/account/approve/6435e229-c63b-44a9-8883-ee5e7c015ab5 \
  -H "Content-Type: application/json" \
  -d '{
    "note": "Approved for final lockout test."
  }'

# Expected:
# {"message":"Signup approved", ...}


# 12) WRONG PASSWORD ATTEMPTS (RUN THIS 5 TIMES)
curl -X POST http://localhost:3001/api/account/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "finallock@example.com",
    "password": "wrongpass"
  }'

# Expected:
# 1-4 -> {"message":"Invalid email or password"}
# 5   -> {"message":"Account is temporarily locked"}


# 13) LOCKED ACCOUNT WITH CORRECT PASSWORD
curl -X POST http://localhost:3001/api/account/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "finallock@example.com",
    "password": "lock123"
  }'

# Expected:
# {"message":"Account is temporarily locked"}


# 14) FORGOT PASSWORD - EXISTING EMAIL
curl -X POST http://localhost:3001/api/account/reset-password/request \
  -H "Content-Type: application/json" \
  -d '{
    "email": "finaltest1@example.com"
  }'

# Expected:
# {"message":"If an account exists for that email, a password reset link will be sent"}

# After this step, a token log should appear in the backend terminal:
# Password reset token for finaltest1@example.com: <TOKEN>


# 15) FORGOT PASSWORD - NON-EXISTING EMAIL
curl -X POST http://localhost:3001/api/account/reset-password/request \
  -H "Content-Type: application/json" \
  -d '{
    "email": "nobodyfinal@example.com"
  }'

# Expected:
# The same generic response:
# {"message":"If an account exists for that email, a password reset link will be sent"}


# 16) RESET PASSWORD SUCCESS
# Replace TOKEN_HERE with the real token from the backend terminal
curl -X POST http://localhost:3001/api/account/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "TOKEN_HERE",
    "newPassword": "finalnew123"
  }'

# Expected:
# {"message":"Password reset successful"}


# 17) TOKEN REUSE BLOCKED
curl -X POST http://localhost:3001/api/account/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "TOKEN_HERE",
    "newPassword": "finalnew123"
  }'

# Expected:
# {"message":"Invalid or expired reset token"}


# 18) OLD PASSWORD FAILS AFTER RESET
curl -X POST http://localhost:3001/api/account/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "finaltest1@example.com",
    "password": "secret123"
  }'

# Expected:
# {"message":"Invalid email or password"}


# 19) NEW PASSWORD WORKS AFTER RESET
curl -X POST http://localhost:3001/api/account/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "finaltest1@example.com",
    "password": "finalnew123"
  }'

# Expected:
# {"message":"Login successful", ...}