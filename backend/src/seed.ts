import 'reflect-metadata';
import { AppDataSource } from './data-source';
import { Coordinator } from './entities/Coordinator';
import { Lab } from './entities/Lab';
import { LabMember } from './entities/LabMember';
import { Paper, PaperStatus } from './entities/Paper';
import { Round, RoundStatus } from './entities/Round';
import { Assignment, AssignmentStatus } from './entities/Assignment';
import { Topic } from './entities/Topic';
import { ApprovalStatus, User } from './entities/User';
import { hashPassword } from './services/accountSecurity';

const DEFAULT_TOPIC_NAMES = [
  'Machine Learning',
  'Deep Learning',
  'Natural Language Processing',
  'Computer Vision',
  'Data Mining',
  'Software Engineering',
  'Human-Computer Interaction',
  'Distributed Systems',
  'Security',
  'Databases',
  'Other',
];

export async function runSeed(options: { reset?: boolean } = {}) {
  const { reset = false } = options;

  await AppDataSource.initialize();

  if (reset) {
    await AppDataSource.synchronize(true);
    console.log('✅ DB Reset and Ready for Seeding');
  } else {
    console.log('✅ DB Connected and Ready for Safe Seeding');
  }

  const userRepo = AppDataSource.getRepository<User>('User');
  const topicRepo = AppDataSource.getRepository(Topic);
  const labRepo = AppDataSource.getRepository(Lab);
  const paperRepo = AppDataSource.getRepository(Paper);
  const roundRepo = AppDataSource.getRepository(Round);
  const assignRepo = AppDataSource.getRepository(Assignment);

  await ensureDefaultTopics(topicRepo);

  // Coordinator
  const coordinator = await ensureUser(userRepo, {
    create: () => Object.assign(new Coordinator(), {
      name: 'Eray Tüzün',
      email: 'eraytuzun@cs.bilkent.edu.tr',
    }),
    password: '123',
  }) as Coordinator;

  // Lab
  let lab = await labRepo.findOne({ where: { name: 'BILSEN Lab' }, relations: ['coordinator', 'members'] });
  if (!lab) {
    lab = labRepo.create({ name: 'BILSEN Lab', description: 'Test lab for development' });
    lab.coordinator = coordinator;
    lab.members = [coordinator];
    await labRepo.save(lab);
    console.log('✅ Lab created');
  }

  // Reviewer (LabMember) — email receives the test invitation
  const reviewer = await ensureUser(userRepo, {
    create: () => Object.assign(new LabMember(), {
      name: 'Test Reviewer',
      email: 'bilkentcs319@gmail.com',
    }),
    password: '123',
  });

  // Add reviewer to lab if not already a member
  const labWithMembers = await labRepo.findOne({ where: { id: lab.id }, relations: ['members'] });
  if (labWithMembers && !labWithMembers.members.find(m => m.id === reviewer.id)) {
    labWithMembers.members.push(reviewer);
    await labRepo.save(labWithMembers);
    console.log('✅ Reviewer added to lab');
  }

  // Paper
  let paper = await paperRepo.findOne({ where: { title: 'Test Paper for Review' }, relations: ['coordinators', 'labs', 'authors'] });
  if (!paper) {
    paper = paperRepo.create({
      title: 'Test Paper for Review',
      abstractText: 'This is a test paper for development purposes.',
      creationTime: new Date(),
      targetVenue: 'ICSE 2026',
      status: PaperStatus.HumanReview,
    });
    await paperRepo.save(p1);

    const p2 = Object.assign(new Paper(), {
        title: 'React Next.js Component Scaling',
        abstractText: 'A comprehensive review of monorepos.',
        creationTime: new Date(),
        targetVenue: 'Frontend Conf 2026',
        status: PaperStatus.Draft,
        coordinator: user1,
    paper.coordinators = [coordinator];
    paper.labs = [lab];
    paper.authors = [];
    await paperRepo.save(paper);
    console.log('✅ Paper created');
  }

  // Round
  let round = await roundRepo.findOne({ where: { paper: { id: paper.id }, roundNumber: 1 } });
  if (!round) {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 14);
    round = roundRepo.create({
      paper,
      roundNumber: 1,
      deadline,
      status: RoundStatus.Open,
    });
    await roundRepo.save(round);
    console.log('✅ Round created');
  }

  // Assignment (Invited)
  const existingAssignment = await assignRepo.findOne({ where: { round: { id: round.id }, reviewer: { id: reviewer.id } } });
  if (!existingAssignment) {
    const assignment = assignRepo.create({
      round,
      reviewer,
      status: AssignmentStatus.Invited,
      deadline: round.deadline,
    });
    await assignRepo.save(assignment);
    console.log('✅ Assignment created (Invited)');
  }

  console.log(`\n🌱 Seed complete!`);
  console.log(`   Coordinator — email: eraytuzun@cs.bilkent.edu.tr  password: 123`);
  console.log(`   Reviewer    — email: bilkentcs319@gmail.com        password: 123`);
  console.log(`   Round ID    — ${round.id}`);

  await AppDataSource.destroy();
}

async function ensureDefaultTopics(topicRepo: ReturnType<typeof AppDataSource.getRepository<Topic>>) {
  for (const topicName of DEFAULT_TOPIC_NAMES) {
    const existing = await topicRepo.findOne({ where: { name: topicName } });
    if (!existing) {
      await topicRepo.save(topicRepo.create({ name: topicName }));
    }
  }
}

async function ensureUser(
  userRepo: ReturnType<typeof AppDataSource.getRepository<User>>,
  options: { create: () => User; password: string },
): Promise<User> {
  const draft = options.create();
  const email = draft.email.trim().toLowerCase();
  const existing = await userRepo.findOne({ where: { email } });
  if (existing) return existing;

  draft.email = email;
  draft.passwordHash = await hashPassword(options.password);
  draft.approvalStatus = ApprovalStatus.Approved;
  draft.approvalReviewedAt = new Date();
  draft.approvalNote = null;
  draft.failedLogins = 0;
  draft.failedLoginWindowStartedAt = null;
  draft.lockedUntil = null;
  draft.lastLoginAt = null;
  return userRepo.save(draft);
}

if (require.main === module) {
  runSeed().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}
