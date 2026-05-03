import 'reflect-metadata';
import { AppDataSource } from './data-source';
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
    members: [coordA],
    topics: allTopics.slice(0, 5),
  });

  // 5a. Member of Lab A
  const memberA = await ensureUser(userRepo, {
    create: () => Object.assign(new LabMember(), {
      name: 'Adur Bilkom',
      email: 'bilkomadur@gmail.com',
    }),
    password: '123',
  }) as LabMember;

  await addMemberToLab(labRepo, labA.id, memberA);

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
    members: [coordB],
    topics: allTopics.slice(5, 10),
  });

  // 5b. Member of Lab B
  const memberB = await ensureUser(userRepo, {
    create: () => Object.assign(new LabMember(), {
      name: 'Selin Arslan',
      email: 'esranurtat2025@gmail.com',
    }),
    password: '123',
  }) as LabMember;

  await addMemberToLab(labRepo, labB.id, memberB);

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

async function addMemberToLab(labRepo: ReturnType<typeof AppDataSource.getRepository<Lab>>, labId: string, member: User) {
  const lab = await labRepo.findOne({ where: { id: labId }, relations: ['members'] });
  if (lab && !lab.members.find(m => m.id === member.id)) {
    lab.members.push(member);
    await labRepo.save(lab);
    console.log(`✅ ${member.name} added to lab`);
  }
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
      subject: 'You have been invited to review a paper',
      body: 'Hello {{userName}},\n\nYou have been invited to review the paper "{{paperTitle}}" (Round {{roundNumber}}).\n\nPlease log in to accept or decline.\n\nDeadline: {{deadline}}',
    },
    {
      name: TemplateName.REVIEW_REMINDER,
      subject: 'Reminder: Review pending for "{{paperTitle}}"',
      body: 'Hello {{userName}},\n\nThis is a reminder that your review for paper "{{paperTitle}}" (Round {{roundNumber}}) is pending.\n\nDeadline: {{deadline}}\n\nPlease log in and submit your review.',
    },
    {
      name: TemplateName.DEADLINE_REMINDER,
      subject: 'Reminder: Review due tomorrow for "{{paperTitle}}"',
      body: 'Hello {{userName}},\n\nThis is a reminder that your review for paper "{{paperTitle}}" is due on {{deadline}}.\n\nPlease log in and submit your review before the deadline.',
    },
    {
      name: TemplateName.REVIEW_OVERDUE,
      subject: 'Your review for "{{paperTitle}}" is now Overdue',
      body: 'Hello {{userName}},\n\nYour review assignment for paper "{{paperTitle}}" (Round {{roundNumber}}) has passed its deadline and is now marked as Overdue.\n\nDeadline was: {{deadline}}\n\nPlease contact the coordinator if you need assistance.',
    },
    {
      name: TemplateName.REVIEW_OVERDUE_COORDINATOR,
      subject: 'Overdue Review Alert: {{paperTitle}}',
      body: 'Hello {{coordinatorName}},\n\nReviewer {{reviewerName}} ({{reviewerEmail}}) has missed their review deadline for paper "{{paperTitle}}" (Round {{roundNumber}}).\n\nDeadline was: {{deadline}}\n\nPlease consider reassigning or taking action.',
    },
    {
      name: TemplateName.DECLINE_REQUEST,
      subject: 'Decline Request from {{reviewerName}}',
      body: 'Hello {{coordinatorName}},\n\n{{reviewerName}} has submitted a decline request for paper "{{paperTitle}}" (Round {{roundNumber}}).\n\nReason: "{{reason}}"\n\nPlease log in to approve or reject the request.',
    },
    {
      name: TemplateName.EXTENSION_REQUEST,
      subject: 'Extension Request from {{reviewerName}}',
      body: 'Hello {{coordinatorName}},\n\n{{reviewerName}} has submitted a new deadline extension request.\n\nPaper: {{paperTitle}}\nRound: {{roundNumber}}\nCurrent deadline: {{currentDeadline}}\nRequested deadline: {{requestedDeadline}}\nReason: {{reason}}\n\nPlease log in to approve or reject this request.',
    },
    {
      name: TemplateName.DECLINE_APPROVED,
      subject: 'Your decline request has been approved',
      body: 'Hello {{userName}},\n\nYour request to decline the review assignment has been approved.',
    },
    {
      name: TemplateName.DECLINE_REJECTED,
      subject: 'Your decline request was not approved',
      body: 'Hello {{userName}},\n\nYour request to decline the review assignment was not approved. Please log in to check the details.',
    },
    {
      name: TemplateName.EXTENSION_APPROVED,
      subject: 'Your extension request has been approved',
      body: 'Hello {{userName}},\n\nYour deadline extension request has been approved. Your new deadline is: {{newDeadline}}',
    },
    {
      name: TemplateName.EXTENSION_REJECTED,
      subject: 'Your extension request was not approved',
      body: 'Hello {{userName}},\n\nYour deadline extension request was not approved. Please log in to check the details.',
    },
    {
      name: TemplateName.ACCOUNT_APPROVED,
      subject: 'Your Deep Review account has been approved',
      body: 'Hello {{userName}},\n\nYour sign-up request for Deep Review has been approved. You can now log in and start using the system.\n\nWelcome aboard!{{note}}',
    },
    {
      name: TemplateName.ACCOUNT_REJECTED,
      subject: 'Your Deep Review sign-up request was not approved',
      body: 'Hello {{userName}},\n\nUnfortunately your sign-up request for Deep Review has not been approved at this time.{{note}}\n\nIf you believe this is a mistake, please contact the lab coordinator.',
    },
    {
      name: TemplateName.PASSWORD_RESET,
      subject: 'Reset your Deep Review password',
      body: 'Hello {{userName}},\n\nWe received a request to reset your Deep Review password.\n\nReset your password using this link:\n{{resetLink}}\n\nIf you did not request this change, you can safely ignore this email.',
    },
    {
      name: TemplateName.COORDINATOR_CREATED,
      subject: 'Welcome to Deep Review - Coordinator Account Created',
      body: 'Hello {{userName}},\n\nAn admin has created a Coordinator account and a Lab for you on the Deep Review platform.\n\nYour login credentials:\nEmail: {{email}}\nPassword: {{password}}\n\nPlease log in at: {{loginUrl}}/login\n\nIf you are not involved with Deep Review, please ignore this email.\n\nBest regards,\nDeep Review Admin Team',
    },
    {
      name: TemplateName.ASSIGNMENT_CANCELLED,
      subject: 'Your review assignment for "{{paperTitle}}" has been cancelled',
      body: 'Hello {{userName}},\n\nYour review assignment for paper "{{paperTitle}}" (Round {{roundNumber}}) has been cancelled. No further action is required on your part.',
    },
    {
      name: TemplateName.COLLABORATION_INVITATION,
      subject: 'Collaboration invitation: {{paperTitle}}',
      body: 'Hello {{coordinatorName}},\n\nYou have been invited by the coordinator of "{{invitingLabName}}" to collaborate on the paper "{{paperTitle}}".\n\nPlease log in to the system to accept or reject this invitation.',
    },
    {
      name: TemplateName.COLLABORATION_ACCEPTED,
      subject: 'Collaboration accepted: {{paperTitle}}',
      body: 'Hello {{coordinatorName}},\n\n"{{acceptingLabName}}" has accepted your collaboration invitation for the paper "{{paperTitle}}".',
    },
    {
      name: TemplateName.COLLABORATION_REJECTED,
      subject: 'Collaboration declined: {{paperTitle}}',
      body: 'Hello {{coordinatorName}},\n\n"{{decliningLabName}}" has declined your collaboration invitation for the paper "{{paperTitle}}".',
    },
    {
      name: TemplateName.REVIEW_DEADLINE_UPDATED,
      subject: 'Review deadline updated — {{paperTitle}}',
      body: 'Hello {{userName}},\n\nThe review deadline for the paper "{{paperTitle}}" ({{venue}}) has been updated.\n\nNew deadline: {{newDeadline}}\n\nPlease log in to check your assignment.',
    },
    {
      name: TemplateName.SUBMISSION_DEADLINE_UPDATED,
      subject: 'Submission deadline updated — {{paperTitle}}',
      body: 'Hello {{userName}},\n\nThe conference submission deadline for the paper "{{paperTitle}}" ({{venue}}) has been updated.\n\nNew deadline: {{newDeadline}}',
    },
    {
      name: TemplateName.REVIEW_SUBMITTED,
      subject: 'Review submitted for "{{paperTitle}}"',
      body: 'Hello {{coordinatorName}},\n\n{{reviewerName}} has submitted their review for the paper "{{paperTitle}}".',
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