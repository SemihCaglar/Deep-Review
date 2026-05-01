import 'reflect-metadata';
import request from 'supertest';
import app from '../backend/src/app';
import { AppDataSource } from '../backend/src/data-source';
import { Coordinator } from '../backend/src/entities/Coordinator';
import { LabMember } from '../backend/src/entities/LabMember';
import { Paper, PaperStatus } from '../backend/src/entities/Paper';
import { Round, RoundStatus, VenueCategory } from '../backend/src/entities/Round';
import { ApprovalStatus } from '../backend/src/entities/User';
import { hashPassword } from '../backend/src/services/accountSecurity';

let coordToken: string;
let authorToken: string;
let coord: Coordinator;
let author: LabMember;

const future = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
};

const api = (token?: string) => {
  const r = request(app);
  return {
    post: (p: string, b: object) => r.post(p).set('Authorization', token ? `Bearer ${token}` : '').send(b),
    put: (p: string, b: object) => r.put(p).set('Authorization', token ? `Bearer ${token}` : '').send(b),
  };
};

async function makePaper(status = PaperStatus.Draft) {
  const paperRepo = AppDataSource.getRepository(Paper);
  const paper = paperRepo.create({
    title: `Archive Rule ${Date.now()}`,
    abstractText: 'Archive rule test',
    overleafLink: 'https://overleaf.com/archive-rule',

    creationTime: new Date(),
    status,
    authors: [author],
    coordinators: [coord],
  });
  return paperRepo.save(paper);
}

beforeAll(async () => {
  await AppDataSource.initialize();
  await AppDataSource.synchronize(true);

  const userRepo = AppDataSource.getRepository('User');
  const pw = await hashPassword('pass');
  coord = Object.assign(new Coordinator(), {
    name: 'Archive Coord',
    email: 'archive_coord@test.local',
    passwordHash: pw,
    approvalStatus: ApprovalStatus.Approved,
    approvalReviewedAt: new Date(),
  });
  author = Object.assign(new LabMember(), {
    name: 'Archive Author',
    email: 'archive_author@test.local',
    passwordHash: pw,
    approvalStatus: ApprovalStatus.Approved,
    approvalReviewedAt: new Date(),
  });
  await userRepo.save([coord, author]);

  coordToken = (await api().post('/api/account/login', { email: coord.email, password: 'pass' })).body.token;
  authorToken = (await api().post('/api/account/login', { email: author.email, password: 'pass' })).body.token;
});

afterAll(async () => {
  await AppDataSource.destroy();
});

test('author can unarchive an archived paper', async () => {
  const paper = await makePaper(PaperStatus.Archived);
  const res = await api(authorToken).put(`/api/papers/${paper.id}/status`, { status: PaperStatus.Draft });

  expect(res.status).toBe(200);
  expect(res.body.status).toBe(PaperStatus.Draft);
});

test('paper cannot be archived before a future submission deadline', async () => {
  const paper = await makePaper(PaperStatus.Draft);
  const roundRepo = AppDataSource.getRepository(Round);
  await roundRepo.save(roundRepo.create({
    paper,
    roundNumber: 1,
    status: RoundStatus.Completed,
    targetVenue: 'FutureConf',
    venueCategory: VenueCategory.Conference,
    submissionDeadline: future(10),
    deadline: future(-1),
    startedAt: future(-2),
    completedAt: future(-1),
  }));

  const res = await api(coordToken).put(`/api/papers/${paper.id}/status`, { status: PaperStatus.Archived });

  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/submission deadline/i);
});

test('paper cannot be archived during human or AI review', async () => {
  const paperRepo = AppDataSource.getRepository(Paper);
  const paper = await makePaper(PaperStatus.HumanReview);

  const human = await api(coordToken).put(`/api/papers/${paper.id}/status`, { status: PaperStatus.Archived });
  expect(human.status).toBe(400);
  expect(human.body.message).toMatch(/review/i);

  await paperRepo.update(paper.id, { status: PaperStatus.AIReview });
  const ai = await api(coordToken).put(`/api/papers/${paper.id}/status`, { status: PaperStatus.Archived });
  expect(ai.status).toBe(400);
  expect(ai.body.message).toMatch(/review/i);
});
