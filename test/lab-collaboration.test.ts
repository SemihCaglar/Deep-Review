/**
 * Edge-case integration tests — Lab Collaboration Invitation workflow.
 *
 * Tries to break every auth boundary, state-machine guard, and data-integrity
 * constraint introduced by issue #76.
 *
 * Cast of actors:
 *   coordA       — Coordinator of labA, owner of the paper
 *   coordB       — Coordinator of labB (the invited lab)
 *   coordC       — Coordinator of labC (third lab — "outsider coordinator")
 *   member       — Plain LabMember in labA (no coordinator privileges)
 */

import 'reflect-metadata';
import request from 'supertest';
import app from '../backend/src/app';
import { AppDataSource } from '../backend/src/data-source';
import { Coordinator } from '../backend/src/entities/Coordinator';
import { LabMember } from '../backend/src/entities/LabMember';
import { Lab } from '../backend/src/entities/Lab';
import { Paper, PaperStatus } from '../backend/src/entities/Paper';
import { ApprovalStatus } from '../backend/src/entities/User';
import { LabCollaborationInvitation, CollaborationInvitationStatus } from '../backend/src/entities/LabCollaborationInvitation';
import { hashPassword } from '../backend/src/services/accountSecurity';

// ── Shared state ───────────────────────────────────────────────────────────────

let tokenA: string;   // coordA
let tokenB: string;   // coordB
let tokenC: string;   // coordC
let tokenM: string;   // plain member

let coordAId: string;
let coordBId: string;
let coordCId: string;
let labAId: string;
let labBId: string;
let labCId: string;
let paperId: string;

let invitationId: string; // created in early tests, reused later

// ── Seed ──────────────────────────────────────────────────────────────────────

async function seed() {
    const userRepo  = AppDataSource.getRepository('User');
    const labRepo   = AppDataSource.getRepository(Lab);
    const paperRepo = AppDataSource.getRepository(Paper);

    const pw = await hashPassword('pass');
    const mkCoord = (name: string, email: string) =>
        Object.assign(new Coordinator(), {
            name, email, passwordHash: pw,
            approvalStatus: ApprovalStatus.Approved,
            approvalReviewedAt: new Date(), approvalNote: null,
            failedLogins: 0, failedLoginWindowStartedAt: null,
            lockedUntil: null, lastLoginAt: null,
        });
    const mkMember = (name: string, email: string) =>
        Object.assign(new LabMember(), {
            name, email, passwordHash: pw,
            approvalStatus: ApprovalStatus.Approved,
            approvalReviewedAt: new Date(), approvalNote: null,
            failedLogins: 0, failedLoginWindowStartedAt: null,
            lockedUntil: null, lastLoginAt: null,
        });

    const cA = mkCoord('Coord A', 'coord_a@collab.test');
    const cB = mkCoord('Coord B', 'coord_b@collab.test');
    const cC = mkCoord('Coord C', 'coord_c@collab.test');
    const m  = mkMember('Member A', 'member_a@collab.test');

    for (const u of [cA, cB, cC, m]) await userRepo.save(u);
    coordAId = cA.id;
    coordBId = cB.id;
    coordCId = cC.id;

    const labA = labRepo.create({ name: 'Lab Alpha', description: '' });
    labA.coordinator = cA;
    labA.members = [cA, m];
    await labRepo.save(labA);
    labAId = labA.id;

    const labB = labRepo.create({ name: 'Lab Beta', description: '' });
    labB.coordinator = cB;
    labB.members = [cB];
    await labRepo.save(labB);
    labBId = labB.id;

    const labC = labRepo.create({ name: 'Lab Gamma', description: '' });
    labC.coordinator = cC;
    labC.members = [cC];
    await labRepo.save(labC);
    labCId = labC.id;

    const paper = paperRepo.create({
        title: 'Collab Test Paper',
        abstractText: 'Abstract.',
        overleafLink: 'https://overleaf.com/collab_test',
        creationTime: new Date(),
        status: PaperStatus.Draft,
    });
    paper.coordinators = [cA];
    paper.labs = [labA];
    paper.authors = [m];
    await paperRepo.save(paper);
    paperId = paper.id;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
    await AppDataSource.initialize();
    await AppDataSource.synchronize(true);
    await seed();
});

