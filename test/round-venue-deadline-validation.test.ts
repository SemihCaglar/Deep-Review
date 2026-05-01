import 'reflect-metadata';
import request from 'supertest';
import app from '../backend/src/app';
import { AppDataSource } from '../backend/src/data-source';
import { Coordinator } from '../backend/src/entities/Coordinator';
import { Lab } from '../backend/src/entities/Lab';
import { LabMember } from '../backend/src/entities/LabMember';
import { Paper, PaperStatus } from '../backend/src/entities/Paper';
import { ApprovalStatus } from '../backend/src/entities/User';
import { hashPassword } from '../backend/src/services/accountSecurity';

let coordinatorToken: string;
let paperId: string;
let roundId: string;

const utcDate = (days: number) => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().split('T')[0] + 'T00:00:00.000Z';
};

beforeAll(async () => {
  await AppDataSource.initialize();
  await AppDataSource.synchronize(true);

  const userRepo = AppDataSource.getRepository('User');
  const labRepo = AppDataSource.getRepository(Lab);
  const paperRepo = AppDataSource.getRepository(Paper);
  const passwordHash = await hashPassword('pass');

  const coordinator = Object.assign(new Coordinator(), {
    name: 'Round Validation Coordinator',
    email: 'round-validation-coordinator@test.com',
    passwordHash,
    approvalStatus: ApprovalStatus.Approved,
    approvalReviewedAt: new Date(),
    approvalNote: null,
    failedLogins: 0,
    failedLoginWindowStartedAt: null,
    lockedUntil: null,
    lastLoginAt: null,
  });
  const author = Object.assign(new LabMember(), {
    name: 'Round Validation Author',
    email: 'round-validation-author@test.com',
    passwordHash,
    approvalStatus: ApprovalStatus.Approved,
    approvalReviewedAt: new Date(),
    approvalNote: null,
    failedLogins: 0,
    failedLoginWindowStartedAt: null,
    lockedUntil: null,
    lastLoginAt: null,
  });
  await userRepo.save([coordinator, author]);

  const lab = labRepo.create({
    name: 'Round Validation Lab',
    description: 'Validates venue and UTC deadline behavior',
    coordinator,
    members: [coordinator, author],
  });
  await labRepo.save(lab);

  const paper = paperRepo.create({
    title: 'Round Validation Paper',
    abstractText: 'Used to validate venue URLs and UTC date rules.',
    overleafLink: 'https://overleaf.com/read/round-validation',
    creationTime: new Date(),
    status: PaperStatus.Draft,
    coordinators: [coordinator],
    authors: [author],
    labs: [lab],
  });
  await paperRepo.save(paper);
  paperId = paper.id;

  const login = await request(app)
    .post('/api/account/login')
    .send({ email: 'round-validation-coordinator@test.com', password: 'pass' });
  coordinatorToken = login.body.token;
});

afterAll(async () => {
  await AppDataSource.destroy();
});

test('creating a round requires a venue URL', async () => {
  const res = await request(app)
    .post('/api/rounds')
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({
      paperId,
      targetVenue: 'ICSE 2026',
      venueCategory: 'Conference',
      submissionDeadline: utcDate(30),
    });

  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/targetVenueUrl/i);
});

test('creating a round rejects deadlines before the current UTC day', async () => {
  const res = await request(app)
    .post('/api/rounds')
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({
      paperId,
      targetVenue: 'ICSE 2026',
      targetVenueUrl: 'https://conf.researchr.org/home/icse-2026',
      venueCategory: 'Conference',
      submissionDeadline: utcDate(-1),
      deadline: utcDate(14),
    });

  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/before today/i);
});

test('creating a round stores UTC deadline values when valid', async () => {
  const res = await request(app)
    .post('/api/rounds')
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({
      paperId,
      targetVenue: 'ICSE 2026',
      targetVenueUrl: 'https://conf.researchr.org/home/icse-2026',
      venueCategory: 'Conference',
      submissionDeadline: utcDate(30),
      deadline: utcDate(14),
    });

  expect(res.status).toBe(201);
  expect(res.body.targetVenueUrl).toBe('https://conf.researchr.org/home/icse-2026');
  expect(res.body.deadline).toContain('T00:00:00.000Z');
  expect(res.body.submissionDeadline).toContain('T00:00:00.000Z');
  roundId = res.body.id;
});

test('draft submission and round deadlines can be edited with UTC date guards', async () => {
  const pastRoundDeadline = await request(app)
    .put(`/api/rounds/${roundId}/deadline`)
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ deadline: utcDate(-1) });
  expect(pastRoundDeadline.status).toBe(400);

  const submissionBeforeRound = await request(app)
    .put(`/api/rounds/${roundId}/details`)
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ submissionDeadline: utcDate(7) });
  expect(submissionBeforeRound.status).toBe(400);

  const submission = await request(app)
    .put(`/api/rounds/${roundId}/details`)
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ submissionDeadline: utcDate(45) });
  expect(submission.status).toBe(200);
  expect(submission.body.submissionDeadline).toContain('T00:00:00.000Z');

  const roundDeadline = await request(app)
    .put(`/api/rounds/${roundId}/deadline`)
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ deadline: utcDate(21) });
  expect(roundDeadline.status).toBe(200);
  expect(roundDeadline.body.deadline).toContain('T00:00:00.000Z');
});
