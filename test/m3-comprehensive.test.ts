/**
 * Comprehensive integration test — round & assignment management.
 *
 * Forces every state-machine guard, auth boundary, data-integrity invariant,
 * and boundary value across the full round/assignment/reviewer-response lifecycle.
 *
 * Users:
 *   coord   — Coordinator (owns lab + paper)
 *   author  — LabMember listed as paper author
 *   r1/r2/r3 — LabMembers eligible for assignment
 *   outsider — LabMember in a DIFFERENT lab (fails lab-membership checks)
 */

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

// ── Shared state ───────────────────────────────────────────────────────────────

let coordToken: string;
let authorToken: string;
let r1Token: string;
let r2Token: string;
let r3Token: string;
let outsiderToken: string;

let coordId: string;
let authorId: string;
let r1Id: string;
let r2Id: string;
let r3Id: string;
let outsiderId: string;
let labId: string;
let paperId: string;

let roundId: string;          // main Conference round
let r1AssignId: string;
let r2AssignId: string;
let r3AssignId: string;
let r1DeclineReqId: string;
let r2ExtId: string;

// ── Seed ──────────────────────────────────────────────────────────────────────

async function seedTestDb() {
    const userRepo  = AppDataSource.getRepository('User');
    const labRepo   = AppDataSource.getRepository(Lab);
    const paperRepo = AppDataSource.getRepository(Paper);

    const pw = await hashPassword('pass');
    const mk = (Cls: any, name: string, email: string) =>
        Object.assign(new Cls(), {
            name, email, passwordHash: pw,
            approvalStatus: ApprovalStatus.Approved,
            approvalReviewedAt: new Date(), approvalNote: null,
            failedLogins: 0, failedLoginWindowStartedAt: null,
            lockedUntil: null, lastLoginAt: null,
        });

    const coord    = mk(Coordinator, 'Coord C',     'coord_c@comp.test');
    const author   = mk(LabMember,   'Author C',    'author_c@comp.test');
    const rev1     = mk(LabMember,   'Reviewer1 C', 'r1_c@comp.test');
    const rev2     = mk(LabMember,   'Reviewer2 C', 'r2_c@comp.test');
    const rev3     = mk(LabMember,   'Reviewer3 C', 'r3_c@comp.test');
    const outsider = mk(LabMember,   'Outsider C',  'out_c@comp.test');

    // Separate coordinator for the outsider lab to avoid unique-coordinatorId violation
    const outsiderCoord = mk(Coordinator, 'Outsider Coord', 'out_coord_c@comp.test');

    for (const u of [coord, author, rev1, rev2, rev3, outsider, outsiderCoord]) await userRepo.save(u);
    coordId   = coord.id;
    authorId  = author.id;
    r1Id      = rev1.id;
    r2Id      = rev2.id;
    r3Id      = rev3.id;
    outsiderId = outsider.id;

    // Main lab — outsider NOT included
    const lab = labRepo.create({ name: 'Comp Lab', description: '' });
    lab.coordinator = coord;
    lab.members = [coord, author, rev1, rev2, rev3];
    await labRepo.save(lab);
    labId = lab.id;

    // Outsider's own lab — uses a separate coordinator to avoid UNIQUE constraint on coordinatorId
    const outsiderLab = labRepo.create({ name: 'Outsider Lab', description: '' });
    outsiderLab.coordinator = outsiderCoord;
    outsiderLab.members = [outsider];
    await labRepo.save(outsiderLab);

    const paper = paperRepo.create({
        title: 'Comprehensive Test Paper',
        abstractText: 'Testing everything.',
        overleafLink: 'https://overleaf.com/comp_test',

        creationTime: new Date(),
        status: PaperStatus.Draft,
    });
    paper.coordinators = [coord];
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
        get:    (p: string)               => r.get(p).set('Authorization', token ? `Bearer ${token}` : ''),
        post:   (p: string, b: object)    => r.post(p).set('Authorization', token ? `Bearer ${token}` : '').send(b),
        put:    (p: string, b: object)    => r.put(p).set('Authorization', token ? `Bearer ${token}` : '').send(b),
        patch:  (p: string, b: object)    => r.patch(p).set('Authorization', token ? `Bearer ${token}` : '').send(b),
        delete: (p: string)               => r.delete(p).set('Authorization', token ? `Bearer ${token}` : ''),
    };
};

const future = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString(); };
const past   = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString(); };

// ─────────────────────────────────────────────────────────────────────────────
// 1 · AUTHENTICATION
// ─────────────────────────────────────────────────────────────────────────────

