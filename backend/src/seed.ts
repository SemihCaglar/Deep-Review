import 'reflect-metadata';
import { AppDataSource } from './data-source';
import { IsNull } from 'typeorm';
import { Coordinator } from './entities/Coordinator';
import { LocalAdmin } from './entities/LocalAdmin';
import { GlobalAdmin } from './entities/GlobalAdmin';
import { Topic } from './entities/Topic';
import { Lab } from './entities/Lab';
import { ApprovalStatus, User, UserRole } from './entities/User';
import { LabMember } from './entities/LabMember';
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

  await AppDataSource.initialize();

  if (reset) {
    await AppDataSource.synchronize(true);
    console.log('✅ DB Connected, Reset, and Ready for Seeding');
  } else {
    console.log('✅ DB Connected and Ready for Safe Seeding');
  }

  const userRepo = AppDataSource.getRepository<User>('User');
  const topicRepo = AppDataSource.getRepository(Topic);
  const labRepo = AppDataSource.getRepository(Lab);
  const policyRepo = AppDataSource.getRepository(SystemPolicy);
  const templateRepo = AppDataSource.getRepository(Template);

  // 1. Topics
  const allTopics = await ensureDefaultTopics(topicRepo);

  // 2. Admin User
  const admin = await ensureUser(userRepo, {
    create: () => {
      const u = new GlobalAdmin();
      u.email = 'admin@bilsen.app';
      u.name = 'Global Administrator';
      return u;
    },
    password: 'admin123',
  });

  // 3. Coordinator
  const coordinator = await ensureUser(userRepo, {
    create: () =>
      Object.assign(new Coordinator(), {
        name: 'Eray Tüzün',
        email: 'eraytuzun@cs.bilkent.edu.tr',
      }),
    password: '123',
  }) as Coordinator;

  // 4. Lab
  const lab = await ensureLab(labRepo, {
    name: 'CS319 Lab',
    description: 'Bilkent CS319 course project lab.',
    coordinator,
    members: [coordinator],
    topics: allTopics.slice(0, 5),
  });

  const localAdmin = await ensureUser(userRepo, {
    create: () => {
      const u = new LocalAdmin();
      u.email = 'localadmin@cs319.bilkent.edu.tr';
      u.name = 'CS319 Local Admin';
      return u;
    },
    password: '123',
  });
  (localAdmin as LocalAdmin).notificationEmails = ['coordinator@cs319.bilkent.edu.tr', 'office@cs319.bilkent.edu.tr'];
  (localAdmin as LocalAdmin).lab = lab;
  await userRepo.save(localAdmin);

  lab.localAdmin = localAdmin;
  await labRepo.save(lab);

  // 5. System Policies
  await ensureDefaultPolicies(policyRepo);

  // 6. Default Templates
  await ensureDefaultTemplates(templateRepo);

  console.log(`✅ successfully seeded database! admin.id='${admin.id}', lab.id='${lab.id}'`);
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
      where: { 
        key: item.key, 
        lab: IsNull() 
      } as any 
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
      where: { 
        name: item.name, 
        lab: IsNull() 
      } as any 
    });
    if (!existing) {
      await templateRepo.save(templateRepo.create({ ...item, lab: null }));
    }
  }
}

if (require.main === module) {
  runSeed().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}
