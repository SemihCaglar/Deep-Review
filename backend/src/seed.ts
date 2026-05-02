import 'reflect-metadata';
import { AppDataSource, normalizeLegacyPaperStatuses } from './data-source';
import { IsNull } from 'typeorm';
import { Coordinator } from './entities/Coordinator';
import { Admin } from './entities/GlobalAdmin';
import { Lab } from './entities/Lab';
import { LabMember } from './entities/LabMember';
import { LabMembership, LabMembershipStatus } from './entities/LabMembership';
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
  const membershipRepo = AppDataSource.getRepository(LabMembership);
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

  // 3a. Coordinator of Lab A
  const coordA = await ensureUser(userRepo, {
    create: () => Object.assign(new Coordinator(), {
      name: 'Esra Nur Tat',
      email: 'esranurtatoglu24@gmail.com',
    }),
    password: '123',
  }) as Coordinator;

  // 4a. Lab A — Bilkent AI Research Lab
  const labA = await ensureLab(labRepo, {
    name: 'Bilkent AI Research Lab',
    description: 'Focuses on machine learning, deep learning, and NLP research.',
    coordinator: coordA,
    topics: allTopics.slice(0, 5),
  });
  await ensureLabMembership(membershipRepo, labA, coordA);

  // 5a. Member of Lab A
  const memberA = await ensureUser(userRepo, {
    create: () => Object.assign(new LabMember(), {
      name: 'Adur Bilkom',
      email: 'bilkomadur@gmail.com',
    }),
    password: '123',
  }) as LabMember;

  await ensureLabMembership(membershipRepo, labA, memberA);

  // 3b. Coordinator of Lab B
  const coordB = await ensureUser(userRepo, {
    create: () => Object.assign(new Coordinator(), {
      name: 'Deniz Yılmaz',
      email: 'esranurtatoglu2198@gmail.com',
    }),
    password: '123',
  }) as Coordinator;

  // 4b. Lab B — Bilkent Systems Lab
  const labB = await ensureLab(labRepo, {
    name: 'Bilkent Systems Lab',
    description: 'Focuses on distributed systems, databases, and software engineering.',
    coordinator: coordB,
    topics: allTopics.slice(5, 10),
  });
  await ensureLabMembership(membershipRepo, labB, coordB);

  // 5b. Member of Lab B
  const memberB = await ensureUser(userRepo, {
    create: () => Object.assign(new LabMember(), {
      name: 'Selin Arslan',
      email: 'esranurtat2025@gmail.com',
    }),
    password: '123',
  }) as LabMember;

  await ensureLabMembership(membershipRepo, labB, memberB);

  // 6. System Policies & Templates
  await ensureDefaultPolicies(policyRepo);
  await ensureDefaultTemplates(templateRepo);

  // 7. Demo paper under Lab A
  let paper = await paperRepo.findOne({
    where: { title: 'Attention Mechanisms in Transformer Models' },
    relations: ['coordinators', 'labs', 'authors'],
  });
  if (!paper) {
    paper = paperRepo.create({
      title: 'Attention Mechanisms in Transformer Models',
      abstractText: 'A comprehensive study of attention mechanisms and their role in modern transformer architectures.',
      creationTime: new Date(),
      status: PaperStatus.InReview,
      coordinators: [{ id: coordA.id } as Coordinator],
      labs: [{ id: labA.id } as Lab],
      authors: [{ id: memberA.id } as LabMember],
      overleafLink: 'https://www.overleaf.com/project/attention-mechanisms-demo',
    });
    await paperRepo.save(paper);
    console.log('✅ Demo paper created');
  }

  // 8. Round for demo paper
  let round = await roundRepo.findOne({ where: { paper: { id: paper.id } as any, roundNumber: 1 } });
  if (!round) {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 14);
    round = roundRepo.create({
      paper: { id: paper.id } as Paper,
      roundNumber: 1,
      deadline,
      status: RoundStatus.Open,
      targetVenue: 'NeurIPS 2026',
      venueCategory: VenueCategory.Conference,
      submissionDeadline: new Date(deadline.getTime() + 7 * 24 * 60 * 60 * 1000),
    });
    await roundRepo.save(round);
    console.log('✅ Round created');
  }

  // 9. Assign memberB as reviewer for the demo paper round
  const existingAssignment = await assignRepo.findOne({
    where: { round: { id: round.id } as any, reviewer: { id: memberB.id } as any },
  });
  if (!existingAssignment) {
    const assignment = assignRepo.create({
      round: { id: round.id } as Round,
      reviewer: { id: memberB.id } as LabMember,
      status: AssignmentStatus.Invited,
      deadline: round.deadline,
    });
    await assignRepo.save(assignment);
    console.log('✅ Review assignment created for Selin Arslan');
  }

  console.log('\n🌱 Seed complete!');
  console.log('   Admin       — email: admin@bilsen.app                  password: admin123');
  console.log('   Coordinator — email: esranurtatoglu24@gmail.com        password: 123  (Lab A: Bilkent AI Research Lab)');
  console.log('   Member      — email: bilkomadur@gmail.com              password: 123  (Lab A)');
  console.log('   Coordinator — email: esranurtatoglu2198@gmail.com      password: 123  (Lab B: Bilkent Systems Lab)');
  console.log('   Member      — email: esranurtat2025@gmail.com          password: 123  (Lab B)');
  console.log(`   Round ID    — ${round.id}`);
  await AppDataSource.destroy();
}

async function ensureLabMembership(
  membershipRepo: ReturnType<typeof AppDataSource.getRepository<LabMembership>>,
  lab: Lab,
  member: User,
) {
  const existing = await membershipRepo.findOne({ where: { labId: lab.id, userId: member.id } });
  if (existing) return;

  await membershipRepo.save(membershipRepo.create({
    lab,
    labId: lab.id,
    user: member,
    userId: member.id,
    status: LabMembershipStatus.Active,
    statusChangedAt: new Date(),
  }));
  console.log(`✅ ${member.name} added to lab`);
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
    topics: Topic[];
  },
): Promise<Lab> {
  let lab = await labRepo.findOne({ where: { name: options.name }, relations: ['coordinator', 'topics'] });
  if (!lab) {
    lab = labRepo.create({
      name: options.name,
      description: options.description,
      coordinator: options.coordinator,
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
