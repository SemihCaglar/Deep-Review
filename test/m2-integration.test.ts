import 'reflect-metadata';
import request from 'supertest';
import app from '../backend/src/app';
import { AppDataSource } from '../backend/src/data-source';
import { Coordinator } from '../backend/src/entities/Coordinator';
import { LabMember } from '../backend/src/entities/LabMember';
import { Lab } from '../backend/src/entities/Lab';
import { Paper, PaperStatus } from '../backend/src/entities/Paper';
import { Round, RoundStatus, VenueCategory } from '../backend/src/entities/Round';
import { Assignment, AssignmentStatus } from '../backend/src/entities/Assignment';
import { ApprovalStatus } from '../backend/src/entities/User';
import { hashPassword } from '../backend/src/services/accountSecurity';

// ── Shared state (populated in beforeAll / sequential tests) ──────────────────

let coordinatorToken: string;
let reviewer1Token: string;
let reviewer2Token: string;
let reviewer4Token: string;

let coordinatorId: string;
let reviewer1Id: string;
let reviewer2Id: string;
let reviewer4Id: string;
let paperId: string;
let roundId: string;
let assignment1Id: string; // reviewer1 pre-assigned in seed
let assignment2Id: string; // reviewer2 assigned during tests
let assignment3Id: string; // reviewer1 re-assigned after cancel
let declineRequestId: string;
let extensionId: string;

// ── Seed ─────────────────────────────────────────────────────────────────────

async function seedTestDb() {
    const userRepo = AppDataSource.getRepository('User');
    const labRepo = AppDataSource.getRepository(Lab);
    const paperRepo = AppDataSource.getRepository(Paper);
    const roundRepo = AppDataSource.getRepository(Round);
    const assignRepo = AppDataSource.getRepository(Assignment);

    const pw = await hashPassword('123');

    const coordinator = Object.assign(new Coordinator(), {
        name: 'Test Coordinator',
        email: 'coordinator@test.com',
        passwordHash: pw,
        approvalStatus: ApprovalStatus.Approved,
        approvalReviewedAt: new Date(),
        approvalNote: null,
        failedLogins: 0,
        failedLoginWindowStartedAt: null,
        lockedUntil: null,
        lastLoginAt: null,
    });
    await userRepo.save(coordinator);
    coordinatorId = coordinator.id;

    const reviewer1 = Object.assign(new LabMember(), {
        name: 'Reviewer One',
        email: 'reviewer1@test.com',
        passwordHash: pw,
        approvalStatus: ApprovalStatus.Approved,
        approvalReviewedAt: new Date(),
        approvalNote: null,
        failedLogins: 0,
        failedLoginWindowStartedAt: null,
        lockedUntil: null,
        lastLoginAt: null,
    });
    await userRepo.save(reviewer1);
    reviewer1Id = reviewer1.id;

    const reviewer2 = Object.assign(new LabMember(), {
        name: 'Reviewer Two',
        email: 'reviewer2@test.com',
        passwordHash: pw,
        approvalStatus: ApprovalStatus.Approved,
        approvalReviewedAt: new Date(),
        approvalNote: null,
        failedLogins: 0,
        failedLoginWindowStartedAt: null,
        lockedUntil: null,
        lastLoginAt: null,
    });
    await userRepo.save(reviewer2);
    reviewer2Id = reviewer2.id;

    const reviewer4 = Object.assign(new LabMember(), {
        name: 'Reviewer Four',
        email: 'reviewer4@test.com',
        passwordHash: pw,
        approvalStatus: ApprovalStatus.Approved,
        approvalReviewedAt: new Date(),
        approvalNote: null,
        failedLogins: 0,
        failedLoginWindowStartedAt: null,
        lockedUntil: null,
        lastLoginAt: null,
    });
    await userRepo.save(reviewer4);
    reviewer4Id = reviewer4.id;

    const lab = labRepo.create({ name: 'Test Lab', description: 'Integration test lab' });
    lab.coordinator = coordinator;
    lab.members = [coordinator, reviewer1, reviewer2, reviewer4];
    await labRepo.save(lab);

    const paper = paperRepo.create({
        title: 'Integration Test Paper',
        abstractText: 'A paper for integration testing.',
        creationTime: new Date(),
        status: PaperStatus.HumanReview,
    });
    paper.coordinators = [coordinator];
    paper.labs = [lab];
    paper.authors = [];
    await paperRepo.save(paper);
    paperId = paper.id;

    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 14);
    const submissionDeadline = new Date();
    submissionDeadline.setDate(submissionDeadline.getDate() + 30);
    const round = roundRepo.create({
        paper,
        roundNumber: 1,
        deadline,
        status: RoundStatus.Open,
        targetVenue: 'ICSE 2026',
        venueCategory: VenueCategory.Conference,
        submissionDeadline,
        startedAt: new Date(),
    });
    await roundRepo.save(round);
    roundId = round.id;

    // Pre-assign reviewer1 so we can test various scenarios against it
    const a1 = assignRepo.create({
        round,
        reviewer: reviewer1 as any,
        status: AssignmentStatus.Invited,
        deadline: round.deadline,
        invitationSent: false,
    });
    await assignRepo.save(a1);
    assignment1Id = a1.id;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
    await AppDataSource.initialize();
    await AppDataSource.synchronize(true);
    await seedTestDb();
});

