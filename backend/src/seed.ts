import 'reflect-metadata';
import { AppDataSource, normalizeLegacyPaperStatuses } from './data-source';
import { IsNull } from 'typeorm';
import { Coordinator } from './entities/Coordinator';
import { Admin } from './entities/GlobalAdmin';
import { Lab } from './entities/Lab';
import { LabMember } from './entities/LabMember';
import { Paper, PaperStatus } from './entities/Paper';
import { Round, RoundStatus, VenueCategory } from './entities/Round';
import { Assignment, AssignmentStatus } from './entities/Assignment';
import { Topic } from './entities/Topic';
import { ApprovalStatus, User, UserRole } from './entities/User';
import { SystemPolicy, PolicyKey } from './entities/SystemPolicy';
import { Template, TemplateName } from './entities/Template';
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

  if (!reset) {
    await normalizeLegacyPaperStatuses();
  }

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
  const policyRepo = AppDataSource.getRepository(SystemPolicy);
  const templateRepo = AppDataSource.getRepository(Template);
  const paperRepo = AppDataSource.getRepository(Paper);
  const roundRepo = AppDataSource.getRepository(Round);
  const assignRepo = AppDataSource.getRepository(Assignment);

  // 1. Topics
  const allTopics = await ensureDefaultTopics(topicRepo);

  // 2. Admin
  await ensureUser(userRepo, {
    create: () => Object.assign(new Admin(), {
      name: 'Global Administrator',
      email: 'admin@bilsen.app',
    }),
    password: 'admin123',
  });

  // 6. System Policies & Templates
  await ensureDefaultPolicies(policyRepo);
  await ensureDefaultTemplates(templateRepo);


  console.log('\n🌱 Seed complete!');
  console.log('   Admin       — email: admin@bilsen.app                  password: admin123');
  await AppDataSource.destroy();
}


async function ensureDefaultTopics(topicRepo: ReturnType<typeof AppDataSource.getRepository<Topic>>) {
  const topics: Topic[] = [];
  for (const topicName of DEFAULT_TOPIC_NAMES) {
    let topic = await topicRepo.findOne({ where: { name: topicName } });
    if (!topic) {
      topic = await topicRepo.save(topicRepo.create({ name: topicName }));
    }
    topics.push(topic);
  }
  return topics;
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

async function ensureLab(
  labRepo: ReturnType<typeof AppDataSource.getRepository<Lab>>,
  options: {
    name: string;
    description: string;
    coordinator: Coordinator;
    members: User[];
    topics: Topic[];
  },
): Promise<Lab> {
  let lab = await labRepo.findOne({ where: { name: options.name }, relations: ['coordinator', 'topics', 'members'] });
  if (!lab) {
    lab = labRepo.create({
      name: options.name,
      description: options.description,
      coordinator: options.coordinator,
      members: options.members,
      topics: options.topics,
    });
    await labRepo.save(lab);
    console.log(`✅ Lab "${options.name}" created`);
  }
  return lab;
}

async function ensureDefaultPolicies(policyRepo: ReturnType<typeof AppDataSource.getRepository<SystemPolicy>>) {
  const defaults = [
    { key: PolicyKey.MAX_FAILED_LOGINS, value: '5' },
    { key: PolicyKey.ACCOUNT_LOCK_MINS, value: '15' },
    { key: PolicyKey.PASSWORD_RESET_TOKEN_EXP_MINS, value: '60' },
  ];

  for (const item of defaults) {
    const existing = await policyRepo.findOne({
      where: { key: item.key, lab: IsNull() } as any,
    });
    if (!existing) {
      await policyRepo.save(policyRepo.create({ key: item.key, value: item.value, lab: null }));
    }
  }
}

async function ensureDefaultTemplates(templateRepo: ReturnType<typeof AppDataSource.getRepository<Template>>) {
  const defaults = [
    {
      name: TemplateName.REVIEW_INVITATION,
      subject: 'Review Invitation: {{paperTitle}}',
      body: 'Dear {{userName}}, you are invited to review "{{paperTitle}}".',
    },
    {
      name: TemplateName.ACCOUNT_APPROVED,
      subject: 'Account Approved',
      body: 'Hello {{userName}}, your account has been approved.',
    },
  ];

  for (const item of defaults) {
    const existing = await templateRepo.findOne({
      where: { name: item.name, lab: IsNull() } as any,
    });
    if (!existing) {
      await templateRepo.save(templateRepo.create({ ...item, lab: null }));
    }
  }
}

if (require.main === module) {
  const reset = process.argv.includes('--reset');
  runSeed({ reset }).catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}