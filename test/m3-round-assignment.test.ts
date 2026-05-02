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

// ── Shared state ──────────────────────────────────────────────────────────────

let coordinatorToken: string;
let authorToken: string;
let reviewer1Token: string;
let reviewer2Token: string;

let coordinatorId: string;
let authorId: string;
let reviewer1Id: string;
let reviewer2Id: string;
let paperId: string;
let roundId: string;

// ── Seed ─────────────────────────────────────────────────────────────────────

async function seedTestDb() {
    const userRepo  = AppDataSource.getRepository('User');
    const labRepo   = AppDataSource.getRepository(Lab);
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

    const coordinator = mkUser(Coordinator, 'Coord RA',      'coord_ra@test.com');
    const author      = mkUser(LabMember,   'Author RA',     'author_ra@test.com');
    const reviewer1   = mkUser(LabMember,   'Reviewer1 RA',  'r1_ra@test.com');
    const reviewer2   = mkUser(LabMember,   'Reviewer2 RA',  'r2_ra@test.com');

    for (const u of [coordinator, author, reviewer1, reviewer2]) {
        await userRepo.save(u);
    }
    coordinatorId = coordinator.id;
    authorId      = author.id;
    reviewer1Id   = reviewer1.id;
    reviewer2Id   = reviewer2.id;

    const lab = labRepo.create({ name: 'RA Lab', description: '' });
    lab.coordinator = coordinator;
    lab.members = [coordinator, author, reviewer1, reviewer2];
    await labRepo.save(lab);

    const paper = paperRepo.create({
        title: 'Round & Assignment Test Paper',
        abstractText: 'Testing the propose/approve/track flow.',
        overleafLink: 'https://overleaf.com/ra_test',
        creationTime: new Date(),
        status: PaperStatus.Draft,
    });
    paper.coordinators = [coordinator];
    paper.labs = [lab];
    paper.authors = [author];
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const api = (token?: string) => {
    const r = request(app);
    return {
        get:    (path: string)               => r.get(path).set('Authorization', token ? `Bearer ${token}` : ''),
        post:   (path: string, body: object) => r.post(path).set('Authorization', token ? `Bearer ${token}` : '').send(body),
        put:    (path: string, body: object) => r.put(path).set('Authorization', token ? `Bearer ${token}` : '').send(body),
        patch:  (path: string, body: object) => r.patch(path).set('Authorization', token ? `Bearer ${token}` : '').send(body),
        delete: (path: string)               => r.delete(path).set('Authorization', token ? `Bearer ${token}` : ''),
    };
};

const futureDate = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString();
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. AUTHENTICATION
// ─────────────────────────────────────────────────────────────────────────────

describe('1 · Authentication', () => {
    test('coordinator login', async () => {
        const res = await request(app).post('/api/account/login').send({ email: 'coord_ra@test.com', password: '123' });
        expect(res.status).toBe(200);
        coordinatorToken = res.body.token;
    });

    test('author login', async () => {
        const res = await request(app).post('/api/account/login').send({ email: 'author_ra@test.com', password: '123' });
        expect(res.status).toBe(200);
        authorToken = res.body.token;
    });

    test('reviewer1 login', async () => {
        const res = await request(app).post('/api/account/login').send({ email: 'r1_ra@test.com', password: '123' });
        expect(res.status).toBe(200);
        reviewer1Token = res.body.token;
    });

    test('reviewer2 login', async () => {
        const res = await request(app).post('/api/account/login').send({ email: 'r2_ra@test.com', password: '123' });
        expect(res.status).toBe(200);
        reviewer2Token = res.body.token;
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. AUTHOR ROUND CREATION
// ─────────────────────────────────────────────────────────────────────────────

describe('2 · Author round creation', () => {
    test('pure reviewer (not author) cannot create round → 403', async () => {
        const res = await api(reviewer1Token).post('/api/rounds', {
            paperId,
            targetVenue: 'ICSE 2026',
            targetVenueUrl: 'https://conf.researchr.org/home/icse-2026',
            venueCategory: 'Conference',
            submissionDeadline: futureDate(30),
        });
        expect(res.status).toBe(403);
    });

    test('author creates a Draft Conference round → 201', async () => {
        const res = await api(authorToken).post('/api/rounds', {
            paperId,
            targetVenue: 'ICSE 2026',
            targetVenueUrl: 'https://conf.researchr.org/home/icse-2026',
            venueCategory: 'Conference',
            submissionDeadline: futureDate(30),
            deadline: futureDate(14),
        });
        expect(res.status).toBe(201);
        expect(res.body.status).toBe('Draft');
        expect(res.body.targetVenue).toBe('ICSE 2026');
        expect(res.body.venueCategory).toBe('Conference');
        roundId = res.body.id;
    });

    test('creating a second round while one is Draft → 409', async () => {
        const res = await api(coordinatorToken).post('/api/rounds', {
            paperId,
            targetVenue: 'FSE 2026',
            targetVenueUrl: 'https://conf.researchr.org/home/fse-2026',
            venueCategory: 'Conference',
            submissionDeadline: futureDate(30),
        });
        expect(res.status).toBe(409);
    });

    test('author sees their round via author-rounds endpoint → 200', async () => {
        const res = await api(authorToken).get(`/api/papers/${paperId}/author-rounds`);
        expect(res.status).toBe(200);
        expect(res.body.some((r: any) => r.id === roundId)).toBe(true);
    });

    test('coordinator also sees the round via author-rounds endpoint → 200', async () => {
        const res = await api(coordinatorToken).get(`/api/papers/${paperId}/author-rounds`);
        expect(res.status).toBe(200);
        expect(res.body.some((r: any) => r.id === roundId)).toBe(true);
    });

    test('unrelated reviewer cannot access author-rounds → 403', async () => {
        const res = await api(reviewer1Token).get(`/api/papers/${paperId}/author-rounds`);
        expect(res.status).toBe(403);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. PROPOSE REVIEWER FLOW
// ─────────────────────────────────────────────────────────────────────────────

describe('3 · Propose reviewer flow', () => {
    test('unauthenticated request to get proposed → 401', async () => {
        const res = await api().get(`/api/rounds/${roundId}/propose`);
        expect(res.status).toBe(401);
    });

    test('proposed list is initially empty', async () => {
        const res = await api(coordinatorToken).get(`/api/rounds/${roundId}/propose`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(0);
    });

    test('author can add reviewer1 to proposed list', async () => {
        const res = await api(authorToken).post(`/api/rounds/${roundId}/propose`, { reviewerId: reviewer1Id });
        expect(res.status).toBe(200);
        expect(res.body.some((r: any) => r.id === reviewer1Id)).toBe(true);
    });

    test('adding reviewer1 again is idempotent — no duplicate', async () => {
        const res = await api(authorToken).post(`/api/rounds/${roundId}/propose`, { reviewerId: reviewer1Id });
        expect(res.status).toBe(200);
        expect(res.body.filter((r: any) => r.id === reviewer1Id)).toHaveLength(1);
    });

    test('coordinator can add reviewer2 to proposed list', async () => {
        const res = await api(coordinatorToken).post(`/api/rounds/${roundId}/propose`, { reviewerId: reviewer2Id });
        expect(res.status).toBe(200);
        expect(res.body.some((r: any) => r.id === reviewer2Id)).toBe(true);
    });

    test('paper author cannot be proposed — COI → 400', async () => {
        const res = await api(coordinatorToken).post(`/api/rounds/${roundId}/propose`, { reviewerId: authorId });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/author/i);
    });

    test('proposed list now contains both reviewers', async () => {
        const res = await api(coordinatorToken).get(`/api/rounds/${roundId}/propose`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        const ids = res.body.map((r: any) => r.id);
        expect(ids).toContain(reviewer1Id);
        expect(ids).toContain(reviewer2Id);
    });

    test('coordinator removes reviewer2 from proposed list', async () => {
        const res = await api(coordinatorToken).delete(`/api/rounds/${roundId}/propose/${reviewer2Id}`);
        expect(res.status).toBe(200);
        expect(res.body.some((r: any) => r.id === reviewer2Id)).toBe(false);
    });

    test('proposed list now has only reviewer1', async () => {
        const res = await api(coordinatorToken).get(`/api/rounds/${roundId}/propose`);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].id).toBe(reviewer1Id);
    });

    test('re-add reviewer2 before approve', async () => {
        const res = await api(coordinatorToken).post(`/api/rounds/${roundId}/propose`, { reviewerId: reviewer2Id });
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. APPROVE ROUND — ERROR CASES
// ─────────────────────────────────────────────────────────────────────────────

describe('4 · Approve round — error cases', () => {
    test('reviewer cannot approve round → 403', async () => {
        const res = await api(reviewer1Token).post(`/api/rounds/${roundId}/approve`, {});
        expect(res.status).toBe(403);
    });

    test('approving a non-existent round → 404', async () => {
        const res = await api(coordinatorToken).post('/api/rounds/00000000-0000-0000-0000-000000000000/approve', {});
        expect(res.status).toBe(404);
    });

    test('approving a round whose paper has no overleaf link → 400', async () => {
        const paperRepo = AppDataSource.getRepository(Paper);
        const roundRepo = AppDataSource.getRepository(Round);

        const noLinkPaper = paperRepo.create({
            title: 'No Overleaf Paper',
            abstractText: 'No link.',
            overleafLink: '   ' as any,
            creationTime: new Date(),
            status: PaperStatus.Draft,
        });
        noLinkPaper.coordinators = [{ id: coordinatorId } as any];
        noLinkPaper.labs = [];
        noLinkPaper.authors = [];
        await paperRepo.save(noLinkPaper);

        const tempRound = roundRepo.create({
            paper: noLinkPaper,
            roundNumber: 1,
            status: RoundStatus.Draft,
            targetVenue: 'Test Venue',
            venueCategory: VenueCategory.Conference,
            submissionDeadline: new Date(futureDate(30)),
            deadline: new Date(futureDate(14)),
            startedAt: null,
            completedAt: null,
        });
        tempRound.proposedReviewers = [{ id: reviewer1Id } as any];
        await roundRepo.save(tempRound);

        const res = await api(coordinatorToken).post(`/api/rounds/${tempRound.id}/approve`, {});
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/overleaf/i);

        await roundRepo.delete(tempRound.id);
        await paperRepo.delete(noLinkPaper.id);
    });

    test('approving a round with empty proposed list → 400', async () => {
        const roundRepo = AppDataSource.getRepository(Round);
        const paperRepo = AppDataSource.getRepository(Paper);

        const emptyPaper = paperRepo.create({
            title: 'Empty Proposed Paper',
            abstractText: 'No proposed reviewers.',
            overleafLink: 'https://overleaf.com/empty',
            creationTime: new Date(),
            status: PaperStatus.Draft,
        });
        emptyPaper.coordinators = [{ id: coordinatorId } as any];
        emptyPaper.labs = [];
        emptyPaper.authors = [];
        await paperRepo.save(emptyPaper);

        const emptyRound = roundRepo.create({
            paper: emptyPaper,
            roundNumber: 1,
            status: RoundStatus.Draft,
            targetVenue: 'Test Venue',
            targetVenueUrl: 'https://example.com/test-venue',
            venueCategory: VenueCategory.Journal,
            submissionDeadline: null,
            deadline: new Date(futureDate(14)),
            startedAt: null,
            completedAt: null,
        });
        emptyRound.proposedReviewers = [];
        await roundRepo.save(emptyRound);

        const res = await api(coordinatorToken).post(`/api/rounds/${emptyRound.id}/approve`, {});
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/proposed/i);

        await roundRepo.delete(emptyRound.id);
        await paperRepo.delete(emptyPaper.id);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. APPROVE ROUND — HAPPY PATH
// ─────────────────────────────────────────────────────────────────────────────

describe('5 · Approve round — happy path', () => {
    test('coordinator approves round → 200, status Open, assignments created', async () => {
        const res = await api(coordinatorToken).post(`/api/rounds/${roundId}/approve`, {});
        expect(res.status).toBe(200);
        expect(res.body.round.status).toBe('Open');
        expect(res.body.round.startedAt).not.toBeNull();
        expect(res.body.assigned).toBe(2);
        expect(res.body.skipped).toBe(0);
    });

    test('paper transitions to InReview after approve', async () => {
        const paper = await AppDataSource.getRepository(Paper).findOne({ where: { id: paperId } });
        expect(paper?.status).toBe(PaperStatus.InReview);
    });

    test('round now has assignments for both proposed reviewers', async () => {
        const res = await api(coordinatorToken).get(`/api/papers/${paperId}/rounds`);
        expect(res.status).toBe(200);
        const round = res.body.find((r: any) => r.id === roundId);
        expect(round.status).toBe('Open');
        const assignedReviewerIds = round.assignments.map((a: any) => a.reviewer.id);
        expect(assignedReviewerIds).toContain(reviewer1Id);
        expect(assignedReviewerIds).toContain(reviewer2Id);
    });

    test('all created assignments have invitationSent=true', async () => {
        const res = await api(coordinatorToken).get(`/api/papers/${paperId}/rounds`);
        const round = res.body.find((r: any) => r.id === roundId);
        expect(round.assignments.every((a: any) => a.invitationSent === true)).toBe(true);
    });

    test('approving an already-Open round → 400', async () => {
        const res = await api(coordinatorToken).post(`/api/rounds/${roundId}/approve`, {});
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/Draft/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. TRACK REVIEW STATUS
// ─────────────────────────────────────────────────────────────────────────────

describe('6 · Track review status', () => {
    test('unauthenticated request → 401', async () => {
        const res = await api().get(`/api/rounds/${roundId}/status`);
        expect(res.status).toBe(401);
    });

    test('reviewer not associated with paper as author/coordinator → 403', async () => {
        // reviewer1 has an assignment but is not a paper author or coordinator
        const res = await api(reviewer1Token).get(`/api/rounds/${roundId}/status`);
        expect(res.status).toBe(403);
    });

    test('coordinator gets full status summary → 200', async () => {
        const res = await api(coordinatorToken).get(`/api/rounds/${roundId}/status`);
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(roundId);
        expect(res.body.status).toBe('Open');
        expect(res.body.summary.total).toBe(2);
        expect(res.body.summary.completionRate).toBe(0);
        expect(res.body.summary.statusCounts).toBeDefined();
        expect(res.body.overdueAssignments).toHaveLength(0);
        expect(res.body.approachingDeadline).toBeDefined();
    });

    test('author can also access status summary → 200', async () => {
        const res = await api(authorToken).get(`/api/rounds/${roundId}/status`);
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(roundId);
    });

    test('statusCounts reflects all Invited assignments initially', async () => {
        const res = await api(coordinatorToken).get(`/api/rounds/${roundId}/status`);
        expect(res.body.summary.statusCounts['Invited']).toBe(2);
        expect(res.body.summary.statusCounts['Completed']).toBe(0);
    });

    test('overdue count increases when assignment deadline is set to past', async () => {
        const assignRepo = AppDataSource.getRepository(Assignment);
        const target = await assignRepo.findOne({ where: { round: { id: roundId }, reviewer: { id: reviewer1Id } } });

        const pastDeadline = new Date();
        pastDeadline.setDate(pastDeadline.getDate() - 1);
        await assignRepo.update(target!.id, { deadline: pastDeadline });

        const res = await api(coordinatorToken).get(`/api/rounds/${roundId}/status`);
        expect(res.body.summary.overdueCount).toBe(1);
        expect(res.body.overdueAssignments[0].id).toBe(target!.id);
        expect(res.body.overdueAssignments[0].reviewer.id).toBe(reviewer1Id);

        // restore deadline
        const round = await AppDataSource.getRepository(Round).findOne({ where: { id: roundId } });
        await assignRepo.update(target!.id, { deadline: round!.deadline! });
    });

    test('approaching deadline count increases when deadline is within 3 days', async () => {
        const assignRepo = AppDataSource.getRepository(Assignment);
        const target = await assignRepo.findOne({ where: { round: { id: roundId }, reviewer: { id: reviewer2Id } } });

        const nearDeadline = new Date();
        nearDeadline.setDate(nearDeadline.getDate() + 2);
        await assignRepo.update(target!.id, { deadline: nearDeadline });

        const res = await api(coordinatorToken).get(`/api/rounds/${roundId}/status`);
        expect(res.body.summary.approachingDeadlineCount).toBeGreaterThanOrEqual(1);
        const found = res.body.approachingDeadline.some((a: any) => a.id === target!.id);
        expect(found).toBe(true);

        // restore deadline
        const round = await AppDataSource.getRepository(Round).findOne({ where: { id: roundId } });
        await assignRepo.update(target!.id, { deadline: round!.deadline! });
    });

    test('completion rate updates after a reviewer completes their review', async () => {
        const assignRepo = AppDataSource.getRepository(Assignment);
        const a1 = await assignRepo.findOne({ where: { round: { id: roundId }, reviewer: { id: reviewer1Id } } });

        await api(reviewer1Token).patch(`/api/responses/${a1!.id}/accept`, {});
        await api(reviewer1Token).post('/api/responses/complete', {
            assignmentId: a1!.id,
            summary: 'Well structured paper, minor revisions needed.',
        });

        const res = await api(coordinatorToken).get(`/api/rounds/${roundId}/status`);
        expect(res.body.summary.completed).toBe(1);
        expect(res.body.summary.completionRate).toBe(50);
        expect(res.body.summary.statusCounts['Completed']).toBe(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. SEND REMINDERS
// ─────────────────────────────────────────────────────────────────────────────

describe('7 · Send reminders', () => {
    let activeAssignmentId: string;
    let completedAssignmentId: string;

    beforeAll(async () => {
        const assignRepo = AppDataSource.getRepository(Assignment);
        const active    = await assignRepo.findOne({ where: { round: { id: roundId }, reviewer: { id: reviewer2Id } } });
        const completed = await assignRepo.findOne({ where: { round: { id: roundId }, reviewer: { id: reviewer1Id } } });
        activeAssignmentId    = active!.id;
        completedAssignmentId = completed!.id;
    });

    test('unauthenticated request → 401', async () => {
        const res = await api().post('/api/assignments/remind', { assignmentIds: [activeAssignmentId] });
        expect(res.status).toBe(401);
    });

    test('reviewer cannot send reminders → 403', async () => {
        const res = await api(reviewer2Token).post('/api/assignments/remind', { assignmentIds: [activeAssignmentId] });
        expect(res.status).toBe(403);
    });

    test('empty assignmentIds → 400', async () => {
        const res = await api(coordinatorToken).post('/api/assignments/remind', { assignmentIds: [] });
        expect(res.status).toBe(400);
    });

    test('missing assignmentIds → 400', async () => {
        const res = await api(coordinatorToken).post('/api/assignments/remind', {});
        expect(res.status).toBe(400);
    });

    test('coordinator sends reminder to active (Invited) assignment → sent=1, skipped=0', async () => {
        const res = await api(coordinatorToken).post('/api/assignments/remind', { assignmentIds: [activeAssignmentId] });
        expect(res.status).toBe(200);
        expect(res.body.sent).toBe(1);
        expect(res.body.skipped).toBe(0);
    });

    test('sending reminder to Completed assignment → skipped=1', async () => {
        const res = await api(coordinatorToken).post('/api/assignments/remind', { assignmentIds: [completedAssignmentId] });
        expect(res.status).toBe(200);
        expect(res.body.sent).toBe(0);
        expect(res.body.skipped).toBe(1);
    });

    test('mixed batch: one active, one completed → sent=1, skipped=1', async () => {
        const res = await api(coordinatorToken).post('/api/assignments/remind', {
            assignmentIds: [activeAssignmentId, completedAssignmentId],
        });
        expect(res.status).toBe(200);
        expect(res.body.sent).toBe(1);
        expect(res.body.skipped).toBe(1);
    });
});
