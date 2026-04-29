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
import { RoundService } from '../backend/src/services/RoundService';

// ── Shared state ──────────────────────────────────────────────────────────────

let coordinatorToken: string;
let reviewer1Token: string;
let reviewer2Token: string;

let coordinatorId: string;
let reviewer1Id: string;  // in lab, not author
let reviewer2Id: string;  // in lab, not author
let reviewer3Id: string;  // NOT in lab (for lab-check tests)
let authorId: string;     // in lab AND paper author (for COI tests)
let labId: string;
let paperId: string;

let conferenceRoundId: string;  // main round used across sections
let assignment1Id: string;      // reviewer1's assignment
let declineRequestId: string;
let extensionId: string;

// ── Seed ─────────────────────────────────────────────────────────────────────

async function seedTestDb() {
    const userRepo = AppDataSource.getRepository('User');
    const labRepo  = AppDataSource.getRepository(Lab);
    const paperRepo = AppDataSource.getRepository(Paper);

    const pw = await hashPassword('123');

    const mkUser = (Cls: any, name: string, email: string) =>
        Object.assign(new Cls(), {
            name, email,
            passwordHash: pw,
            approvalStatus: ApprovalStatus.Approved,
            approvalReviewedAt: new Date(),
            approvalNote: null,
            failedLogins: 0,
            failedLoginWindowStartedAt: null,
            lockedUntil: null,
            lastLoginAt: null,
        });

    const coordinator = mkUser(Coordinator, 'Coordinator', 'coord23@test.com');
    const reviewer1   = mkUser(LabMember,   'Reviewer One',   'r1_23@test.com');
    const reviewer2   = mkUser(LabMember,   'Reviewer Two',   'r2_23@test.com');
    const reviewer3   = mkUser(LabMember,   'Reviewer Three', 'r3_23@test.com'); // NOT in lab
    const author      = mkUser(LabMember,   'Paper Author',   'author23@test.com');

    for (const u of [coordinator, reviewer1, reviewer2, reviewer3, author]) {
        await userRepo.save(u);
    }
    coordinatorId = coordinator.id;
    reviewer1Id   = reviewer1.id;
    reviewer2Id   = reviewer2.id;
    reviewer3Id   = reviewer3.id;
    authorId      = author.id;

    const lab = labRepo.create({ name: 'Issue23 Lab', description: '' });
    lab.coordinator = coordinator;
    lab.members = [coordinator, reviewer1, reviewer2, author]; // reviewer3 intentionally excluded
    await labRepo.save(lab);
    labId = lab.id;

    const paper = paperRepo.create({
        title: 'Issue 23 Test Paper',
        abstractText: 'Testing round and assignment lifecycle.',
        creationTime: new Date(),
        status: PaperStatus.Draft,
    });
    paper.coordinators = [coordinator];
    paper.labs = [lab];
    paper.authors = [author]; // author is a COI
    await paperRepo.save(paper);
    paperId = paper.id;
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
        get:    (path: string)              => r.get(path).set('Authorization', token ? `Bearer ${token}` : ''),
        post:   (path: string, body: object) => r.post(path).set('Authorization', token ? `Bearer ${token}` : '').send(body),
        put:    (path: string, body: object) => r.put(path).set('Authorization', token ? `Bearer ${token}` : '').send(body),
        patch:  (path: string, body: object) => r.patch(path).set('Authorization', token ? `Bearer ${token}` : '').send(body),
        delete: (path: string)              => r.delete(path).set('Authorization', token ? `Bearer ${token}` : ''),
    };
};

const futureDate = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString();
};

const pastDate = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. AUTHENTICATION
// ─────────────────────────────────────────────────────────────────────────────