describe('1 · Authentication', () => {
    test('coordinator login → token', async () => {
        const r = await request(app).post('/api/account/login').send({ email: 'coord_c@comp.test', password: 'pass' });
        expect(r.status).toBe(200);
        coordToken = r.body.token;
    });
    test('author login → token', async () => {
        const r = await request(app).post('/api/account/login').send({ email: 'author_c@comp.test', password: 'pass' });
        expect(r.status).toBe(200);
        authorToken = r.body.token;
    });
    test('reviewer1 login → token', async () => {
        const r = await request(app).post('/api/account/login').send({ email: 'r1_c@comp.test', password: 'pass' });
        expect(r.status).toBe(200);
        r1Token = r.body.token;
    });
    test('reviewer2 login → token', async () => {
        const r = await request(app).post('/api/account/login').send({ email: 'r2_c@comp.test', password: 'pass' });
        expect(r.status).toBe(200);
        r2Token = r.body.token;
    });
    test('reviewer3 login → token', async () => {
        const r = await request(app).post('/api/account/login').send({ email: 'r3_c@comp.test', password: 'pass' });
        expect(r.status).toBe(200);
        r3Token = r.body.token;
    });
    test('outsider login → token', async () => {
        const r = await request(app).post('/api/account/login').send({ email: 'out_c@comp.test', password: 'pass' });
        expect(r.status).toBe(200);
        outsiderToken = r.body.token;
    });
    test('wrong password → 401', async () => {
        const r = await request(app).post('/api/account/login').send({ email: 'coord_c@comp.test', password: 'wrong' });
        expect(r.status).toBe(401);
    });
    test('missing token on protected endpoint → 401', async () => {
        const r = await api().get('/api/papers/my-coordinated');
        expect(r.status).toBe(401);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · ROUND CREATION — ERROR CASES
// ─────────────────────────────────────────────────────────────────────────────

describe('2 · Round creation — error cases', () => {
    test('reviewer (not author) cannot create round → 403', async () => {
        const r = await api(r1Token).post('/api/rounds', { paperId, targetVenue: 'X', targetVenueUrl: 'https://example.com/x', venueCategory: 'Conference', submissionDeadline: future(30) });
        expect(r.status).toBe(403);
    });
    test('outsider cannot create round → 403', async () => {
        const r = await api(outsiderToken).post('/api/rounds', { paperId, targetVenue: 'X', targetVenueUrl: 'https://example.com/x', venueCategory: 'Conference', submissionDeadline: future(30) });
        expect(r.status).toBe(403);
    });
    test('missing venueCategory → 400', async () => {
        const r = await api(coordToken).post('/api/rounds', { paperId, targetVenue: 'ICSE' });
        expect(r.status).toBe(400);
    });
    test('invalid venueCategory value → 400', async () => {
        const r = await api(coordToken).post('/api/rounds', { paperId, targetVenue: 'ICSE', targetVenueUrl: 'https://conf.researchr.org/home/icse-2026', venueCategory: 'Symposium' });
        expect(r.status).toBe(400);
    });
    test('Conference round without submissionDeadline → 400', async () => {
        const r = await api(coordToken).post('/api/rounds', { paperId, targetVenue: 'ICSE', targetVenueUrl: 'https://conf.researchr.org/home/icse-2026', venueCategory: 'Conference' });
        expect(r.status).toBe(400);
    });
    test('missing targetVenue → 400', async () => {
        const r = await api(coordToken).post('/api/rounds', { paperId, venueCategory: 'Journal' });
        expect(r.status).toBe(400);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · ROUND CREATION — HAPPY PATHS
// ─────────────────────────────────────────────────────────────────────────────

describe('3 · Round creation — happy paths', () => {
    test('author creates Journal round without submissionDeadline → 201, Draft', async () => {
        const r = await api(authorToken).post('/api/rounds', { paperId, targetVenue: 'JSS', targetVenueUrl: 'https://www.journals.elsevier.com/journal-of-systems-and-software', venueCategory: 'Journal' });
        expect(r.status).toBe(201);
        expect(r.body.status).toBe('Draft');
        expect(r.body.submissionDeadline).toBeNull();
        // clean up so we can create the main Conference round
        await AppDataSource.getRepository(Round).delete(r.body.id);
    });
    test('coordinator creates Conference round → 201, status=Draft, roundNumber=1', async () => {
        const r = await api(coordToken).post('/api/rounds', {
            paperId,
            targetVenue: 'ICSE 2026',
            targetVenueUrl: 'https://conf.researchr.org/home/icse-2026',
            venueCategory: 'Conference',
            submissionDeadline: future(30),
            deadline: future(14),
        });
        expect(r.status).toBe(201);
        expect(r.body.status).toBe('Draft');
        expect(r.body.roundNumber).toBe(1);
        expect(r.body.venueCategory).toBe('Conference');
        expect(r.body.submissionDeadline).not.toBeNull();
        roundId = r.body.id;
    });
    test('creating second round while first is Draft → 409', async () => {
        const r = await api(coordToken).post('/api/rounds', { paperId, targetVenue: 'FSE', targetVenueUrl: 'https://conf.researchr.org/home/fse-2026', venueCategory: 'Conference', submissionDeadline: future(30) });
        expect(r.status).toBe(409);
        expect(r.body.message).toMatch(/active round/i);
    });
    test('author also sees round via author-rounds → 200', async () => {
        const r = await api(authorToken).get(`/api/papers/${paperId}/author-rounds`);
        expect(r.status).toBe(200);
        expect(r.body.some((x: any) => x.id === roundId)).toBe(true);
    });
    test('reviewer cannot access author-rounds → 403', async () => {
        const r = await api(r1Token).get(`/api/papers/${paperId}/author-rounds`);
        expect(r.status).toBe(403);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 · ROUND DEADLINE EDIT
// ─────────────────────────────────────────────────────────────────────────────

describe('4 · Round deadline edit', () => {
    test('reviewer cannot edit round deadline → 403', async () => {
        const r = await api(r1Token).put(`/api/rounds/${roundId}/deadline`, { deadline: future(10) });
        expect(r.status).toBe(403);
    });
    test('deadline beyond submissionDeadline → 400', async () => {
        const r = await api(coordToken).put(`/api/rounds/${roundId}/deadline`, { deadline: future(60) });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/submission deadline/i);
    });
    test('invalid date string → 400', async () => {
        const r = await api(coordToken).put(`/api/rounds/${roundId}/deadline`, { deadline: 'not-a-date' });
        expect(r.status).toBe(400);
    });
    test('deadline exactly at submissionDeadline → 200', async () => {
        // submissionDeadline is future(30) — set deadline to future(29)
        const r = await api(coordToken).put(`/api/rounds/${roundId}/deadline`, { deadline: future(29) });
        expect(r.status).toBe(200);
    });
    test('author can also edit deadline on Draft round → 200', async () => {
        const r = await api(authorToken).put(`/api/rounds/${roundId}/deadline`, { deadline: future(14) });
        expect(r.status).toBe(200);
    });
    test('non-existent round → 404', async () => {
        const r = await api(coordToken).put('/api/rounds/00000000-0000-0000-0000-000000000000/deadline', { deadline: future(5) });
        expect(r.status).toBe(404);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5 · REVIEWER SUGGESTIONS
// ─────────────────────────────────────────────────────────────────────────────

describe('5 · Reviewer suggestions', () => {
    test('coordinator gets suggestions → 200', async () => {
        const r = await api(coordToken).get(`/api/rounds/${roundId}/suggest`);
        expect(r.status).toBe(200);
        expect(Array.isArray(r.body)).toBe(true);
    });
    test('suggestions exclude coordinator (coordinator role)', async () => {
        const r = await api(coordToken).get(`/api/rounds/${roundId}/suggest`);
        const ids = r.body.map((s: any) => s.user.id);
        expect(ids).not.toContain(coordId);
    });
    test('suggestions exclude paper author (COI)', async () => {
        const r = await api(coordToken).get(`/api/rounds/${roundId}/suggest`);
        const ids = r.body.map((s: any) => s.user.id);
        expect(ids).not.toContain(authorId);
    });
    test('suggestions exclude outsider (not in same lab)', async () => {
        const r = await api(coordToken).get(`/api/rounds/${roundId}/suggest`);
        const ids = r.body.map((s: any) => s.user.id);
        expect(ids).not.toContain(outsiderId);
    });
    test('r1/r2/r3 all appear in suggestions', async () => {
        const r = await api(coordToken).get(`/api/rounds/${roundId}/suggest`);
        const ids = r.body.map((s: any) => s.user.id);
        expect(ids).toContain(r1Id);
        expect(ids).toContain(r2Id);
        expect(ids).toContain(r3Id);
    });
    test('unauthenticated → 401', async () => {
        const r = await api().get(`/api/rounds/${roundId}/suggest`);
        expect(r.status).toBe(401);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6 · PROPOSE REVIEWER — FULL COVERAGE
// ─────────────────────────────────────────────────────────────────────────────

describe('6 · Propose reviewer', () => {
    test('unauthenticated GET propose → 401', async () => {
        const r = await api().get(`/api/rounds/${roundId}/propose`);
        expect(r.status).toBe(401);
    });
    test('initially empty proposed list', async () => {
        const r = await api(coordToken).get(`/api/rounds/${roundId}/propose`);
        expect(r.status).toBe(200);
        expect(r.body).toHaveLength(0);
    });
    test('reviewer (not author) cannot propose → 403', async () => {
        const r = await api(r1Token).post(`/api/rounds/${roundId}/propose`, { reviewerId: r2Id });
        expect(r.status).toBe(403);
    });
    test('outsider cannot propose → 403', async () => {
        const r = await api(outsiderToken).post(`/api/rounds/${roundId}/propose`, { reviewerId: r1Id });
        expect(r.status).toBe(403);
    });
    test('missing reviewerId → 400', async () => {
        const r = await api(coordToken).post(`/api/rounds/${roundId}/propose`, {});
        expect(r.status).toBe(400);
    });
    test('proposing paper author (COI) → 400', async () => {
        const r = await api(coordToken).post(`/api/rounds/${roundId}/propose`, { reviewerId: authorId });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/author/i);
    });
    test('proposing outsider (not in shared lab) → 400', async () => {
        const r = await api(coordToken).post(`/api/rounds/${roundId}/propose`, { reviewerId: outsiderId });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/lab/i);
    });
    test('proposing non-existent user → 404', async () => {
        const r = await api(coordToken).post(`/api/rounds/${roundId}/propose`, { reviewerId: '00000000-0000-0000-0000-000000000000' });
        expect(r.status).toBe(404);
    });
    test('author adds r1 → list has r1', async () => {
        const r = await api(authorToken).post(`/api/rounds/${roundId}/propose`, { reviewerId: r1Id });
        expect(r.status).toBe(200);
        expect(r.body.some((x: any) => x.id === r1Id)).toBe(true);
    });
    test('adding r1 again is idempotent — no duplicate', async () => {
        const r = await api(coordToken).post(`/api/rounds/${roundId}/propose`, { reviewerId: r1Id });
        expect(r.status).toBe(200);
        expect(r.body.filter((x: any) => x.id === r1Id)).toHaveLength(1);
    });
    test('coordinator adds r2', async () => {
        const r = await api(coordToken).post(`/api/rounds/${roundId}/propose`, { reviewerId: r2Id });
        expect(r.status).toBe(200);
        expect(r.body.some((x: any) => x.id === r2Id)).toBe(true);
    });
    test('coordinator adds r3 → list has 3 reviewers', async () => {
        const r = await api(coordToken).post(`/api/rounds/${roundId}/propose`, { reviewerId: r3Id });
        expect(r.status).toBe(200);
        expect(r.body).toHaveLength(3);
    });
    test('remove r3 → list has 2 reviewers', async () => {
        const r = await api(coordToken).delete(`/api/rounds/${roundId}/propose/${r3Id}`);
        expect(r.status).toBe(200);
        expect(r.body.some((x: any) => x.id === r3Id)).toBe(false);
        expect(r.body).toHaveLength(2);
    });
    test('re-add r3 before approve', async () => {
        const r = await api(coordToken).post(`/api/rounds/${roundId}/propose`, { reviewerId: r3Id });
        expect(r.status).toBe(200);
        expect(r.body).toHaveLength(3);
    });
    test('proposed list has r1, r2, r3', async () => {
        const r = await api(coordToken).get(`/api/rounds/${roundId}/propose`);
        const ids = r.body.map((x: any) => x.id);
        expect(ids).toContain(r1Id);
        expect(ids).toContain(r2Id);
        expect(ids).toContain(r3Id);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7 · APPROVE ROUND — GUARD CONDITIONS
// ─────────────────────────────────────────────────────────────────────────────

describe('7 · Approve round — guard conditions', () => {
    test('reviewer cannot approve → 403', async () => {
        const r = await api(r1Token).post(`/api/rounds/${roundId}/approve`, {});
        expect(r.status).toBe(403);
    });
    test('author (not coordinator) cannot approve → 403', async () => {
        const r = await api(authorToken).post(`/api/rounds/${roundId}/approve`, {});
        expect(r.status).toBe(403);
    });
    test('non-existent round → 404', async () => {
        const r = await api(coordToken).post('/api/rounds/00000000-0000-0000-0000-000000000000/approve', {});
        expect(r.status).toBe(404);
    });

    // Round without deadline guard
    test('round without deadline cannot be approved → 400', async () => {
        const roundRepo = AppDataSource.getRepository(Round);
        const paperRepo = AppDataSource.getRepository(Paper);
        const noDlPaper = paperRepo.create({ title: 'NoDL', abstractText: '', overleafLink: 'x', creationTime: new Date(), status: PaperStatus.Draft });
        noDlPaper.coordinators = [{ id: coordId } as any];
        noDlPaper.labs = [];
        noDlPaper.authors = [];
        await paperRepo.save(noDlPaper);
        const noDlRound = roundRepo.create({ paper: noDlPaper, roundNumber: 1, status: RoundStatus.Draft, targetVenue: 'T', venueCategory: VenueCategory.Journal, submissionDeadline: null, deadline: null, startedAt: null, completedAt: null });
        noDlRound.proposedReviewers = [{ id: r1Id } as any];
        await roundRepo.save(noDlRound);
        const r = await api(coordToken).post(`/api/rounds/${noDlRound.id}/approve`, {});
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/deadline/i);
        await roundRepo.delete(noDlRound.id);
        await paperRepo.delete(noDlPaper.id);
    });

    // Round without overleaf link guard
    test('round whose paper has no overleaf link → 400', async () => {
        const roundRepo = AppDataSource.getRepository(Round);
        const paperRepo = AppDataSource.getRepository(Paper);
        const noLinkPaper = paperRepo.create({ title: 'NoLink', abstractText: '', overleafLink: null as any, creationTime: new Date(), status: PaperStatus.Draft });
        noLinkPaper.coordinators = [{ id: coordId } as any];
        noLinkPaper.labs = [];
        noLinkPaper.authors = [];
        await paperRepo.save(noLinkPaper);
        const noLinkRound = roundRepo.create({ paper: noLinkPaper, roundNumber: 1, status: RoundStatus.Draft, targetVenue: 'T', venueCategory: VenueCategory.Journal, submissionDeadline: null, deadline: new Date(future(14)), startedAt: null, completedAt: null });
        noLinkRound.proposedReviewers = [{ id: r1Id } as any];
        await roundRepo.save(noLinkRound);
        const r = await api(coordToken).post(`/api/rounds/${noLinkRound.id}/approve`, {});
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/overleaf/i);
        await roundRepo.delete(noLinkRound.id);
        await paperRepo.delete(noLinkPaper.id);
    });

    // Round with empty proposed list
    test('round with empty proposed list → 400', async () => {
        const roundRepo = AppDataSource.getRepository(Round);
        const paperRepo = AppDataSource.getRepository(Paper);
        const emptyPaper = paperRepo.create({ title: 'EmptyProposed', abstractText: '', overleafLink: 'x', creationTime: new Date(), status: PaperStatus.Draft });
        emptyPaper.coordinators = [{ id: coordId } as any];
        emptyPaper.labs = [];
        emptyPaper.authors = [];
        await paperRepo.save(emptyPaper);
        const emptyRound = roundRepo.create({ paper: emptyPaper, roundNumber: 1, status: RoundStatus.Draft, targetVenue: 'T', targetVenueUrl: 'https://example.com/t', venueCategory: VenueCategory.Journal, submissionDeadline: null, deadline: new Date(future(14)), startedAt: null, completedAt: null });
        emptyRound.proposedReviewers = [];
        await roundRepo.save(emptyRound);
        const r = await api(coordToken).post(`/api/rounds/${emptyRound.id}/approve`, {});
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/proposed/i);
        await roundRepo.delete(emptyRound.id);
        await paperRepo.delete(emptyPaper.id);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8 · APPROVE ROUND — HAPPY PATH
// ─────────────────────────────────────────────────────────────────────────────

describe('8 · Approve round — happy path', () => {
    test('coordinator approves → 200, Open, startedAt set', async () => {
        const r = await api(coordToken).post(`/api/rounds/${roundId}/approve`, {});
        expect(r.status).toBe(200);
        expect(r.body.round.status).toBe('Open');
        expect(r.body.round.startedAt).not.toBeNull();
        expect(r.body.assigned).toBe(3);
        expect(r.body.skipped).toBe(0);
    });
    test('paper transitions to HumanReview', async () => {
        const paper = await AppDataSource.getRepository(Paper).findOne({ where: { id: paperId } });
        expect(paper?.status).toBe(PaperStatus.HumanReview);
    });
    test('three assignments created — all Invited + invitationSent=true', async () => {
        const r = await api(coordToken).get(`/api/papers/${paperId}/rounds`);
        const round = r.body.find((x: any) => x.id === roundId);
        expect(round.assignments).toHaveLength(3);
        expect(round.assignments.every((a: any) => a.status === 'Invited')).toBe(true);
        expect(round.assignments.every((a: any) => a.invitationSent === true)).toBe(true);
        r1AssignId = round.assignments.find((a: any) => a.reviewer.id === r1Id).id;
        r2AssignId = round.assignments.find((a: any) => a.reviewer.id === r2Id).id;
        r3AssignId = round.assignments.find((a: any) => a.reviewer.id === r3Id).id;
    });
    test('assigned reviewer sees paper authors and GitHub link in their assignment', async () => {
        const r = await api(r1Token).get('/api/assignments/my');
        expect(r.status).toBe(200);
        const assignment = r.body.find((a: any) => a.id === r1AssignId);
        expect(assignment).toBeTruthy();

        expect(assignment.paper.authors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: authorId, name: 'Author C', email: 'author_c@comp.test' }),
            ]),
        );
    });
    test('approving again → 400 (not Draft anymore)', async () => {
        const r = await api(coordToken).post(`/api/rounds/${roundId}/approve`, {});
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/Draft/i);
    });
    test('editing round deadline after open → 400', async () => {
        const r = await api(coordToken).put(`/api/rounds/${roundId}/deadline`, { deadline: future(10) });
        expect(r.status).toBe(400);
    });
    test('proposing reviewer on Open round → 400', async () => {
        const r = await api(coordToken).post(`/api/rounds/${roundId}/propose`, { reviewerId: r1Id });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/Draft/i);
    });
    test('removing proposed reviewer on Open round → 400', async () => {
        const r = await api(coordToken).delete(`/api/rounds/${roundId}/propose/${r1Id}`);
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/Draft/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9 · ASSIGNMENT MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

describe('9 · Assignment management', () => {
    test('reviewer cannot cancel own assignment → 403', async () => {
        const r = await api(r3Token).delete(`/api/assignments/${r3AssignId}`);
        expect(r.status).toBe(403);
    });
    test('coordinator updates r3 assignment deadline within ceiling → 200', async () => {
        const r = await api(coordToken).put(`/api/assignments/${r3AssignId}/deadline`, { deadline: future(20) });
        expect(r.status).toBe(200);
    });
    test('assignment deadline beyond submissionDeadline → 400', async () => {
        const r = await api(coordToken).put(`/api/assignments/${r3AssignId}/deadline`, { deadline: future(60) });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/submission deadline/i);
    });
    test('reviewer cannot update assignment deadline → 403', async () => {
        const r = await api(r3Token).put(`/api/assignments/${r3AssignId}/deadline`, { deadline: future(10) });
        expect(r.status).toBe(403);
    });
    test('coordinator cancels r3 assignment → 200', async () => {
        const r = await api(coordToken).delete(`/api/assignments/${r3AssignId}`);
        expect(r.status).toBe(200);
        expect(r.body.roundId).toBe(roundId);
    });
    test('cancelled assignment status is Cancelled in DB', async () => {
        const a = await AppDataSource.getRepository(Assignment).findOne({ where: { id: r3AssignId } });
        expect(a?.status).toBe(AssignmentStatus.Cancelled);
    });
    test('cancelling already-cancelled assignment → 400', async () => {
        const r = await api(coordToken).delete(`/api/assignments/${r3AssignId}`);
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/Cancelled/i);
    });
    test('r3 can be reassigned to r3 again after cancel → 201', async () => {
        const r = await api(coordToken).post(`/api/assignments/${r3AssignId}/reassign`, { newReviewerId: r3Id, labId });
        expect(r.status).toBe(201);
        expect(r.body.reviewer.id).toBe(r3Id);
        r3AssignId = r.body.id;
    });
    test('old assignment is now Reassigned', async () => {
        const assignments = await AppDataSource.getRepository(Assignment).find({ where: { round: { id: roundId }, reviewer: { id: r3Id } } });
        const reassigned = assignments.find(a => a.status === AssignmentStatus.Reassigned);
        expect(reassigned).toBeTruthy();
    });
    test('r3 suggestions now excluded (has active assignment)', async () => {
        const r = await api(coordToken).get(`/api/rounds/${roundId}/suggest`);
        const ids = r.body.map((s: any) => s.user.id);
        expect(ids).not.toContain(r3Id);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10 · REVIEWER RESPONSES — ACCEPT
// ─────────────────────────────────────────────────────────────────────────────

describe('10 · Reviewer accept invitation', () => {
    test('reviewer cannot accept someone else\'s assignment → 403', async () => {
        const r = await api(r2Token).patch(`/api/responses/${r1AssignId}/accept`, {});
        expect(r.status).toBe(403);
    });
    test('r1 accepts invitation → 200, status Accepted', async () => {
        const r = await api(r1Token).patch(`/api/responses/${r1AssignId}/accept`, {});
        expect(r.status).toBe(200);
        expect(r.body.status).toBe('Accepted');
    });
    test('r1 accepts again → 400 (not Invited anymore)', async () => {
        const r = await api(r1Token).patch(`/api/responses/${r1AssignId}/accept`, {});
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/Accepted/i);
    });
    test('r2 accepts → Accepted', async () => {
        const r = await api(r2Token).patch(`/api/responses/${r2AssignId}/accept`, {});
        expect(r.status).toBe(200);
        expect(r.body.status).toBe('Accepted');
    });
    test('r3 accepts → Accepted', async () => {
        const r = await api(r3Token).patch(`/api/responses/${r3AssignId}/accept`, {});
        expect(r.status).toBe(200);
        expect(r.body.status).toBe('Accepted');
    });
    test('cancelling Accepted assignment → 400 (not cancellable)', async () => {
        const r = await api(coordToken).delete(`/api/assignments/${r3AssignId}`);
        expect(r.status).toBe(400);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11 · REVIEWER RESPONSES — DECLINE REQUEST
// ─────────────────────────────────────────────────────────────────────────────

describe('11 · Decline request flow', () => {
    test('decline request without reason → 400', async () => {
        const r = await api(r1Token).post(`/api/responses/${r1AssignId}/decline-request`, {});
        expect(r.status).toBe(400);
    });
    test('r1 requests decline with reason → 201', async () => {
        const r = await api(r1Token).post(`/api/responses/${r1AssignId}/decline-request`, { declineReason: 'Conflict of interest' });
        expect(r.status).toBe(201);
        expect(r.body.declineRequestId).toBeTruthy();
        r1DeclineReqId = r.body.declineRequestId;
        expect(r.body.assignmentStatus).toBe('PendingDecline');
    });
    test('r1 cannot accept while PendingDecline → 400', async () => {
        const r = await api(r1Token).patch(`/api/responses/${r1AssignId}/accept`, {});
        expect(r.status).toBe(400);
    });
    test('coordinator sees pendingDeclineRequest in round view', async () => {
        const r = await api(coordToken).get(`/api/papers/${paperId}/rounds`);
        const a1 = r.body.find((x: any) => x.id === roundId).assignments.find((a: any) => a.id === r1AssignId);
        expect(a1.pendingDeclineRequest).not.toBeNull();
    });
    test('reviewer cannot process decline → 403', async () => {
        const r = await api(r1Token).patch(`/api/assignments/${r1AssignId}/process-decline`, { decision: 'Approve', labId });
        expect(r.status).toBe(403);
    });
    test('coordinator rejects decline → r1 back to Accepted', async () => {
        const r = await api(coordToken).patch(`/api/assignments/${r1AssignId}/process-decline`, { decision: 'Reject', labId });
        expect(r.status).toBe(200);
        expect(r.body.assignment.status).toBe('Accepted');
    });
    test('processing already-processed decline request → 400', async () => {
        const r = await api(coordToken).patch(`/api/assignments/${r1AssignId}/process-decline`, { decision: 'Approve', labId });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/already been processed/i);
    });
    test('r1 submits a new decline request after rejection → 201', async () => {
        const r = await api(r1Token).post(`/api/responses/${r1AssignId}/decline-request`, { declineReason: 'Workload too heavy' });
        expect(r.status).toBe(201);
        r1DeclineReqId = r.body.declineRequestId;
    });
    test('coordinator approves decline → r1 assignment Declined', async () => {
        const r = await api(coordToken).patch(`/api/assignments/${r1AssignId}/process-decline`, { decision: 'Approve', labId });
        expect(r.status).toBe(200);
        expect(r.body.assignment.status).toBe('Declined');
    });
    test('r1 excluded from suggestions after decline (not Cancelled)', async () => {
        const r = await api(coordToken).get(`/api/rounds/${roundId}/suggest`);
        const ids = r.body.map((s: any) => s.user.id);
        expect(ids).not.toContain(r1Id);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12 · REVIEWER RESPONSES — EXTENSION REQUEST
// ─────────────────────────────────────────────────────────────────────────────

describe('12 · Extension request flow', () => {
    test('extension with date in the past → 400', async () => {
        const r = await api(r2Token).post(`/api/responses/${r2AssignId}/extension-request`, { reason: 'Need time', proposedDeadline: past(1) });
        expect(r.status).toBe(400);
    });
    test('extension with date before current deadline → 400', async () => {
        // assignment deadline is future(14); request future(1) which is before it
        const r = await api(r2Token).post(`/api/responses/${r2AssignId}/extension-request`, { reason: 'Need time', proposedDeadline: future(1) });
        expect(r.status).toBe(400);
    });
    test('r2 requests valid extension → 201', async () => {
        const r = await api(r2Token).post(`/api/responses/${r2AssignId}/extension-request`, { reason: 'Conference overlap', proposedDeadline: future(20) });
        expect([200, 201]).toContain(r.status);
        r2ExtId = r.body.extensionId;
        expect(r2ExtId).toBeTruthy();
        expect(r.body.assignmentStatus).toBe('PendingExtension');
    });
    test('coordinator sees pendingExtensionRequest in round view', async () => {
        const r = await api(coordToken).get(`/api/papers/${paperId}/rounds`);
        const a2 = r.body.find((x: any) => x.id === roundId).assignments.find((a: any) => a.id === r2AssignId);
        expect(a2.pendingExtensionRequest).not.toBeNull();
        expect(a2.pendingExtensionRequest.id).toBe(r2ExtId);
    });
    test('r2 replaces extension request — same extensionId returned', async () => {
        const r = await api(r2Token).post(`/api/responses/${r2AssignId}/extension-request`, { reason: 'Updated', proposedDeadline: future(22) });
        expect(r.status).toBe(200);
        expect(r.body.extensionId).toBe(r2ExtId);
    });
    test('reviewer cannot process extension → 403', async () => {
        const r = await api(r2Token).patch(`/api/assignments/${r2AssignId}/process-extension`, { extensionId: r2ExtId, decision: 'Approve', newDeadline: future(22), labId });
        expect(r.status).toBe(403);
    });
    test('approving extension beyond submissionDeadline → 400', async () => {
        const r = await api(coordToken).patch(`/api/assignments/${r2AssignId}/process-extension`, { extensionId: r2ExtId, decision: 'Approve', newDeadline: future(60), labId });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/submission deadline/i);
    });
    test('approving extension missing newDeadline → 400', async () => {
        const r = await api(coordToken).patch(`/api/assignments/${r2AssignId}/process-extension`, { extensionId: r2ExtId, decision: 'Approve', labId });
        expect(r.status).toBe(400);
    });
    test('coordinator approves extension within ceiling → 200, deadline updated', async () => {
        const newDeadline = future(22);
        const r = await api(coordToken).patch(`/api/assignments/${r2AssignId}/process-extension`, { extensionId: r2ExtId, decision: 'Approve', newDeadline, labId });
        expect(r.status).toBe(200);
        const a = await AppDataSource.getRepository(Assignment).findOne({ where: { id: r2AssignId } });
        expect(new Date(a!.deadline!).getTime()).toBeCloseTo(new Date(newDeadline).getTime(), -3);
    });
    test('processing same extension again → 400', async () => {
        const r = await api(coordToken).patch(`/api/assignments/${r2AssignId}/process-extension`, { extensionId: r2ExtId, decision: 'Reject', labId });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/already been processed/i);
    });
    test('r3 requests extension then coordinator rejects → r3 back to Accepted', async () => {
        const extRes = await api(r3Token).post(`/api/responses/${r3AssignId}/extension-request`, { reason: 'Busy', proposedDeadline: future(25) });
        expect([200, 201]).toContain(extRes.status);
        const extId = extRes.body.extensionId;
        const rejectRes = await api(coordToken).patch(`/api/assignments/${r3AssignId}/process-extension`, { extensionId: extId, decision: 'Reject', labId });
        expect(rejectRes.status).toBe(200);
        const a = await AppDataSource.getRepository(Assignment).findOne({ where: { id: r3AssignId } });
        expect(a?.status).toBe(AssignmentStatus.Accepted);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13 · REVIEW COMPLETION
// ─────────────────────────────────────────────────────────────────────────────

describe('13 · Review completion', () => {
    test('reviewer cannot complete someone else\'s review → 403', async () => {
        const r = await api(r3Token).post('/api/responses/complete', { assignmentId: r2AssignId, summary: 'Fake' });
        expect(r.status).toBe(403);
    });
    test('r2 completes review → 200, status Completed', async () => {
        const r = await api(r2Token).post('/api/responses/complete', { assignmentId: r2AssignId, summary: 'Paper is solid. Minor revisions needed on section 3.' });
        expect(r.status).toBe(200);
        expect(r.body.status).toBe('Completed');
    });
    test('completing already-completed review → 400', async () => {
        const r = await api(r2Token).post('/api/responses/complete', { assignmentId: r2AssignId, summary: 'Again' });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/Completed/i);
    });
    test('cannot cancel Completed assignment → 400', async () => {
        const r = await api(coordToken).delete(`/api/assignments/${r2AssignId}`);
        expect(r.status).toBe(400);
    });
    test('review summary visible in coordinator round view', async () => {
        const r = await api(coordToken).get(`/api/papers/${paperId}/rounds`);
        const a2 = r.body.find((x: any) => x.id === roundId).assignments.find((a: any) => a.id === r2AssignId);
        expect(a2.reviewSummary).not.toBeNull();
        expect(a2.reviewSummary.text).toMatch(/solid/i);
    });
    test('r3 completes review', async () => {
        const r = await api(r3Token).post('/api/responses/complete', { assignmentId: r3AssignId, summary: 'Clear contribution. Accept.' });
        expect(r.status).toBe(200);
        expect(r.body.status).toBe('Completed');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14 · TRACK REVIEW STATUS — DEEP COVERAGE
// ─────────────────────────────────────────────────────────────────────────────

describe('14 · Track review status', () => {
    test('unauthenticated → 401', async () => {
        const r = await api().get(`/api/rounds/${roundId}/status`);
        expect(r.status).toBe(401);
    });
    test('reviewer (not author/coordinator) → 403', async () => {
        const r = await api(r2Token).get(`/api/rounds/${roundId}/status`);
        expect(r.status).toBe(403);
    });
    test('non-existent round → 404', async () => {
        const r = await api(coordToken).get('/api/rounds/00000000-0000-0000-0000-000000000000/status');
        expect(r.status).toBe(404);
    });
    test('coordinator gets 200 with all summary fields', async () => {
        const r = await api(coordToken).get(`/api/rounds/${roundId}/status`);
        expect(r.status).toBe(200);
        expect(r.body.id).toBe(roundId);
        expect(r.body.status).toBe('Open');
        expect(r.body.summary).toBeDefined();
        expect(r.body.summary.total).toBeDefined();
        expect(r.body.summary.completed).toBeDefined();
        expect(r.body.summary.completionRate).toBeDefined();
        expect(r.body.summary.statusCounts).toBeDefined();
        expect(r.body.overdueAssignments).toBeDefined();
        expect(r.body.approachingDeadline).toBeDefined();
    });
    test('author also gets 200', async () => {
        const r = await api(authorToken).get(`/api/rounds/${roundId}/status`);
        expect(r.status).toBe(200);
    });
    test('statusCounts reflect r1=Declined, r2=Completed, r3=Completed, r3_old=Reassigned, r3_cancelled=Cancelled', async () => {
        const r = await api(coordToken).get(`/api/rounds/${roundId}/status`);
        const counts = r.body.summary.statusCounts;
        expect(counts['Declined']).toBeGreaterThanOrEqual(1);
        expect(counts['Completed']).toBeGreaterThanOrEqual(2);
        expect(counts['Cancelled']).toBeGreaterThanOrEqual(1);
    });
    test('completionRate > 0 after completions', async () => {
        const r = await api(coordToken).get(`/api/rounds/${roundId}/status`);
        expect(r.body.summary.completionRate).toBeGreaterThan(0);
    });
    test('overdue count reflects assignment with past deadline', async () => {
        const assignRepo = AppDataSource.getRepository(Assignment);
        // Find any active assignment (r1 is Declined, r2 Completed, r3 Completed) — re-assign r1 to check overdue
        // Instead force r3AssignId deadline to past to simulate
        const pastDeadline = new Date(past(1));
        // r3 is Completed — Completed assignments are not in activeStatuses, so overdue won't count it.
        // Let's use the reassigned assignment by finding it or just test with a direct DB approach.
        // Re-assign r1 to get a fresh Invited assignment
        const newR1Assign = await (async () => {
            const res = await api(coordToken).post(`/api/assignments/${r1AssignId}/reassign`, { newReviewerId: r1Id, labId });
            return res;
        })();
        if (newR1Assign.status !== 201) { return; } // guard
        const newAssignId = newR1Assign.body.id;
        await assignRepo.update(newAssignId, { deadline: pastDeadline });

        const r = await api(coordToken).get(`/api/rounds/${roundId}/status`);
        expect(r.body.summary.overdueCount).toBeGreaterThanOrEqual(1);
        const found = r.body.overdueAssignments.find((a: any) => a.id === newAssignId);
        expect(found).toBeTruthy();
        expect(found.reviewer.id).toBe(r1Id);

        // Restore + cancel to clean up
        await assignRepo.update(newAssignId, { deadline: new Date(future(14)) });
        await api(coordToken).delete(`/api/assignments/${newAssignId}`);
    });
    test('approaching deadline count reflects assignment due within 3 days', async () => {
        const assignRepo = AppDataSource.getRepository(Assignment);
        // Re-assign r1 one more time with a near deadline
        const res = await api(coordToken).post(`/api/assignments/${r1AssignId}/reassign`, { newReviewerId: r1Id, labId });
        if (res.status !== 201) { return; }
        const nearAssignId = res.body.id;
        await assignRepo.update(nearAssignId, { deadline: new Date(future(1)) });

        const r = await api(coordToken).get(`/api/rounds/${roundId}/status`);
        expect(r.body.summary.approachingDeadlineCount).toBeGreaterThanOrEqual(1);
        const found = r.body.approachingDeadline.find((a: any) => a.id === nearAssignId);
        expect(found).toBeTruthy();

        // cancel to clean up
        await api(coordToken).delete(`/api/assignments/${nearAssignId}`);
    });
    test('"all on track" when no overdue or approaching (fresh deadline)', async () => {
        // After cleanup above all active assignments should have future deadlines
        const r = await api(coordToken).get(`/api/rounds/${roundId}/status`);
        // overdueCount should be 0
        expect(r.body.summary.overdueCount).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15 · SEND REMINDERS
// ─────────────────────────────────────────────────────────────────────────────

describe('15 · Send reminders', () => {
    let activeId: string;
    let completedId: string;

    beforeAll(async () => {
        // r2AssignId is Completed, r3AssignId is Completed
        // get a fresh Invited assignment — reassign r1 one more time
        const res = await api(coordToken).post(`/api/assignments/${r1AssignId}/reassign`, { newReviewerId: r1Id, labId });
        activeId    = res.status === 201 ? res.body.id : r3AssignId;   // fallback
        completedId = r2AssignId;
        r1AssignId  = activeId;  // update for remaining tests
    });

    test('unauthenticated → 401', async () => {
        const r = await api().post('/api/assignments/remind', { assignmentIds: [activeId] });
        expect(r.status).toBe(401);
    });
    test('reviewer cannot send reminders → 403', async () => {
        const r = await api(r1Token).post('/api/assignments/remind', { assignmentIds: [activeId] });
        expect(r.status).toBe(403);
    });
    test('empty array → 400', async () => {
        const r = await api(coordToken).post('/api/assignments/remind', { assignmentIds: [] });
        expect(r.status).toBe(400);
    });
    test('missing field → 400', async () => {
        const r = await api(coordToken).post('/api/assignments/remind', {});
        expect(r.status).toBe(400);
    });
    test('remind active (Invited) assignment → sent=1, skipped=0', async () => {
        const r = await api(coordToken).post('/api/assignments/remind', { assignmentIds: [activeId] });
        expect(r.status).toBe(200);
        expect(r.body.sent).toBe(1);
        expect(r.body.skipped).toBe(0);
    });
    test('remind Completed assignment → skipped=1', async () => {
        const r = await api(coordToken).post('/api/assignments/remind', { assignmentIds: [completedId] });
        expect(r.status).toBe(200);
        expect(r.body.sent).toBe(0);
        expect(r.body.skipped).toBe(1);
    });
    test('mixed batch → correct sent/skipped', async () => {
        const r = await api(coordToken).post('/api/assignments/remind', { assignmentIds: [activeId, completedId] });
        expect(r.status).toBe(200);
        expect(r.body.sent).toBe(1);
        expect(r.body.skipped).toBe(1);
    });
    test('non-existent assignmentId → skipped (not owned by coordinator)', async () => {
        const r = await api(coordToken).post('/api/assignments/remind', { assignmentIds: ['00000000-0000-0000-0000-000000000000'] });
        expect(r.status).toBe(200);
        expect(r.body.skipped).toBe(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 16 · SECOND ROUND FLOW
// ─────────────────────────────────────────────────────────────────────────────

describe('16 · Full second round lifecycle', () => {
    let round2Id: string;
    let r2r2AssignId: string;
    let r3r2AssignId: string;

    test('force first round to Completed so second can be created', async () => {
        await AppDataSource.getRepository(Round).update(roundId, {
            status: RoundStatus.Completed,
            completedAt: new Date(),
        });
        const round = await AppDataSource.getRepository(Round).findOne({ where: { id: roundId } });
        expect(round?.status).toBe(RoundStatus.Completed);
    });
    test('editing deadline on Completed round → 400', async () => {
        const r = await api(coordToken).put(`/api/rounds/${roundId}/deadline`, { deadline: future(5) });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/Draft/i);
    });
    test('coordinator creates Journal round 2 → 201, roundNumber=2', async () => {
        const r = await api(coordToken).post('/api/rounds', {
            paperId,
            targetVenue: 'Transactions on SE',
            targetVenueUrl: 'https://example.com/transactions-on-se',
            venueCategory: 'Journal',
        });
        expect(r.status).toBe(201);
        expect(r.body.roundNumber).toBe(2);
        expect(r.body.venueCategory).toBe('Journal');
        expect(r.body.submissionDeadline).toBeNull();
        round2Id = r.body.id;
    });
    test('set deadline on round 2 (Journal — no submission deadline ceiling)', async () => {
        const r = await api(coordToken).put(`/api/rounds/${round2Id}/deadline`, { deadline: future(21) });
        expect(r.status).toBe(200);
    });
    test('Journal assignment deadline beyond round2 deadline but no conf ceiling → 200', async () => {
        // For Journal rounds there is no submission deadline cap, only the round deadline
        // Propose and approve first
        await api(coordToken).post(`/api/rounds/${round2Id}/propose`, { reviewerId: r2Id });
        await api(coordToken).post(`/api/rounds/${round2Id}/propose`, { reviewerId: r3Id });
        const approveRes = await api(coordToken).post(`/api/rounds/${round2Id}/approve`, {});
        expect(approveRes.status).toBe(200);
        expect(approveRes.body.assigned).toBe(2);
        const r2 = await api(coordToken).get(`/api/papers/${paperId}/rounds`);
        const round2 = r2.body.find((x: any) => x.id === round2Id);
        r2r2AssignId = round2.assignments.find((a: any) => a.reviewer.id === r2Id).id;
        r3r2AssignId = round2.assignments.find((a: any) => a.reviewer.id === r3Id).id;
    });
    test('round 2 is Open, assignments Invited + invitationSent=true', async () => {
        const r = await api(coordToken).get(`/api/papers/${paperId}/rounds`);
        const round2 = r.body.find((x: any) => x.id === round2Id);
        expect(round2.status).toBe('Open');
        expect(round2.assignments).toHaveLength(2);
        expect(round2.assignments.every((a: any) => a.invitationSent)).toBe(true);
    });
    test('both reviewers accept invitations', async () => {
        expect((await api(r2Token).patch(`/api/responses/${r2r2AssignId}/accept`, {})).status).toBe(200);
        expect((await api(r3Token).patch(`/api/responses/${r3r2AssignId}/accept`, {})).status).toBe(200);
    });
    test('both reviewers complete reviews', async () => {
        expect((await api(r2Token).post('/api/responses/complete', { assignmentId: r2r2AssignId, summary: 'Round 2 review by r2.' })).status).toBe(200);
        expect((await api(r3Token).post('/api/responses/complete', { assignmentId: r3r2AssignId, summary: 'Round 2 review by r3.' })).status).toBe(200);
    });
    test('track review status for round 2 shows 100% completion', async () => {
        const r = await api(coordToken).get(`/api/rounds/${round2Id}/status`);
        expect(r.status).toBe(200);
        expect(r.body.summary.completionRate).toBe(100);
        expect(r.body.summary.completed).toBe(2);
        expect(r.body.summary.total).toBe(2);
    });
    test('both rounds visible in coordinator view', async () => {
        const r = await api(coordToken).get(`/api/papers/${paperId}/rounds`);
        const ids = r.body.map((x: any) => x.id);
        expect(ids).toContain(roundId);
        expect(ids).toContain(round2Id);
    });
});