afterAll(async () => {
    await AppDataSource.destroy();
});

// ── Helper ────────────────────────────────────────────────────────────────────

const api = (token?: string) => {
    const r = request(app);
    return {
        get: (path: string) => r.get(path).set('Authorization', token ? `Bearer ${token}` : ''),
        post: (path: string, body: object) => r.post(path).set('Authorization', token ? `Bearer ${token}` : '').send(body),
        put: (path: string, body: object) => r.put(path).set('Authorization', token ? `Bearer ${token}` : '').send(body),
        delete: (path: string) => r.delete(path).set('Authorization', token ? `Bearer ${token}` : ''),
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. AUTHENTICATION
// ─────────────────────────────────────────────────────────────────────────────

describe('1 · Authentication', () => {
    test('coordinator login succeeds', async () => {
        const res = await request(app).post('/api/account/login').send({ email: 'coordinator@test.com', password: '123' });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeTruthy();
        coordinatorToken = res.body.token;
    });

    test('reviewer1 login succeeds', async () => {
        const res = await request(app).post('/api/account/login').send({ email: 'reviewer1@test.com', password: '123' });
        expect(res.status).toBe(200);
        reviewer1Token = res.body.token;
    });

    test('reviewer2 login succeeds', async () => {
        const res = await request(app).post('/api/account/login').send({ email: 'reviewer2@test.com', password: '123' });
        expect(res.status).toBe(200);
        reviewer2Token = res.body.token;
    });

    test('reviewer4 login succeeds', async () => {
        const res = await request(app).post('/api/account/login').send({ email: 'reviewer4@test.com', password: '123' });
        expect(res.status).toBe(200);
        reviewer4Token = res.body.token;
    });

    test('wrong password returns 401', async () => {
        const res = await request(app).post('/api/account/login').send({ email: 'coordinator@test.com', password: 'wrong' });
        expect(res.status).toBe(401);
    });

    test('unknown email returns 401', async () => {
        const res = await request(app).post('/api/account/login').send({ email: 'nobody@test.com', password: '123' });
        expect(res.status).toBe(401);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. COORDINATOR — PAPER & ROUND VIEWS
// ─────────────────────────────────────────────────────────────────────────────

describe('2 · Paper & Round views', () => {
    test('coordinator sees their coordinated papers', async () => {
        const res = await api(coordinatorToken).get('/api/papers/my-coordinated');
        expect(res.status).toBe(200);
        expect(res.body.some((p: any) => p.id === paperId)).toBe(true);
    });

    test('reviewer cannot access coordinated papers endpoint', async () => {
        const res = await api(reviewer1Token).get('/api/papers/my-coordinated');
        expect(res.status).toBe(403);
    });

    test('coordinator sees rounds with assignments', async () => {
        const res = await api(coordinatorToken).get(`/api/papers/${paperId}/rounds`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].id).toBe(roundId);
        expect(res.body[0].assignments).toHaveLength(1);
        expect(res.body[0].assignments[0].id).toBe(assignment1Id);
    });

    test('reviewer cannot access round details', async () => {
        const res = await api(reviewer1Token).get(`/api/papers/${paperId}/rounds`);
        expect(res.status).toBe(403);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. REVIEWER SUGGESTIONS
// ─────────────────────────────────────────────────────────────────────────────

describe('3 · Reviewer suggestions', () => {
    test('suggestions exclude coordinator', async () => {
        const res = await api(coordinatorToken).get(`/api/rounds/${roundId}/suggest`);
        expect(res.status).toBe(200);
        const ids = res.body.map((s: any) => s.user.id);
        expect(ids).not.toContain(coordinatorId);
    });

    test('suggestions exclude reviewer1 (already has active assignment)', async () => {
        const res = await api(coordinatorToken).get(`/api/rounds/${roundId}/suggest`);
        const ids = res.body.map((s: any) => s.user.id);
        expect(ids).not.toContain(reviewer1Id);
    });

    test('suggestions include reviewer2 (no assignment yet)', async () => {
        const res = await api(coordinatorToken).get(`/api/rounds/${roundId}/suggest`);
        const ids = res.body.map((s: any) => s.user.id);
        expect(ids).toContain(reviewer2Id);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. ASSIGN REVIEWERS
// ─────────────────────────────────────────────────────────────────────────────

describe('4 · Assign reviewers', () => {
    test('coordinator assigns reviewer2 successfully', async () => {
        const res = await api(coordinatorToken).post('/api/assignments', { roundId, reviewerIds: [reviewer2Id] });
        expect(res.status).toBe(201);
        expect(res.body).toHaveLength(1);
        assignment2Id = res.body[0].id;
    });

    test('assigning reviewer2 again is idempotent (no duplicate created)', async () => {
        const res = await api(coordinatorToken).post('/api/assignments', { roundId, reviewerIds: [reviewer2Id] });
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/No new assignments/i);
    });

    test('assigning coordinator is silently skipped', async () => {
        const res = await api(coordinatorToken).post('/api/assignments', { roundId, reviewerIds: [coordinatorId] });
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/No new assignments/i);
    });

    test('reviewer cannot assign', async () => {
        const res = await api(reviewer1Token).post('/api/assignments', { roundId, reviewerIds: [reviewer2Id] });
        expect(res.status).toBe(403);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. SEND INVITATIONS
// ─────────────────────────────────────────────────────────────────────────────

describe('5 · Send invitations', () => {
    test('sends invitations to uninvited reviewers', async () => {
        const res = await api(coordinatorToken).post('/api/assignments/invite', { roundId });
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/invitation/i);
    });

    test('sending again sends 0 (idempotent)', async () => {
        const res = await api(coordinatorToken).post('/api/assignments/invite', { roundId });
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/0 reviewer/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. REVIEWER — MY ASSIGNMENTS
// ─────────────────────────────────────────────────────────────────────────────

describe('6 · My assignments', () => {
    test('reviewer2 sees their assignment', async () => {
        const res = await api(reviewer2Token).get('/api/assignments/my');
        expect(res.status).toBe(200);
        const found = res.body.find((a: any) => a.id === assignment2Id);
        expect(found).toBeTruthy();
        expect(found.status).toBe('Invited');
        expect(found.paper.id).toBe(paperId);
    });

    test('reviewer1 sees their assignment', async () => {
        const res = await api(reviewer1Token).get('/api/assignments/my');
        expect(res.status).toBe(200);
        expect(res.body.some((a: any) => a.id === assignment1Id)).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. RESPOND TO INVITATION — ACCEPT
// ─────────────────────────────────────────────────────────────────────────────

describe('7 · Accept invitation', () => {
    test('reviewer2 accepts invitation', async () => {
        const res = await api(reviewer2Token).post('/api/responses/invitation', {
            assignmentId: assignment2Id,
            response: 'accept',
        });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('Accepted');
    });

    test('accepting again returns error (not Invited anymore)', async () => {
        const res = await api(reviewer2Token).post('/api/responses/invitation', {
            assignmentId: assignment2Id,
            response: 'accept',
        });
        expect(res.status).toBe(400);
    });

    test('reviewer cannot accept someone elses assignment', async () => {
        const res = await api(reviewer2Token).post('/api/responses/invitation', {
            assignmentId: assignment1Id,
            response: 'accept',
        });
        expect(res.status).toBe(403);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. UPDATE ASSIGNMENT DEADLINE
// ─────────────────────────────────────────────────────────────────────────────

describe('8 · Update assignment deadline', () => {
    test('coordinator updates reviewer2 deadline', async () => {
        const newDeadline = new Date();
        newDeadline.setDate(newDeadline.getDate() + 7);
        const res = await api(coordinatorToken).put(`/api/assignments/${assignment2Id}/deadline`, {
            deadline: newDeadline.toISOString(),
        });
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(assignment2Id);
    });

    test('reviewer cannot update deadline', async () => {
        const res = await api(reviewer2Token).put(`/api/assignments/${assignment2Id}/deadline`, {
            deadline: new Date().toISOString(),
        });
        expect(res.status).toBe(403);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. REQUEST DEADLINE EXTENSION
// ─────────────────────────────────────────────────────────────────────────────

describe('9 · Deadline extension request', () => {
    test('extension with date before current deadline is rejected', async () => {
        const past = new Date();
        past.setDate(past.getDate() - 1);
        const res = await api(reviewer2Token).post('/api/responses/extension', {
            assignmentId: assignment2Id,
            reason: 'Need more time',
            requestedDeadline: past.toISOString(),
        });
        expect(res.status).toBe(400);
    });

    test('reviewer2 submits valid extension request', async () => {
        const future = new Date();
        future.setDate(future.getDate() + 21);
        const res = await api(reviewer2Token).post('/api/responses/extension', {
            assignmentId: assignment2Id,
            reason: 'Conference overlap',
            requestedDeadline: future.toISOString(),
        });
        expect([200, 201]).toContain(res.status);
        expect(res.body.extensionId).toBeTruthy();
        extensionId = res.body.extensionId;
    });

    test('submitting another extension overwrites the pending one (same extensionId)', async () => {
        const future = new Date();
        future.setDate(future.getDate() + 28);
        const res = await api(reviewer2Token).post('/api/responses/extension', {
            assignmentId: assignment2Id,
            reason: 'Updated request',
            requestedDeadline: future.toISOString(),
        });
        expect(res.status).toBe(200);
        expect(res.body.extensionId).toBe(extensionId); // same ID — overwritten
    });

    test('coordinator sees pending extension in round view', async () => {
        const res = await api(coordinatorToken).get(`/api/papers/${paperId}/rounds`);
        const a2 = res.body[0].assignments.find((a: any) => a.id === assignment2Id);
        expect(a2.pendingExtensionRequest).not.toBeNull();
        expect(a2.pendingExtensionRequest.id).toBe(extensionId);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. PROCESS EXTENSION
// ─────────────────────────────────────────────────────────────────────────────

describe('10 · Process extension', () => {
    test('reviewer cannot process extension', async () => {
        const approved = new Date();
        approved.setDate(approved.getDate() + 25);
        const res = await api(reviewer2Token).post('/api/responses/process-extension', {
            extensionId,
            decision: 'approve',
            approvedDeadline: approved.toISOString(),
        });
        expect(res.status).toBe(403);
    });

    test('coordinator approves extension and deadline updates', async () => {
        const approved = new Date();
        approved.setDate(approved.getDate() + 25);
        const res = await api(coordinatorToken).post('/api/responses/process-extension', {
            extensionId,
            decision: 'approve',
            approvedDeadline: approved.toISOString(),
        });
        expect(res.status).toBe(200);
        expect(new Date(res.body.assignmentDeadline).getTime()).toBeCloseTo(approved.getTime(), -3);
    });

    test('approving again returns error (already processed)', async () => {
        const approved = new Date();
        approved.setDate(approved.getDate() + 25);
        const res = await api(coordinatorToken).post('/api/responses/process-extension', {
            extensionId,
            decision: 'approve',
            approvedDeadline: approved.toISOString(),
        });
        expect(res.status).toBe(400);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. COMPLETE REVIEW
// ─────────────────────────────────────────────────────────────────────────────

describe('11 · Complete review', () => {
    test('reviewer2 completes their review with a summary', async () => {
        const res = await api(reviewer2Token).post('/api/responses/complete', {
            assignmentId: assignment2Id,
            summary: 'The paper is well-structured and contribution is clear.',
        });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('Completed');
    });

    test('completing again returns error', async () => {
        const res = await api(reviewer2Token).post('/api/responses/complete', {
            assignmentId: assignment2Id,
        });
        expect(res.status).toBe(400);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. SUGGESTIONS AFTER COMPLETION
// ─────────────────────────────────────────────────────────────────────────────

describe('12 · Suggestions after completion', () => {
    test('reviewer2 excluded from suggestions after completing review', async () => {
        const res = await api(coordinatorToken).get(`/api/rounds/${roundId}/suggest`);
        expect(res.status).toBe(200);
        const ids = res.body.map((s: any) => s.user.id);
        expect(ids).not.toContain(reviewer2Id);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. CANCEL & RE-ASSIGN
// ─────────────────────────────────────────────────────────────────────────────

describe('13 · Cancel and re-assign', () => {
    test('coordinator cancels reviewer1 assignment', async () => {
        const res = await api(coordinatorToken).delete(`/api/assignments/${assignment1Id}`);
        expect(res.status).toBe(200);
    });

    test('reviewer1 does NOT reappear in suggestions after cancel', async () => {
        const res = await api(coordinatorToken).get(`/api/rounds/${roundId}/suggest`);
        const ids = res.body.map((s: any) => s.user.id);
        expect(ids).not.toContain(reviewer1Id);
    });

    test('reviewer1 cannot be re-assigned after cancel', async () => {
        const res = await api(coordinatorToken).post('/api/assignments', { roundId, reviewerIds: [reviewer1Id] });
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/No new assignments/i);
    });

    test('reviewer4 can be assigned instead', async () => {
        const res = await api(coordinatorToken).post('/api/assignments', { roundId, reviewerIds: [reviewer4Id] });
        expect(res.status).toBe(201);
        expect(res.body).toHaveLength(1);
        assignment3Id = res.body[0].id;
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. DECLINE INVITATION
// ─────────────────────────────────────────────────────────────────────────────

describe('14 · Decline invitation', () => {
    test('decline without reason returns 400', async () => {
        const res = await api(reviewer4Token).post('/api/responses/invitation', {
            assignmentId: assignment3Id,
            response: 'decline',
        });
        expect(res.status).toBe(400);
    });

    test('reviewer4 declines with a reason — creates pending decline request', async () => {
        const res = await api(reviewer4Token).post('/api/responses/invitation', {
            assignmentId: assignment3Id,
            response: 'decline',
            reason: 'Conflict of schedule',
        });
        expect(res.status).toBe(201);
        expect(res.body.declineRequestId).toBeTruthy();
        declineRequestId = res.body.declineRequestId;
    });

    test('coordinator sees pending decline request in round view', async () => {
        const res = await api(coordinatorToken).get(`/api/papers/${paperId}/rounds`);
        const a3 = res.body[0].assignments.find((a: any) => a.id === assignment3Id);
        expect(a3.pendingDeclineRequest).not.toBeNull();
        expect(a3.pendingDeclineRequest.id).toBe(declineRequestId);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. PROCESS DECLINE REQUEST
// ─────────────────────────────────────────────────────────────────────────────

describe('15 · Process decline request', () => {
    test('reviewer cannot process decline request', async () => {
        const res = await api(reviewer4Token).post('/api/responses/process-decline', {
            declineRequestId,
            decision: 'approve',
        });
        expect(res.status).toBe(403);
    });

    test('coordinator approves decline — assignment becomes Declined', async () => {
        const res = await api(coordinatorToken).post('/api/responses/process-decline', {
            declineRequestId,
            decision: 'approve',
        });
        expect(res.status).toBe(200);
        expect(res.body.assignmentStatus).toBe('Declined');
    });

    test('processing same decline request again returns 400', async () => {
        const res = await api(coordinatorToken).post('/api/responses/process-decline', {
            declineRequestId,
            decision: 'reject',
        });
        expect(res.status).toBe(400);
    });

    test('declined reviewer no longer appears in suggestions (not Cancelled)', async () => {
        const res = await api(coordinatorToken).get(`/api/rounds/${roundId}/suggest`);
        const ids = res.body.map((s: any) => s.user.id);
        expect(ids).not.toContain(reviewer4Id);
    });
});
