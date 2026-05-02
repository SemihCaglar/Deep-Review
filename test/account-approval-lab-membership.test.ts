import 'reflect-metadata';
import request from 'supertest';
import app from '../backend/src/app';
import { AppDataSource } from '../backend/src/data-source';
import { Coordinator } from '../backend/src/entities/Coordinator';
import { Lab } from '../backend/src/entities/Lab';
import { LabMember } from '../backend/src/entities/LabMember';
import { Paper, PaperStatus } from '../backend/src/entities/Paper';
import { Round, RoundStatus, VenueCategory } from '../backend/src/entities/Round';
import { ApprovalStatus } from '../backend/src/entities/User';
import { hashPassword } from '../backend/src/services/accountSecurity';

let coordinatorToken: string;
let approvedMemberToken: string;
let labId: string;
let otherLabId: string;
let roundId: string;
let approvedMemberId: string;

beforeAll(async () => {
  await AppDataSource.initialize();
  await AppDataSource.synchronize(true);

  const userRepo = AppDataSource.getRepository('User');
  const labRepo = AppDataSource.getRepository(Lab);
  const paperRepo = AppDataSource.getRepository(Paper);
  const roundRepo = AppDataSource.getRepository(Round);

  const coordinator = Object.assign(new Coordinator(), {
    name: 'Approval Coordinator',
    email: 'approval-coordinator@test.com',
    passwordHash: await hashPassword('pass'),
    approvalStatus: ApprovalStatus.Approved,
    approvalReviewedAt: new Date(),
    approvalNote: null,
    failedLogins: 0,
    failedLoginWindowStartedAt: null,
    lockedUntil: null,
    lastLoginAt: null,
  });
  await userRepo.save(coordinator);

  const otherCoordinator = Object.assign(new Coordinator(), {
    name: 'Other Coordinator',
    email: 'other-approval-coordinator@test.com',
    passwordHash: await hashPassword('pass'),
    approvalStatus: ApprovalStatus.Approved,
    approvalReviewedAt: new Date(),
    approvalNote: null,
    failedLogins: 0,
    failedLoginWindowStartedAt: null,
    lockedUntil: null,
    lastLoginAt: null,
  });
  await userRepo.save(otherCoordinator);

  const lab = labRepo.create({
    name: 'Approval Lab',
    description: 'Lab used for approval membership tests',
    coordinator,
    members: [coordinator],
  });
  await labRepo.save(lab);
  labId = lab.id;

  const otherLab = labRepo.create({
    name: 'Other Approval Lab',
    description: 'Lab used to verify coordinator scoping',
    coordinator: otherCoordinator,
    members: [otherCoordinator],
  });
  await labRepo.save(otherLab);
  otherLabId = otherLab.id;

  const otherLabMember = Object.assign(new LabMember(), {
    name: 'Other Lab Reviewer',
    email: 'other-lab-reviewer@test.com',
    passwordHash: await hashPassword('pass'),
    approvalStatus: ApprovalStatus.Approved,
    approvalReviewedAt: new Date(),
    approvalNote: null,
    failedLogins: 0,
    failedLoginWindowStartedAt: null,
    lockedUntil: null,
    lastLoginAt: null,
  });
  await userRepo.save(otherLabMember);
  otherLab.members = [...(otherLab.members ?? []), otherLabMember];
  await labRepo.save(otherLab);

  const paper = paperRepo.create({
    title: 'Approval Membership Paper',
    abstractText: 'A paper for reviewer suggestion tests.',
    overleafLink: 'https://www.overleaf.com/read/approvalmembership',
    creationTime: new Date(),
    status: PaperStatus.Draft,
    coordinators: [coordinator],
    labs: [lab],
    authors: [],
  });
  await paperRepo.save(paper);

  const round = roundRepo.create({
    paper,
    roundNumber: 1,
    status: RoundStatus.Draft,
    targetVenue: 'ICSE',
    targetVenueUrl: 'https://conf.researchr.org/',
    venueCategory: VenueCategory.Journal,
    deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    submissionDeadline: null,
    startedAt: null,
    completedAt: null,
  });
  await roundRepo.save(round);
  roundId = round.id;

  const login = await request(app)
    .post('/api/account/login')
    .send({ email: 'approval-coordinator@test.com', password: 'pass' });
  coordinatorToken = login.body.token;
});

afterAll(async () => {
  await AppDataSource.destroy();
});

test('approving a signup links the new member to the requested lab', async () => {
  const signup = await request(app)
    .post('/api/account/signup')
    .send({
      name: 'Approved Reviewer',
      email: 'approved-reviewer@test.com',
      password: 'pass',
      labId,
    });

  expect(signup.status).toBe(201);
  approvedMemberId = signup.body.user.id;

  const approval = await request(app)
    .post(`/api/account/approve/${approvedMemberId}`)
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({});

  expect(approval.status).toBe(200);
  expect(approval.body.user.labs).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: labId, name: 'Approval Lab' })]),
  );

  const login = await request(app)
    .post('/api/account/login')
    .send({ email: 'approved-reviewer@test.com', password: 'pass' });

  expect(login.status).toBe(200);
  approvedMemberToken = login.body.token;
  expect(login.body.user.labs).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: labId, name: 'Approval Lab' })]),
  );
});

