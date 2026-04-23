import 'reflect-metadata';
import { AppDataSource } from './data-source';
import { Assignment, AssignmentStatus } from './entities/Assignment';
import { Coordinator } from './entities/Coordinator';
import { LabMember } from './entities/LabMember';
import { Paper, PaperStatus } from './entities/Paper';
import { Round, RoundStatus } from './entities/Round';
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
    console.log('✅ DB Connected, Reset, and Ready for Seeding');
  } else {
    console.log('✅ DB Connected and Ready for Safe Seeding');
  }

  const userRepo = AppDataSource.getRepository<User>('User');
  const topicRepo = AppDataSource.getRepository(Topic);
  const paperRepo = AppDataSource.getRepository(Paper);
  const roundRepo = AppDataSource.getRepository(Round);
  const assignRepo = AppDataSource.getRepository(Assignment);

  await ensureDefaultTopics(topicRepo);

  const coordinator = await ensureUser(userRepo, {
    create: () =>
      Object.assign(new Coordinator(), {
        name: 'Semih User',
        email: 'semih@builder.app',
      }),
    password: '123',
  });

  const member = await ensureUser(userRepo, {
    create: () =>
      Object.assign(new LabMember(), {
        name: 'Emily Chen',
        email: 'emily@builder.app',
      }),
    password: '123',
  });

  const paper1 = await ensurePaper(paperRepo, {
    title: 'Deep Learning for BILSEN Automation',
    targetVenue: 'CS319 Symposium',
    abstractText: 'Exploring autonomous LLMs for paper review grading.',
    status: PaperStatus.HumanReview,
    coordinator,
  });

  const paper2 = await ensurePaper(paperRepo, {
    title: 'React Next.js Component Scaling',
    targetVenue: 'Frontend Conf 2026',
    abstractText: 'A comprehensive review of monorepos.',
    status: PaperStatus.Registered,
    coordinator,
  });

  await ensurePaperAuthors(userRepo, coordinator.id, [paper1, paper2]);
  await ensurePaperAuthors(userRepo, member.id, [paper2]);

  const round1 = await ensureRound(roundRepo, {
    paper: paper1,
    roundNumber: 1,
    deadlineDaysFromNow: 30,
    status: RoundStatus.Open,
  });

  const round2 = await ensureRound(roundRepo, {
    paper: paper2,
    roundNumber: 1,
    deadlineDaysFromNow: 14,
    status: RoundStatus.Open,
  });

  await ensureAssignment(assignRepo, {
    round: round1,
    reviewer: coordinator,
    status: AssignmentStatus.Invited,
    declineReason: null,
    acceptedAt: null,
  });

  await ensureAssignment(assignRepo, {
    round: round1,
    reviewer: member,
    status: AssignmentStatus.Accepted,
    declineReason: null,
    acceptedAt: new Date(),
  });

  await ensureAssignment(assignRepo, {
    round: round2,
    reviewer: coordinator,
    status: AssignmentStatus.Declined,
    declineReason: 'Conflict of interest.',
    acceptedAt: null,
  });

  console.log(`✅ successfully seeded database! user.id='${coordinator.id}'`);
  await AppDataSource.destroy();
}

async function ensureDefaultTopics(topicRepo: ReturnType<typeof AppDataSource.getRepository<Topic>>) {
  for (const topicName of DEFAULT_TOPIC_NAMES) {
    const existingTopic = await topicRepo.findOne({ where: { name: topicName } });

    if (!existingTopic) {
      await topicRepo.save(topicRepo.create({ name: topicName }));
    }
  }
}

