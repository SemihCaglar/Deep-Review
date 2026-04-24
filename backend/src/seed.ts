import 'reflect-metadata';
import { AppDataSource } from './data-source';
import { Coordinator } from './entities/Coordinator';
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

  await ensureDefaultTopics(topicRepo);

  const coordinator = await ensureUser(userRepo, {
    create: () =>
      Object.assign(new Coordinator(), {
        name: 'Eray Tüzün',
        email: 'eraytuzun@cs.bilkent.edu.tr',
      }),
    password: '123',
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

if (require.main === module) {
  runSeed().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}