test('profile update tolerates legacy null currentPosition without clearing existing value', async () => {
  const initialUpdate = await request(app)
    .put('/api/account/profile')
    .set('Authorization', `Bearer ${approvedMemberToken}`)
    .send({
      name: 'Approved Reviewer',
      email: 'approved-reviewer@test.com',
      currentPosition: 'Postdoctoral Researcher',
    });

  expect(initialUpdate.status).toBe(200);
  expect(initialUpdate.body.user.currentPosition).toBe('Postdoctoral Researcher');

  const legacyUpdate = await request(app)
    .put('/api/account/profile')
    .set('Authorization', `Bearer ${approvedMemberToken}`)
    .send({
      name: 'Approved Reviewer Updated',
      email: 'approved-reviewer@test.com',
      currentPosition: null,
    });

  expect(legacyUpdate.status).toBe(200);
  expect(legacyUpdate.body.user.name).toBe('Approved Reviewer Updated');
  expect(legacyUpdate.body.user.currentPosition).toBe('Postdoctoral Researcher');
});

test('lab member can request another lab and that lab coordinator can review it', async () => {
  const otherCoordinatorLogin = await request(app)
    .post('/api/account/login')
    .send({ email: 'other-approval-coordinator@test.com', password: 'pass' });

  expect(otherCoordinatorLogin.status).toBe(200);

  const requestJoin = await request(app)
    .post('/api/account/lab-join-requests')
    .set('Authorization', `Bearer ${approvedMemberToken}`)
    .send({ labId: otherLabId });

  expect(requestJoin.status).toBe(201);
  expect(requestJoin.body.membership.status).toBe('Pending');
  expect(requestJoin.body.membership.lab.id).toBe(otherLabId);

  const duplicateRequest = await request(app)
    .post('/api/account/lab-join-requests')
    .set('Authorization', `Bearer ${approvedMemberToken}`)
    .send({ labId: otherLabId });

  expect(duplicateRequest.status).toBe(409);

  const hiddenFromOriginalCoordinator = await request(app)
    .get('/api/account/pending-lab-join-requests')
    .set('Authorization', `Bearer ${coordinatorToken}`);

  expect(hiddenFromOriginalCoordinator.status).toBe(200);
  expect(hiddenFromOriginalCoordinator.body.requests).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: requestJoin.body.membership.id }),
    ]),
  );

  const pendingForOtherCoordinator = await request(app)
    .get('/api/account/pending-lab-join-requests')
    .set('Authorization', `Bearer ${otherCoordinatorLogin.body.token}`);

  expect(pendingForOtherCoordinator.status).toBe(200);
  expect(pendingForOtherCoordinator.body.requests).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: requestJoin.body.membership.id,
        status: 'Pending',
        lab: expect.objectContaining({ id: otherLabId }),
        user: expect.objectContaining({ id: approvedMemberId }),
      }),
    ]),
  );

  const approval = await request(app)
    .post(`/api/account/lab-join-requests/${requestJoin.body.membership.id}/approve`)
    .set('Authorization', `Bearer ${otherCoordinatorLogin.body.token}`)
    .send({});

  expect(approval.status).toBe(200);
  expect(approval.body.membership.status).toBe('Active');

  const myLabs = await request(app)
    .get('/api/account/my-labs')
    .set('Authorization', `Bearer ${approvedMemberToken}`);

  expect(myLabs.status).toBe(200);
  expect(myLabs.body.memberships).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ status: 'Active', lab: expect.objectContaining({ id: otherLabId }) }),
    ]),
  );
});

test('approved lab member appears in reviewer suggestions for that lab', async () => {
  const suggestions = await request(app)
    .get(`/api/rounds/${roundId}/suggest`)
    .set('Authorization', `Bearer ${coordinatorToken}`);

  expect(suggestions.status).toBe(200);
  expect(suggestions.body).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        user: expect.objectContaining({ id: approvedMemberId, email: 'approved-reviewer@test.com' }),
      }),
    ]),
  );
});

test('coordinator only sees and reviews signups from their own lab', async () => {
  const otherSignup = await request(app)
    .post('/api/account/signup')
    .send({
      name: 'Other Pending Reviewer',
      email: 'other-pending-reviewer@test.com',
      password: 'pass',
      labId: otherLabId,
    });

  expect(otherSignup.status).toBe(201);

  const pending = await request(app)
    .get('/api/account/pending-signups')
    .set('Authorization', `Bearer ${coordinatorToken}`);

  expect(pending.status).toBe(200);
  expect(pending.body.users).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: otherSignup.body.user.id }),
    ]),
  );

  const approval = await request(app)
    .post(`/api/account/approve/${otherSignup.body.user.id}`)
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({});

  expect(approval.status).toBe(403);
});

test('lab members endpoint is scoped to the current user lab', async () => {
  const members = await request(app)
    .get('/api/account/lab-members')
    .set('Authorization', `Bearer ${coordinatorToken}`);

  expect(members.status).toBe(200);
  expect(members.body.users).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: approvedMemberId, email: 'approved-reviewer@test.com' }),
    ]),
  );
  expect(members.body.users).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ email: 'other-lab-reviewer@test.com' }),
    ]),
  );
});