async function ensureUser(
  userRepo: ReturnType<typeof AppDataSource.getRepository<User>>,
  options: {
    create: () => User;
    password: string;
  },
): Promise<User> {
  const draftUser = options.create();
  const normalizedEmail = draftUser.email.trim().toLowerCase();
  const existingUser = await userRepo.findOne({ where: { email: normalizedEmail } });

  if (existingUser) {
    return existingUser;
  }

  draftUser.email = normalizedEmail;
  draftUser.passwordHash = await hashPassword(options.password);
  draftUser.approvalStatus = ApprovalStatus.Approved;
  draftUser.approvalReviewedAt = new Date();
  draftUser.approvalNote = null;
  draftUser.failedLogins = 0;
  draftUser.failedLoginWindowStartedAt = null;
  draftUser.lockedUntil = null;
  draftUser.lastLoginAt = null;

  return userRepo.save(draftUser);
}

async function ensurePaper(
  paperRepo: ReturnType<typeof AppDataSource.getRepository<Paper>>,
  options: {
    title: string;
    targetVenue: string;
    abstractText: string;
    status: PaperStatus;
    coordinator: User;
  },
): Promise<Paper> {
  const existingPaper = await paperRepo.findOne({
    where: {
      title: options.title,
      targetVenue: options.targetVenue,
    },
  });

  if (existingPaper) {
    return existingPaper;
  }

  return paperRepo.save(
    paperRepo.create({
      title: options.title,
      targetVenue: options.targetVenue,
      abstractText: options.abstractText,
      creationTime: new Date(),
      status: options.status,
      coordinator: options.coordinator,
    }),
  );
}

async function ensurePaperAuthors(
  userRepo: ReturnType<typeof AppDataSource.getRepository<User>>,
  userId: string,
  papersToAdd: Paper[],
) {
  const user = await userRepo.findOne({
    where: { id: userId },
    relations: ['writtenPapers'],
  });

  if (!user) {
    return;
  }

  const existingPaperIds = new Set((user.writtenPapers ?? []).map(paper => paper.id));
  const nextWrittenPapers = [...(user.writtenPapers ?? [])];

  for (const paper of papersToAdd) {
    if (!existingPaperIds.has(paper.id)) {
      nextWrittenPapers.push(paper);
      existingPaperIds.add(paper.id);
    }
  }

  user.writtenPapers = nextWrittenPapers;
  await userRepo.save(user);
}

async function ensureRound(
  roundRepo: ReturnType<typeof AppDataSource.getRepository<Round>>,
  options: {
    paper: Paper;
    roundNumber: number;
    deadlineDaysFromNow: number;
    status: RoundStatus;
  },
): Promise<Round> {
  const matchingRound = await roundRepo
    .createQueryBuilder('round')
    .leftJoin('round.paper', 'paper')
    .where('round.roundNumber = :roundNumber', { roundNumber: options.roundNumber })
    .andWhere('paper.id = :paperId', { paperId: options.paper.id })
    .getOne();

  if (matchingRound) {
    return matchingRound;
  }

  return roundRepo.save(
    roundRepo.create({
      paper: options.paper,
      roundNumber: options.roundNumber,
      deadline: new Date(Date.now() + options.deadlineDaysFromNow * 24 * 60 * 60 * 1000),
      status: options.status,
      startedAt: new Date(),
    }),
  );
}

async function ensureAssignment(
  assignRepo: ReturnType<typeof AppDataSource.getRepository<Assignment>>,
  options: {
    round: Round;
    reviewer: User;
    status: AssignmentStatus;
    acceptedAt: Date | null;
    declineReason: string | null;
  },
): Promise<Assignment> {
  const matchingAssignment = await assignRepo
    .createQueryBuilder('assignment')
    .leftJoin('assignment.round', 'round')
    .leftJoin('assignment.reviewer', 'reviewer')
    .where('round.id = :roundId', { roundId: options.round.id })
    .andWhere('reviewer.id = :reviewerId', { reviewerId: options.reviewer.id })
    .getOne();

  if (matchingAssignment) {
    return matchingAssignment;
  }

  return assignRepo.save(
    assignRepo.create({
      round: options.round,
      reviewer: options.reviewer,
      status: options.status,
      invitedAt: new Date(),
      acceptedAt: options.acceptedAt,
      declineReason: options.declineReason,
    }),
  );
}

if (require.main === module) {
  runSeed().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}
