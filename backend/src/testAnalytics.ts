/**
 * In-process tests for the issue #42 analytics endpoints.
 *
 * Requires the analytics seed to have been run first:
 *   npm run seed          (main seed)
 *   npm run seed:analytics (analytics data)
 *
 * Run with:
 *   npm run test:analytics
 */

import 'reflect-metadata';
import { AppDataSource } from './data-source';
import { Coordinator } from './entities/Coordinator';
import { Lab } from './entities/Lab';
import { User, UserRole } from './entities/User';
import { RatingAnalyticsController } from './controllers/RatingAnalyticsController';
import type { AuthenticatedRequest } from './types/auth';
import type { Response } from 'express';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeReq(user: User | undefined, params: Record<string, string> = {}): AuthenticatedRequest {
  return { user, params, body: {}, header: () => undefined } as unknown as AuthenticatedRequest;
}

function makeRes(): Response & { statusCode: number; data: unknown } {
  const res = {
    statusCode: 200,
    data: null as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(data: unknown) { this.data = data; return this; },
  };
  return res as unknown as Response & { statusCode: number; data: unknown };
}

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ✅  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  ❌  FAIL  ${label}`, detail ?? '');
    failed++;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function run() {
  await AppDataSource.initialize();

  const coordRepo = AppDataSource.getRepository(Coordinator);
  const userRepo  = AppDataSource.getRepository(User);
  const labRepo   = AppDataSource.getRepository(Lab);

  // Load coordinator (created by main seed)
  const coordinator = await coordRepo.findOne({
    where: { email: 'eraytuzun@cs.bilkent.edu.tr' },
    relations: ['lab'],
  });
  if (!coordinator) {
    console.error('❌  Coordinator not found — run the seeds first (npm run seed && npm run seed:analytics)');
    process.exitCode = 1;
    await AppDataSource.destroy();
    return;
  }

  // Load a plain LabMember to test role rejection
  const labMember = await userRepo.findOne({ where: { email: 'alice.reviewer@test.com' } });
  if (!labMember) {
    console.error('❌  Alice not found — run npm run seed:analytics first');
    process.exitCode = 1;
    await AppDataSource.destroy();
    return;
  }

  // Load a user from a different lab (or just any user not in the coordinator's lab)
  // We use a freshly checked user to test the cross-lab 403
  const lab = await labRepo.findOne({ where: { id: coordinator.lab?.id }, relations: ['members'] });

  console.log('\n══════════════════════════════════════════════');
  console.log('  Issue #42 — Analytics Endpoint Tests');
  console.log('══════════════════════════════════════════════\n');

  // ── GET /ratings/overall ──────────────────────────────────────────────────
  console.log('── GET /ratings/overall ─────────────────────');

  // Test 1: unauthenticated (req.user = undefined) — controller trusts middleware
  // The requireCoordinator middleware would block this before the controller runs.
  // Here we simulate what would happen if it slipped through.
  {
    const res = makeRes();
    const req = makeReq(undefined);
    await RatingAnalyticsController.getOverallAnalytics(req, res);
    check('No user → 500 or 404 (no coordinator in DB for undefined)', res.statusCode >= 400);
  }

  // Test 2: LabMember role — controller should not be reached (middleware blocks),
  // but if it were, it would fail because no Coordinator row exists for them.
  {
    const res = makeRes();
    const req = makeReq(labMember);
    await RatingAnalyticsController.getOverallAnalytics(req, res);
    check('LabMember role → 404 (not a coordinator row in DB)', res.statusCode === 404, res.data);
  }

  // Test 3: Valid coordinator → 200 with rankings array
  {
    const res = makeRes();
    const req = makeReq(coordinator);
    await RatingAnalyticsController.getOverallAnalytics(req, res);
    check('Coordinator → 200', res.statusCode === 200, res.data);

    const body = res.data as any;
    check('Response has rankings array', Array.isArray(body?.rankings), body);
    check('Response has summary object', typeof body?.summary === 'object', body);

    const rankings = body?.rankings ?? [];
    check('Rankings not empty (analytics seed was run)', rankings.length >= 4, `got ${rankings.length}`);

    // Test 4: Alice is rank 1 (highest aggregate score ≈ 4.77)
    const alice = rankings.find((r: any) => r.name === 'Alice Reviewer');
    check('Alice Reviewer is in rankings', !!alice, rankings.map((r: any) => r.name));
    check('Alice is rank 1', alice?.rank === 1, alice);
    check('Alice aggregateScore ≈ 4.77', alice && Math.abs(alice.aggregateScore - 4.766) < 0.01, alice?.aggregateScore);

    // Test 5: Bob is rank 2
    const bob = rankings.find((r: any) => r.name === 'Bob Reviewer');
    check('Bob is rank 2', bob?.rank === 2, bob);

    // Test 6: Carol is rank 3
    const carol = rankings.find((r: any) => r.name === 'Carol Reviewer');
    check('Carol is rank 3', carol?.rank === 3, carol);

    // Test 7: Dave has null aggregate score and is at the bottom
    const dave = rankings.find((r: any) => r.name === 'Dave Reviewer');
    check('Dave Reviewer is in rankings', !!dave, rankings.map((r: any) => r.name));
    check('Dave aggregateScore is null', dave?.aggregateScore === null, dave?.aggregateScore);
    check('Dave rank is last', dave?.rank === rankings.length, `dave.rank=${dave?.rank} total=${rankings.length}`);

    // Test 8: Rankings are sorted descending by aggregate (nulls last)
    const scored = rankings.filter((r: any) => r.aggregateScore !== null);
    const isSorted = scored.every((r: any, i: number) =>
      i === 0 || r.aggregateScore <= scored[i - 1].aggregateScore,
    );
    check('Scored reviewers sorted descending', isSorted, scored.map((r: any) => r.aggregateScore));

    // Test 9: Summary fields present
    const s = body?.summary;
    check('summary.totalReviewers >= 4', s?.totalReviewers >= 4, s?.totalReviewers);
    check('summary.highestScore ≈ 4.77', s?.highestScore && Math.abs(s.highestScore - 4.766) < 0.01, s?.highestScore);
    check('summary.lowestScore > 0 (Carol)', s?.lowestScore > 0, s?.lowestScore);
    check('summary.totalRatingsGiven >= 3', s?.totalRatingsGiven >= 3, s?.totalRatingsGiven);
  }

  // ── GET /ratings/user/:id ─────────────────────────────────────────────────
  console.log('\n── GET /ratings/user/:id ────────────────────');

  // Test 10: Target user not in coordinator's lab → 403
  {
    const res = makeRes();
    // Use a non-existent UUID as a proxy for "not in lab"
    const req = makeReq(coordinator, { id: '00000000-0000-0000-0000-000000000000' });
    await RatingAnalyticsController.getUserAnalytics(req, res);
    check('Unknown userId → 403', res.statusCode === 403, res.data);
  }

  // Test 11: Valid member → 200 with correct shape
  {
    const res = makeRes();
    const req = makeReq(coordinator, { id: labMember.id });
    await RatingAnalyticsController.getUserAnalytics(req, res);
    check('Valid lab member → 200', res.statusCode === 200, res.data);

    const body = res.data as any;
    check('Response has userId', body?.userId === labMember.id, body?.userId);
    check('Response has rank', typeof body?.rank === 'number', body?.rank);
    check('Response has totalReviewers', typeof body?.totalReviewers === 'number', body?.totalReviewers);
    check('Response has aggregateScore', 'aggregateScore' in (body ?? {}), body);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════');
  console.log(`  Results:  ${passed} passed,  ${failed} failed`);
  console.log('══════════════════════════════════════════════\n');

  if (failed > 0) process.exitCode = 1;

  await AppDataSource.destroy();
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
