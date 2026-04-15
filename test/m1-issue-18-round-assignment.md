# Milestone 1 Issue 18 Round & Assignment Entity Test Commands

## Concept
This file documents that the `Round`, `Assignment`, `Extension`, `Rating`, and `Summary` entities have been implemented successfully at the database level. Currently, the controllers return 501 Not Implemented, but we can verify that the seed script accurately populates the new schema without errors.

## Start backend and run seed

```bash
cd backend
# Reset and seed database
npx ts-node src/seed.ts

# Start the server
npm run dev
```

If `seed.ts` executes successfully and prints `✅ successfully seeded database!`, then the entity definitions, their relationships, and constraints are correctly configured in TypeORM.

## Post-Milestone 1 Endpoint Tests (Future)
When the assignment and round controllers are implemented, use the following commands to test.

### Get Round Assignments (To be evaluated when endpoint exists)
```bash
# Note: Obtain the true UUID of the round from the output of the seed script or database
curl -X GET http://localhost:3001/api/rounds/<roundId>/status
```

### Try assigning the same reviewer twice to test UNIQUE constraint
```bash
curl -X POST http://localhost:3001/api/assignments \
  -H "Content-Type: application/json" \
  -d '{
    "roundId": "...",
    "reviewerId": "..."
  }'
# Should fail with a unique constraint violation if re-assigning the exact same reviewer to the exact same round.
```