afterAll(async () => {
    await AppDataSource.destroy();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const api = (token?: string) => {
    const r = request(app);
    return {
        get:   (p: string)            => r.get(p).set('Authorization', token ? `Bearer ${token}` : ''),
        post:  (p: string, b: object) => r.post(p).set('Authorization', token ? `Bearer ${token}` : '').send(b),
        patch: (p: string, b: object) => r.patch(p).set('Authorization', token ? `Bearer ${token}` : '').send(b),
    };
};

// ── 1 · Login all actors ───────────────────────────────────────────────────────

describe('1 · Login', () => {
    test('coordA login', async () => {
        const r = await request(app).post('/api/account/login').send({ email: 'coord_a@collab.test', password: 'pass' });
        expect(r.status).toBe(200);
        tokenA = r.body.token;
    });
    test('coordB login', async () => {
        const r = await request(app).post('/api/account/login').send({ email: 'coord_b@collab.test', password: 'pass' });
        expect(r.status).toBe(200);
        tokenB = r.body.token;
    });
    test('coordC login', async () => {
        const r = await request(app).post('/api/account/login').send({ email: 'coord_c@collab.test', password: 'pass' });
        expect(r.status).toBe(200);
        tokenC = r.body.token;
    });
    test('member login', async () => {
        const r = await request(app).post('/api/account/login').send({ email: 'member_a@collab.test', password: 'pass' });
        expect(r.status).toBe(200);
        tokenM = r.body.token;
    });
});

// ── 2 · Auth guards on every endpoint ─────────────────────────────────────────

describe('2 · Unauthenticated requests are rejected', () => {
    test('POST /papers/:id/collaboration-invitations — no token → 401', async () => {
        const r = await api().post(`/api/papers/${paperId}/collaboration-invitations`, { labIds: [labBId] });
        expect(r.status).toBe(401);
    });
    test('GET /papers/:id/collaboration-invitations — no token → 401', async () => {
        const r = await api().get(`/api/papers/${paperId}/collaboration-invitations`);
        expect(r.status).toBe(401);
    });
    test('GET /collaboration-invitations/pending — no token → 401', async () => {
        const r = await api().get('/api/collaboration-invitations/pending');
        expect(r.status).toBe(401);
    });
    test('PATCH /collaboration-invitations/:id/accept — no token → 401', async () => {
        const r = await api().patch('/api/collaboration-invitations/fake-id/accept', {});
        expect(r.status).toBe(401);
    });
    test('PATCH /collaboration-invitations/:id/reject — no token → 401', async () => {
        const r = await api().patch('/api/collaboration-invitations/fake-id/reject', {});
        expect(r.status).toBe(401);
    });
    test('PATCH /collaboration-invitations/:id/cancel — no token → 401', async () => {
        const r = await api().patch('/api/collaboration-invitations/fake-id/cancel', {});
        expect(r.status).toBe(401);
    });
});

// ── 3 · Role guards — plain member cannot use coordinator endpoints ────────────

describe('3 · Role guards — plain LabMember is blocked', () => {
    test('member cannot send invitation → 403', async () => {
        const r = await api(tokenM).post(`/api/papers/${paperId}/collaboration-invitations`, { labIds: [labBId] });
        expect(r.status).toBe(403);
    });
    test('member cannot view paper invitations → 403', async () => {
        const r = await api(tokenM).get(`/api/papers/${paperId}/collaboration-invitations`);
        expect(r.status).toBe(403);
    });
    test('member cannot view pending invitations → 403', async () => {
        const r = await api(tokenM).get('/api/collaboration-invitations/pending');
        expect(r.status).toBe(403);
    });
    test('member cannot accept an invitation → 403', async () => {
        const r = await api(tokenM).patch('/api/collaboration-invitations/fake-id/accept', {});
        expect(r.status).toBe(403);
    });
    test('member cannot reject an invitation → 403', async () => {
        const r = await api(tokenM).patch('/api/collaboration-invitations/fake-id/reject', {});
        expect(r.status).toBe(403);
    });
    test('member cannot cancel an invitation → 403', async () => {
        const r = await api(tokenM).patch('/api/collaboration-invitations/fake-id/cancel', {});
        expect(r.status).toBe(403);
    });
});

// ── 4 · Coordinator-of-paper guard ────────────────────────────────────────────

describe('4 · Non-coordinator of paper cannot manage invitations', () => {
    test('coordB (not on paper) cannot send invitation → 403', async () => {
        const r = await api(tokenB).post(`/api/papers/${paperId}/collaboration-invitations`, { labIds: [labCId] });
        expect(r.status).toBe(403);
    });
    test('coordB (not on paper) cannot view paper invitations → 403', async () => {
        const r = await api(tokenB).get(`/api/papers/${paperId}/collaboration-invitations`);
        expect(r.status).toBe(403);
    });
});

// ── 5 · Input validation ──────────────────────────────────────────────────────

describe('5 · Input validation', () => {
    test('empty labIds array → 400', async () => {
        const r = await api(tokenA).post(`/api/papers/${paperId}/collaboration-invitations`, { labIds: [] });
        expect(r.status).toBe(400);
    });
    test('missing labIds field → 400', async () => {
        const r = await api(tokenA).post(`/api/papers/${paperId}/collaboration-invitations`, {});
        expect(r.status).toBe(400);
    });
    test('non-array labIds → 400', async () => {
        const r = await api(tokenA).post(`/api/papers/${paperId}/collaboration-invitations`, { labIds: labBId });
        expect(r.status).toBe(400);
    });
    test('invite own lab → partial errors, no crash', async () => {
        const r = await api(tokenA).post(`/api/papers/${paperId}/collaboration-invitations`, { labIds: [labAId] });
        // Should return 201 but with the error listed, no invitation created
        expect(r.status).toBe(201);
        expect(r.body.invited).toHaveLength(0);
        expect(r.body.errors.length).toBeGreaterThan(0);
        expect(r.body.errors[0].reason).toMatch(/own lab/i);
    });
    test('invite non-existent lab → partial error', async () => {
        const r = await api(tokenA).post(`/api/papers/${paperId}/collaboration-invitations`, { labIds: ['00000000-0000-0000-0000-000000000000'] });
        expect(r.status).toBe(201);
        expect(r.body.invited).toHaveLength(0);
        expect(r.body.errors[0].reason).toMatch(/not found/i);
    });
    test('non-existent paper → 404', async () => {
        const r = await api(tokenA).post(`/api/papers/00000000-0000-0000-0000-000000000000/collaboration-invitations`, { labIds: [labBId] });
        expect(r.status).toBe(404);
    });
});

// ── 6 · Happy path — send invitation ─────────────────────────────────────────

describe('6 · Happy path — coordA invites labB', () => {
    test('coordA sends invitation to labB → 201 with invitation record', async () => {
        const r = await api(tokenA).post(`/api/papers/${paperId}/collaboration-invitations`, { labIds: [labBId] });
        expect(r.status).toBe(201);
        expect(r.body.invited).toHaveLength(1);
        expect(r.body.errors).toHaveLength(0);
        expect(r.body.invited[0].status).toBe('Pending');
        invitationId = r.body.invited[0].id;
    });
    test('invitation is listed on the paper', async () => {
        const r = await api(tokenA).get(`/api/papers/${paperId}/collaboration-invitations`);
        expect(r.status).toBe(200);
        expect(r.body.some((inv: any) => inv.id === invitationId)).toBe(true);
        const inv = r.body.find((inv: any) => inv.id === invitationId);
        expect(inv.status).toBe('Pending');
        expect(inv.invitedLab.id).toBe(labBId);
    });
    test('coordB sees it in pending invitations', async () => {
        const r = await api(tokenB).get('/api/collaboration-invitations/pending');
        expect(r.status).toBe(200);
        expect(r.body.some((inv: any) => inv.id === invitationId)).toBe(true);
    });
    test('coordC sees NO pending invitations (not invited)', async () => {
        const r = await api(tokenC).get('/api/collaboration-invitations/pending');
        expect(r.status).toBe(200);
        expect(r.body.every((inv: any) => inv.id !== invitationId)).toBe(true);
    });
});

// ── 7 · Duplicate invitation guard ───────────────────────────────────────────

describe('7 · Duplicate invitation guard', () => {
    test('sending a second invitation to same lab while one is Pending → partial error', async () => {
        const r = await api(tokenA).post(`/api/papers/${paperId}/collaboration-invitations`, { labIds: [labBId] });
        expect(r.status).toBe(201);
        expect(r.body.invited).toHaveLength(0);
        expect(r.body.errors[0].reason).toMatch(/pending invitation/i);
    });
});

// ── 8 · Wrong coordinator cannot respond ─────────────────────────────────────

describe('8 · Wrong coordinator cannot accept or reject', () => {
    test('coordC (not invited lab coordinator) cannot accept → 403', async () => {
        const r = await api(tokenC).patch(`/api/collaboration-invitations/${invitationId}/accept`, {});
        expect(r.status).toBe(403);
    });
    test('coordA (inviting lab coordinator) cannot accept their own invitation → 403', async () => {
        const r = await api(tokenA).patch(`/api/collaboration-invitations/${invitationId}/accept`, {});
        expect(r.status).toBe(403);
    });
    test('coordC cannot reject → 403', async () => {
        const r = await api(tokenC).patch(`/api/collaboration-invitations/${invitationId}/reject`, {});
        expect(r.status).toBe(403);
    });
});

// ── 9 · Wrong coordinator cannot cancel ──────────────────────────────────────

describe('9 · Wrong coordinator cannot cancel', () => {
    test('coordC (unrelated) cannot cancel → 403', async () => {
        const r = await api(tokenC).patch(`/api/collaboration-invitations/${invitationId}/cancel`, {});
        expect(r.status).toBe(403);
    });
    test('coordB (invited lab) cannot cancel the invitation they received → 403', async () => {
        const r = await api(tokenB).patch(`/api/collaboration-invitations/${invitationId}/cancel`, {});
        expect(r.status).toBe(403);
    });
});

// ── 10 · Non-existent invitation ─────────────────────────────────────────────

describe('10 · Non-existent invitation', () => {
    test('accept ghost id → 404', async () => {
        const r = await api(tokenB).patch('/api/collaboration-invitations/00000000-0000-0000-0000-000000000000/accept', {});
        expect(r.status).toBe(404);
    });
    test('reject ghost id → 404', async () => {
        const r = await api(tokenB).patch('/api/collaboration-invitations/00000000-0000-0000-0000-000000000000/reject', {});
        expect(r.status).toBe(404);
    });
    test('cancel ghost id → 404', async () => {
        const r = await api(tokenA).patch('/api/collaboration-invitations/00000000-0000-0000-0000-000000000000/cancel', {});
        expect(r.status).toBe(404);
    });
});

// ── 11 · Happy path — coordB accepts ─────────────────────────────────────────

describe('11 · Happy path — coordB accepts the invitation', () => {
    test('coordB accepts → 200, status Accepted', async () => {
        const r = await api(tokenB).patch(`/api/collaboration-invitations/${invitationId}/accept`, {});
        expect(r.status).toBe(200);
        expect(r.body.status).toBe('Accepted');
    });
    test('labB is now in paper.labs', async () => {
        const paper = await AppDataSource.getRepository(Paper).findOne({
            where: { id: paperId },
            relations: ['labs'],
        });
        expect(paper!.labs.some(l => l.id === labBId)).toBe(true);
    });
    test('coordB is now in paper.coordinators', async () => {
        const paper = await AppDataSource.getRepository(Paper).findOne({
            where: { id: paperId },
            relations: ['coordinators'],
        });
        expect(paper!.coordinators.some(c => c.id === coordBId)).toBe(true);
    });
    test('invitation no longer appears in coordBs pending list', async () => {
        const r = await api(tokenB).get('/api/collaboration-invitations/pending');
        expect(r.status).toBe(200);
        expect(r.body.every((inv: any) => inv.id !== invitationId)).toBe(true);
    });
    test('invitation shows Accepted status on paper', async () => {
        const r = await api(tokenA).get(`/api/papers/${paperId}/collaboration-invitations`);
        const inv = r.body.find((inv: any) => inv.id === invitationId);
        expect(inv.status).toBe('Accepted');
    });
});

// ── 12 · State-machine: cannot re-respond to a closed invitation ──────────────

describe('12 · State-machine: already-Accepted invitation cannot be changed', () => {
    test('coordB cannot accept again → 400', async () => {
        const r = await api(tokenB).patch(`/api/collaboration-invitations/${invitationId}/accept`, {});
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/already Accepted/i);
    });
    test('coordB cannot reject an accepted invitation → 400', async () => {
        const r = await api(tokenB).patch(`/api/collaboration-invitations/${invitationId}/reject`, {});
        expect(r.status).toBe(400);
    });
    test('coordA cannot cancel an accepted invitation → 400', async () => {
        const r = await api(tokenA).patch(`/api/collaboration-invitations/${invitationId}/cancel`, {});
        expect(r.status).toBe(400);
    });
});

// ── 13 · Already-collaborating lab guard ─────────────────────────────────────

describe('13 · Already-collaborating lab cannot be re-invited', () => {
    test('inviting labB again (now linked) → partial error: already collaborating', async () => {
        const r = await api(tokenA).post(`/api/papers/${paperId}/collaboration-invitations`, { labIds: [labBId] });
        expect(r.status).toBe(201);
        expect(r.body.invited).toHaveLength(0);
        expect(r.body.errors[0].reason).toMatch(/already collaborating/i);
    });
});

// ── 14 · Cancel flow: send and cancel ────────────────────────────────────────

describe('14 · Cancel flow', () => {
    let cancelInvId: string;

    test('coordA invites labC → 201', async () => {
        const r = await api(tokenA).post(`/api/papers/${paperId}/collaboration-invitations`, { labIds: [labCId] });
        expect(r.status).toBe(201);
        expect(r.body.invited).toHaveLength(1);
        cancelInvId = r.body.invited[0].id;
    });
    test('coordA cancels the invitation → 200, status Cancelled', async () => {
        const r = await api(tokenA).patch(`/api/collaboration-invitations/${cancelInvId}/cancel`, {});
        expect(r.status).toBe(200);
        expect(r.body.status).toBe('Cancelled');
    });
    test('coordC no longer sees it in pending', async () => {
        const r = await api(tokenC).get('/api/collaboration-invitations/pending');
        expect(r.status).toBe(200);
        expect(r.body.every((inv: any) => inv.id !== cancelInvId)).toBe(true);
    });
    test('coordC cannot accept a Cancelled invitation → 400', async () => {
        const r = await api(tokenC).patch(`/api/collaboration-invitations/${cancelInvId}/accept`, {});
        expect(r.status).toBe(400);
    });
    test('after cancellation, coordA can re-invite labC', async () => {
        const r = await api(tokenA).post(`/api/papers/${paperId}/collaboration-invitations`, { labIds: [labCId] });
        expect(r.status).toBe(201);
        expect(r.body.invited).toHaveLength(1);
        // clean up
        const newId = r.body.invited[0].id;
        await api(tokenA).patch(`/api/collaboration-invitations/${newId}/cancel`, {});
    });
});

// ── 15 · Reject flow ─────────────────────────────────────────────────────────

describe('15 · Reject flow', () => {
    let rejectInvId: string;

    test('coordA sends invitation to labC', async () => {
        const r = await api(tokenA).post(`/api/papers/${paperId}/collaboration-invitations`, { labIds: [labCId] });
        expect(r.status).toBe(201);
        rejectInvId = r.body.invited[0].id;
    });
    test('coordC rejects → 200, status Rejected', async () => {
        const r = await api(tokenC).patch(`/api/collaboration-invitations/${rejectInvId}/reject`, {});
        expect(r.status).toBe(200);
        expect(r.body.status).toBe('Rejected');
    });
    test('labC is NOT added to paper.labs after rejection', async () => {
        const paper = await AppDataSource.getRepository(Paper).findOne({
            where: { id: paperId },
            relations: ['labs'],
        });
        expect(paper!.labs.every(l => l.id !== labCId)).toBe(true);
    });
    test('coordC cannot accept a rejected invitation → 400', async () => {
        const r = await api(tokenC).patch(`/api/collaboration-invitations/${rejectInvId}/accept`, {});
        expect(r.status).toBe(400);
    });
});

// ── 16 · Mixed batch: valid + invalid labIds in one request ──────────────────

describe('16 · Mixed batch — valid and invalid labIds together', () => {
    let batchInvId: string;

    test('batch with one valid (labC) and one ghost id → 201 with 1 success + 1 error', async () => {
        const r = await api(tokenA).post(`/api/papers/${paperId}/collaboration-invitations`, {
            labIds: [labCId, '00000000-dead-beef-0000-000000000000'],
        });
        expect(r.status).toBe(201);
        expect(r.body.invited).toHaveLength(1);
        expect(r.body.errors).toHaveLength(1);
        batchInvId = r.body.invited[0].id;
    });
    test('clean up batch invitation', async () => {
        const r = await api(tokenA).patch(`/api/collaboration-invitations/${batchInvId}/cancel`, {});
        expect(r.status).toBe(200);
    });
});

// ── 17 · Register paper with collaboratingLabIds creates invitations ──────────

describe('17 · Register paper with collaboratingLabIds', () => {
    let newPaperId: string;
    let regInvId: string;

    test('coordA registers paper with labC in collaboratingLabIds', async () => {
        const r = await request(app)
            .post('/api/papers')
            .set('Authorization', `Bearer ${tokenA}`)
            .send({
                title: 'Paper With Collab',
                abstractText: 'Created with invitations.',
                overleafLink: 'https://www.overleaf.com/collab_reg_test',
                topics: [],
                authors: [],
                collaboratingLabIds: [labCId],
            });
        expect(r.status).toBe(201);
        newPaperId = r.body.paper.id;
    });
    test('invitation to labC is automatically created', async () => {
        const r = await api(tokenA).get(`/api/papers/${newPaperId}/collaboration-invitations`);
        expect(r.status).toBe(200);
        const pending = r.body.filter((inv: any) => inv.invitedLab.id === labCId && inv.status === 'Pending');
        expect(pending.length).toBe(1);
        regInvId = pending[0].id;
    });
    test('coordC sees it in pending invitations', async () => {
        const r = await api(tokenC).get('/api/collaboration-invitations/pending');
        expect(r.status).toBe(200);
        expect(r.body.some((inv: any) => inv.id === regInvId)).toBe(true);
    });
});

// ── 18 · coordB (now co-coordinator) can send invitations too ─────────────────

describe('18 · Accepted co-coordinator gains sending rights', () => {
    test('coordB (now coordinator of paper after accepting) can view paper invitations', async () => {
        const r = await api(tokenB).get(`/api/papers/${paperId}/collaboration-invitations`);
        expect(r.status).toBe(200);
    });
    test('coordB cannot invite labB (own lab) → partial error', async () => {
        const r = await api(tokenB).post(`/api/papers/${paperId}/collaboration-invitations`, { labIds: [labBId] });
        expect(r.status).toBe(201);
        expect(r.body.invited).toHaveLength(0);
        expect(r.body.errors[0].reason).toMatch(/own lab|already collaborating/i);
    });
});
