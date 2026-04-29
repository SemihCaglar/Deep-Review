import 'reflect-metadata';
import { AppDataSource } from './data-source';
import { IsNull } from 'typeorm';
import { Coordinator } from './entities/Coordinator';
import { LocalAdmin } from './entities/LocalAdmin';
import { GlobalAdmin } from './entities/GlobalAdmin';
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

  // 2. Global Admin
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
    create: () => Object.assign(new Coordinator(), {
      name: 'Eray Tüzün',
      email: 'eraytuzun@cs.bilkent.edu.tr',
    }),
    password: '123',
  }) as Coordinator;

  // 4. Lab (BILSEN/CS319 Combined)
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

  // 5. System Policies & Templates
  await ensureDefaultPolicies(policyRepo);
  await ensureDefaultTemplates(templateRepo);

  // 6. Reviewer 1 (LabMember) — email receives the test invitation
  const reviewer = await ensureUser(userRepo, {
    create: () => Object.assign(new LabMember(), {
      name: 'Test Reviewer',
      email: 'bilkentcs319@gmail.com',
    }),
    password: '123',
  }) as LabMember;
  // Reviewer 2 (LabMember) — fresh reviewer for invitation testing
  const reviewer2 = await ensureUser(userRepo, {
    create: () => Object.assign(new LabMember(), {
      name: 'Second Reviewer',
      email: 'esranurtatoglu24@gmail.com',
    }),
    password: '123',
  });

  // Add both reviewers to lab if not already members
  const labWithMembers = await labRepo.findOne({ where: { id: lab.id }, relations: ['members'] });
  if (labWithMembers) {
    let changed = false;
    if (!labWithMembers.members.find(m => m.id === reviewer.id)) {
      labWithMembers.members.push(reviewer);
      changed = true;
    }
    if (!labWithMembers.members.find(m => m.id === reviewer2.id)) {
      labWithMembers.members.push(reviewer2);
      changed = true;
    }
    if (changed) {
      await labRepo.save(labWithMembers);
      console.log('✅ Reviewer(s) added to lab');
    }
  }

  // Paper
  let paper = await paperRepo.findOne({ where: { title: 'Test Paper for Review' }, relations: ['coordinators', 'labs', 'authors'] });
  if (!paper) {
    paper = paperRepo.create({
      title: 'Test Paper for Review',
      abstractText: 'This is a test paper for development purposes.',
      creationTime: new Date(),
      status: PaperStatus.HumanReview,
      coordinators: [coordinator],
      labs: [lab],
      authors: [],
    });

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
      targetVenue: 'ICSE 2026',
      venueCategory: VenueCategory.Conference,
      submissionDeadline: new Date(deadline.getTime() + 7 * 24 * 60 * 60 * 1000),
    });
    await roundRepo.save(round);
    console.log('✅ Round created');
  }

  // Assignment for reviewer 1 (Invited)
  const existingAssignment = await assignRepo.findOne({ where: { round: { id: round.id }, reviewer: { id: reviewer.id } } });
  if (!existingAssignment) {
    const assignment = assignRepo.create({
      round,
      reviewer,
      status: AssignmentStatus.Invited,
      deadline: round.deadline,
    });
    await assignRepo.save(assignment);
    console.log('✅ Assignment 1 created (Invited)');
  }

  // Reviewer 2 has no pre-created assignment — coordinator assigns via the UI which also sends the invitation email

  console.log(`\n🌱 Seed complete!`);
  console.log(`   Coordinator — email: eraytuzun@cs.bilkent.edu.tr  password: 123`);
  console.log(`   Reviewer 1  — email: bilkentcs319@gmail.com        password: 123`);
  console.log(`   Reviewer 2  — email: esranurtatoglu24@gmail.com    password: 123`);
  console.log(`   Round ID    — ${round.id}`);
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
  const reset = process.argv.includes('--reset');
  runSeed({ reset }).catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}