describe('1 · Authentication', () => {
    test('coordinator login', async () => {
        const res = await request(app).post('/api/account/login').send({ email: 'coord23@test.com', password: '123' });
        expect(res.status).toBe(200);
        coordinatorToken = res.body.token;
    });

    test('reviewer1 login', async () => {
        const res = await request(app).post('/api/account/login').send({ email: 'r1_23@test.com', password: '123' });
        expect(res.status).toBe(200);
        reviewer1Token = res.body.token;
    });

    test('reviewer2 login', async () => {
        const res = await request(app).post('/api/account/login').send({ email: 'r2_23@test.com', password: '123' });
        expect(res.status).toBe(200);
        reviewer2Token = res.body.token;
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ROUND CREATION — ERROR CASES
// ─────────────────────────────────────────────────────────────────────────────

describe('2 · Round creation — error cases', () => {
    test('missing venueCategory → 400', async () => {
        const res = await api(coordinatorToken).post('/api/rounds', {
            paperId,
            coordinatorId,
            targetVenue: 'ICSE 2026',
        });
        expect(res.status).toBe(400);
    });

    test('invalid venueCategory value → 400', async () => {
        const res = await api(coordinatorToken).post('/api/rounds', {
            paperId,
            coordinatorId,
            targetVenue: 'ICSE 2026',
            venueCategory: 'Workshop',
        });
        expect(res.status).toBe(400);
    });

    test('Conference without submissionDeadline → 400', async () => {
        const res = await api(coordinatorToken).post('/api/rounds', {
            paperId,
            coordinatorId,
            targetVenue: 'ICSE 2026',
            venueCategory: 'Conference',
        });
        expect(res.status).toBe(400);
    });

    test('non-coordinator cannot create round → 403', async () => {
        const res = await api(reviewer1Token).post('/api/rounds', {
            paperId,
            coordinatorId: reviewer1Id,
            targetVenue: 'ICSE 2026',
            venueCategory: 'Conference',
            submissionDeadline: futureDate(30),
        });
        expect(res.status).toBe(403);
    });

    test('coordinator not owner of paper → 403', async () => {
        // Create a second coordinator not linked to this paper
        const userRepo = AppDataSource.getRepository('User');
        const pw = await hashPassword('123');
        const otherCoord = Object.assign(new Coordinator(), {
            name: 'Other Coord', email: 'othercoord23@test.com',
            passwordHash: pw, approvalStatus: ApprovalStatus.Approved,
            approvalReviewedAt: new Date(), approvalNote: null,
            failedLogins: 0, failedLoginWindowStartedAt: null,
            lockedUntil: null, lastLoginAt: null,
        });
        await userRepo.save(otherCoord);
        const loginRes = await request(app).post('/api/account/login').send({ email: 'othercoord23@test.com', password: '123' });
        const otherToken = loginRes.body.token;

        const res = await api(otherToken).post('/api/rounds', {
            paperId,
            coordinatorId: otherCoord.id,
            targetVenue: 'ICSE 2026',
            venueCategory: 'Conference',
            submissionDeadline: futureDate(30),
        });
        expect(res.status).toBe(403);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ROUND CREATION — HAPPY PATHS
// ─────────────────────────────────────────────────────────────────────────────

describe('3 · Round creation — happy paths', () => {
    test('Article round without submissionDeadline → 201', async () => {
        const res = await api(coordinatorToken).post('/api/rounds', {
            paperId,
            coordinatorId,
            targetVenue: 'Journal of SE',
            venueCategory: 'Article',
        });
        expect(res.status).toBe(201);
        expect(res.body.status).toBe('Draft');
        expect(res.body.venueCategory).toBe('Article');
        expect(res.body.submissionDeadline).toBeNull();

        // Clean up: delete this draft so main Conference round can be created cleanly
        const roundRepo = AppDataSource.getRepository(Round);
        await roundRepo.delete(res.body.id);
    });

    test('Conference round with submissionDeadline → 201, status=Draft', async () => {
        const res = await api(coordinatorToken).post('/api/rounds', {
            paperId,
            coordinatorId,
            targetVenue: 'ICSE 2026',
            venueCategory: 'Conference',
            submissionDeadline: futureDate(30),
        });
        expect(res.status).toBe(201);
        expect(res.body.status).toBe('Draft');
        expect(res.body.targetVenue).toBe('ICSE 2026');
        expect(res.body.venueCategory).toBe('Conference');
        expect(res.body.submissionDeadline).not.toBeNull();
        expect(res.body.startedAt).toBeNull();
        expect(res.body.completedAt).toBeNull();
        conferenceRoundId = res.body.id;
    });

    test('creating another round while previous is Draft → 409', async () => {
        const res = await api(coordinatorToken).post('/api/rounds', {
            paperId,
            coordinatorId,
            targetVenue: 'FSE 2026',
            venueCategory: 'Conference',
            submissionDeadline: futureDate(30),
        });
        expect(res.status).toBe(409);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. ROUND DEADLINE EDIT
// ─────────────────────────────────────────────────────────────────────────────

describe('4 · Round deadline edit', () => {
    test('can set deadline while in Draft → 200', async () => {
        const res = await api(coordinatorToken).put(`/api/rounds/${conferenceRoundId}/deadline`, {
            coordinatorId,
            deadline: futureDate(14),
        });
        expect(res.status).toBe(200);
    });

    test('deadline beyond submissionDeadline → 400', async () => {
        const res = await api(coordinatorToken).put(`/api/rounds/${conferenceRoundId}/deadline`, {
            coordinatorId,
            deadline: futureDate(60), // submissionDeadline is +30 days
        });
        expect(res.status).toBe(400);
    });

    test('invalid date → 400', async () => {
        const res = await api(coordinatorToken).put(`/api/rounds/${conferenceRoundId}/deadline`, {
            coordinatorId,
            deadline: 'not-a-date',
        });
        expect(res.status).toBe(400);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. START ROUND
// ─────────────────────────────────────────────────────────────────────────────

describe('5 · Start round', () => {
    test('reviewer cannot start round → 403', async () => {
        const res = await api(reviewer1Token).post(`/api/rounds/${conferenceRoundId}/start`, {
            coordinatorId: reviewer1Id,
        });
        expect(res.status).toBe(403);
    });

    test('round without deadline cannot be started — create a no-deadline draft to verify', async () => {
        // Create a throwaway Conference draft without setting a deadline
        const createRes = await api(coordinatorToken).post('/api/rounds', {
            paperId: (await (() => {
                // We need a second paper for this isolated test
                return Promise.resolve(null);
            })()),
            coordinatorId,
            targetVenue: 'SOSP 2026',
            venueCategory: 'Conference',
            submissionDeadline: futureDate(30),
        });
        // Can't create because conferenceRound is still active — we verify via the service directly
        const roundRepo = AppDataSource.getRepository(Round);
        const noDlRound = roundRepo.create({
            paper: { id: paperId } as any,
            roundNumber: 99,
            status: RoundStatus.Draft,
            targetVenue: 'SOSP 2026',
            venueCategory: VenueCategory.Conference,
            submissionDeadline: new Date(futureDate(30)),
            deadline: null,
            startedAt: null,
            completedAt: null,
        });
        await roundRepo.save(noDlRound);

        const res = await api(coordinatorToken).post(`/api/rounds/${noDlRound.id}/start`, { coordinatorId });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/deadline/i);

        await roundRepo.delete(noDlRound.id);
    });

    test('start round with all fields set → 200, status=Open, startedAt set', async () => {
        const res = await api(coordinatorToken).post(`/api/rounds/${conferenceRoundId}/start`, { coordinatorId });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('Open');
        expect(res.body.startedAt).not.toBeNull();
    });

    test('starting an already-Open round → 400', async () => {
        const res = await api(coordinatorToken).post(`/api/rounds/${conferenceRoundId}/start`, { coordinatorId });
        expect(res.status).toBe(400);
    });

    test('editing deadline on Open round → 400', async () => {
        const res = await api(coordinatorToken).put(`/api/rounds/${conferenceRoundId}/deadline`, {
            coordinatorId,
            deadline: futureDate(10),
        });
        expect(res.status).toBe(400);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. SEND INVITATIONS — PAPER STATUS TRANSITION
// ─────────────────────────────────────────────────────────────────────────────

describe('6 · Send invitations & paper status', () => {
    test('assign reviewer1 to round', async () => {
        const res = await api(coordinatorToken).post('/api/assignments', {
            roundId: conferenceRoundId,
            reviewerIds: [reviewer1Id],
        });
        expect(res.status).toBe(201);
        assignment1Id = res.body[0].id;
    });

    test('send invitations → paper transitions to HumanReview', async () => {
        const res = await api(coordinatorToken).post('/api/assignments/invite', { roundId: conferenceRoundId });
        expect(res.status).toBe(200);

        const paperRepo = AppDataSource.getRepository(Paper);
        const paper = await paperRepo.findOne({ where: { id: paperId } });
        expect(paper?.status).toBe(PaperStatus.HumanReview);
    });

    test('sending invitations again sends 0 (idempotent)', async () => {
        const res = await api(coordinatorToken).post('/api/assignments/invite', { roundId: conferenceRoundId });
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/0 reviewer/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. GET ROUNDS — NEW FIELDS EXPOSED
// ─────────────────────────────────────────────────────────────────────────────

describe('7 · getRoundsWithAssignments — new fields', () => {
    test('response includes targetVenue, venueCategory, submissionDeadline, startedAt, completedAt', async () => {
        const res = await api(coordinatorToken).get(`/api/papers/${paperId}/rounds`);
        expect(res.status).toBe(200);
        const round = res.body.find((r: any) => r.id === conferenceRoundId);
        expect(round).toBeTruthy();
        expect(round.targetVenue).toBe('ICSE 2026');
        expect(round.venueCategory).toBe('Conference');
        expect(round.submissionDeadline).not.toBeNull();
        expect(round.startedAt).not.toBeNull();
        expect(round.completedAt).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. ASSIGNMENT DEADLINE CEILING
// ─────────────────────────────────────────────────────────────────────────────

describe('8 · Assignment deadline ceiling', () => {
    test('coordinator cannot set assignment deadline beyond submissionDeadline → 400', async () => {
        const res = await api(coordinatorToken).put(`/api/assignments/${assignment1Id}/deadline`, {
            deadline: futureDate(60), // submissionDeadline is +30 days
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/submission deadline/i);
    });

    test('coordinator can set deadline up to submissionDeadline → 200', async () => {
        const res = await api(coordinatorToken).put(`/api/assignments/${assignment1Id}/deadline`, {
            deadline: futureDate(28),
        });
        expect(res.status).toBe(200);
    });

    test('reviewer cannot update deadline → 403', async () => {
        const res = await api(reviewer1Token).put(`/api/assignments/${assignment1Id}/deadline`, {
            deadline: futureDate(7),
        });
        expect(res.status).toBe(403);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. REASSIGNMENT — CANCEL FLOW
// ─────────────────────────────────────────────────────────────────────────────

describe('9 · Reassignment after cancellation', () => {
    test('cancel assignment → returns roundId for frontend reassignment flow', async () => {
        const res = await api(coordinatorToken).delete(`/api/assignments/${assignment1Id}`);
        expect(res.status).toBe(200);
        expect(res.body.roundId).toBe(conferenceRoundId);
    });

    test('reassign to reviewer2 → old assignment Reassigned, new assignment created with round deadline', async () => {
        const roundRepo = AppDataSource.getRepository(Round);
        const round = await roundRepo.findOne({ where: { id: conferenceRoundId } });
        const roundDeadline = round!.deadline!.toISOString();

        const res = await api(coordinatorToken).post(`/api/assignments/${assignment1Id}/reassign`, {
            newReviewerId: reviewer2Id,
            labId,
        });
        expect(res.status).toBe(201);
        expect(res.body.reviewer.id).toBe(reviewer2Id);
        expect(res.body.status).toBe(AssignmentStatus.Invited);
        // New assignment deadline matches round deadline
        expect(new Date(res.body.deadline).getTime()).toBeCloseTo(new Date(roundDeadline).getTime(), -3);

        // Old assignment is now Reassigned
        const assignRepo = AppDataSource.getRepository(Assignment);
        const old = await assignRepo.findOne({ where: { id: assignment1Id } });
        expect(old?.status).toBe(AssignmentStatus.Reassigned);

        assignment1Id = res.body.id; // track new assignment for future tests
    });

    test('reassigning an already-Reassigned assignment → 400', async () => {
        // assignment1Id is now the old (Reassigned) assignment - get its original id
        const assignRepo = AppDataSource.getRepository(Assignment);
        const reassigned = await assignRepo.findOne({
            where: { status: AssignmentStatus.Reassigned },
        });
        expect(reassigned).not.toBeNull();

        const res = await api(coordinatorToken).post(`/api/assignments/${reassigned!.id}/reassign`, {
            newReviewerId: reviewer1Id,
            labId,
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/Reassigned/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. REASSIGNMENT — ELIGIBILITY EDGE CASES
// ─────────────────────────────────────────────────────────────────────────────

describe('10 · Reassignment — eligibility edge cases', () => {
    test('reassign to paper author (COI) → 400', async () => {
        const res = await api(coordinatorToken).post(`/api/assignments/${assignment1Id}/reassign`, {
            newReviewerId: authorId,
            labId,
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/conflict of interest/i);
    });

    test('reassign to reviewer not in lab → 400', async () => {
        const res = await api(coordinatorToken).post(`/api/assignments/${assignment1Id}/reassign`, {
            newReviewerId: reviewer3Id,
            labId,
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/same lab/i);
    });

    test('reassign to reviewer already active in round → 400', async () => {
        // reviewer2 already has an active assignment from section 9
        const res = await api(coordinatorToken).post(`/api/assignments/${assignment1Id}/reassign`, {
            newReviewerId: reviewer2Id,
            labId,
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/already has an active assignment/i);
    });

    test('non-existent reviewer → 404', async () => {
        const res = await api(coordinatorToken).post(`/api/assignments/${assignment1Id}/reassign`, {
            newReviewerId: '00000000-0000-0000-0000-000000000000',
            labId,
        });
        expect(res.status).toBe(404);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. DECLINE REQUEST + REASSIGNMENT FLOW
// ─────────────────────────────────────────────────────────────────────────────

describe('11 · Decline approval → reassign flow', () => {
    test('reviewer2 accepts their invitation', async () => {
        const res = await api(reviewer2Token).patch(`/api/responses/${assignment1Id}/accept`, {});
        expect(res.status).toBe(200);
    });

    test('reviewer2 requests decline', async () => {
        const res = await api(reviewer2Token).post(`/api/responses/${assignment1Id}/decline-request`, {
            declineReason: 'Overloaded with other work',
        });
        expect(res.status).toBe(201);
        declineRequestId = res.body.declineRequestId;
        expect(declineRequestId).toBeTruthy();
    });

    test('coordinator approves decline → assignment Declined, roundId in response', async () => {
        const res = await api(coordinatorToken).patch(`/api/assignments/${assignment1Id}/process-decline`, {
            decision: 'Approve',
            labId,
        });
        expect(res.status).toBe(200);
        expect(res.body.assignment.status).toBe('Declined');
    });

    test('reassign to reviewer1 after decline → new assignment created', async () => {
        const res = await api(coordinatorToken).post(`/api/assignments/${assignment1Id}/reassign`, {
            newReviewerId: reviewer1Id,
            labId,
        });
        expect(res.status).toBe(201);
        expect(res.body.reviewer.id).toBe(reviewer1Id);
        expect(res.body.status).toBe('Invited');

        assignment1Id = res.body.id;
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. EXTENSION DEADLINE CEILING (Conference)
// ─────────────────────────────────────────────────────────────────────────────

describe('12 · Extension deadline ceiling for Conference round', () => {
    test('reviewer1 accepts invitation', async () => {
        const res = await api(reviewer1Token).patch(`/api/responses/${assignment1Id}/accept`, {});
        expect(res.status).toBe(200);
    });

    test('reviewer1 requests extension', async () => {
        const res = await api(reviewer1Token).post(`/api/responses/${assignment1Id}/extension-request`, {
            reason: 'Need more time',
            proposedDeadline: futureDate(25),
        });
        expect([200, 201]).toContain(res.status);
        extensionId = res.body.extensionId;
        expect(extensionId).toBeTruthy();
    });

    test('approving extension beyond submissionDeadline → 400', async () => {
        const res = await api(coordinatorToken).patch(`/api/assignments/${assignment1Id}/process-extension`, {
            extensionId,
            decision: 'Approve',
            newDeadline: futureDate(60), // beyond +30 day submissionDeadline
            labId,
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/submission deadline/i);
    });

    test('approving extension within submissionDeadline → 200', async () => {
        const res = await api(coordinatorToken).patch(`/api/assignments/${assignment1Id}/process-extension`, {
            extensionId,
            decision: 'Approve',
            newDeadline: futureDate(28),
            labId,
        });
        expect(res.status).toBe(200);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. OVERDUE DETECTION & ROUND AUTO-COMPLETION
// ─────────────────────────────────────────────────────────────────────────────

describe('13 · Overdue detection & round auto-completion', () => {
    let overdueRoundId: string;
    let overdueAssignmentId: string;

    test('setup: create an Open round with a past-deadline assignment directly', async () => {
        const paperRepo = AppDataSource.getRepository(Paper);
        const paper2 = paperRepo.create({
            title: 'Overdue Test Paper',
            abstractText: 'Used to test overdue logic.',
            creationTime: new Date(),
            status: PaperStatus.HumanReview,
        });
        const lab = await AppDataSource.getRepository(Lab).findOne({ where: { id: labId } });
        const coordinator = await AppDataSource.getRepository('User').findOne({ where: { id: coordinatorId } }) as any;
        paper2.coordinators = [coordinator];
        paper2.labs = [lab!];
        paper2.authors = [];
        await paperRepo.save(paper2);

        const submissionDeadline = new Date(futureDate(30));
        const roundRepo = AppDataSource.getRepository(Round);
        const overdue_round = roundRepo.create({
            paper: paper2,
            roundNumber: 1,
            status: RoundStatus.Open,
            targetVenue: 'Overdue Conf',
            venueCategory: VenueCategory.Conference,
            submissionDeadline,
            deadline: new Date(futureDate(14)),
            startedAt: new Date(),
            completedAt: null,
        });
        await roundRepo.save(overdue_round);
        overdueRoundId = overdue_round.id;

        const reviewer = await AppDataSource.getRepository('User').findOne({ where: { id: reviewer1Id } }) as any;
        const assignRepo = AppDataSource.getRepository(Assignment);
        const a = assignRepo.create({
            round: overdue_round,
            reviewer,
            status: AssignmentStatus.Accepted,
            deadline: new Date(pastDate(1)), // past deadline
            invitationSent: true,
        });
        await assignRepo.save(a);
        overdueAssignmentId = a.id;
    });

    test('before checker: assignment is Accepted', async () => {
        const assignRepo = AppDataSource.getRepository(Assignment);
        const a = await assignRepo.findOne({ where: { id: overdueAssignmentId } });
        expect(a?.status).toBe(AssignmentStatus.Accepted);
    });

    test('run checkAndMarkOverdue: assignment becomes Overdue', async () => {
        await RoundService.checkAndMarkOverdue();

        const assignRepo = AppDataSource.getRepository(Assignment);
        const a = await assignRepo.findOne({ where: { id: overdueAssignmentId } });
        expect(a?.status).toBe(AssignmentStatus.Overdue);
    });

    test('run checker again: round auto-completes (all assignments terminal)', async () => {
        await RoundService.checkAndMarkOverdue();

        const roundRepo = AppDataSource.getRepository(Round);
        const round = await roundRepo.findOne({ where: { id: overdueRoundId } });
        expect(round?.status).toBe(RoundStatus.Completed);
        expect(round?.completedAt).not.toBeNull();
    });

    test('round completedAt is exposed in getRoundsWithAssignments response', async () => {
        const paperRepo = AppDataSource.getRepository(Paper);
        const papers = await paperRepo.find({ where: { title: 'Overdue Test Paper' } });
        const overduePaperId = papers[0].id;

        const res = await api(coordinatorToken).get(`/api/papers/${overduePaperId}/rounds`);
        expect(res.status).toBe(200);
        const round = res.body[0];
        expect(round.status).toBe('Completed');
        expect(round.completedAt).not.toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. CREATE NEXT ROUND
// ─────────────────────────────────────────────────────────────────────────────

describe('14 · Create next round (POST /rounds/next)', () => {
    test('cannot create next round while current round is Open → 409', async () => {
        const res = await api(coordinatorToken).post('/api/rounds/next', {
            paperId,
            coordinatorId,
            targetVenue: 'FSE 2027',
            venueCategory: 'Conference',
            submissionDeadline: futureDate(60),
        });
        expect(res.status).toBe(409);
    });

    test('force-complete the current round via direct DB update, then create next round → 201', async () => {
        // Manually complete the conference round so we can test next-round creation
        const roundRepo = AppDataSource.getRepository(Round);
        await roundRepo.update(conferenceRoundId, {
            status: RoundStatus.Completed,
            completedAt: new Date(),
        });

        const res = await api(coordinatorToken).post('/api/rounds/next', {
            paperId,
            coordinatorId,
            targetVenue: 'FSE 2027',
            venueCategory: 'Conference',
            submissionDeadline: futureDate(60),
        });
        expect(res.status).toBe(201);
        expect(res.body.status).toBe('Draft');
        expect(res.body.roundNumber).toBe(2);
        expect(res.body.targetVenue).toBe('FSE 2027');
        expect(res.body.deadline).toBeNull();
    });

    test('cannot create a third round while second is Draft → 409', async () => {
        const res = await api(coordinatorToken).post('/api/rounds/next', {
            paperId,
            coordinatorId,
            targetVenue: 'PLDI 2027',
            venueCategory: 'Conference',
            submissionDeadline: futureDate(90),
        });
        expect(res.status).toBe(409);
    });
});
