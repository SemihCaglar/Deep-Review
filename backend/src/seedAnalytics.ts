/**
 * Analytics seed — issue #42
 *
 * Run AFTER the main seed (npm run seed). Adds four reviewers to CS319 Lab,
 * each with a completed assignment on a dedicated analytics paper.
 * Three reviewers have ratings; one does not (tests the null-score edge case).
 *
 * Expected leaderboard after this seed:
 *   Rank 1 — Alice  | aggregate ≈ 4.77 (quality 4.8 / quantity 4.5 / time 5.0)
 *   Rank 2 — Bob    | aggregate ≈ 3.50 (quality 3.5 / quantity 4.0 / time 3.0)
 *   Rank 3 — Carol  | aggregate ≈ 2.50 (quality 2.0 / quantity 2.5 / time 3.0)
 *   Rank 4 — Dave   | aggregate = null (no ratings yet)
 */

import 'reflect-metadata';
import { AppDataSource } from './data-source';
import { Coordinator } from './entities/Coordinator';
import { Lab } from './entities/Lab';
import { LabMember } from './entities/LabMember';
import { Paper, PaperStatus } from './entities/Paper';
import { Round, RoundStatus, VenueCategory } from './entities/Round';
import { Assignment, AssignmentStatus } from './entities/Assignment';
import { Rating } from './entities/Rating';
import { ApprovalStatus, User } from './entities/User';
import { hashPassword } from './services/accountSecurity';

const REVIEWER_DATA = [
  { name: 'Alice Reviewer',  email: 'alice.reviewer@test.com',  password: '123', quality: 4.8, quantity: 4.5, time: 5.0 },
  { name: 'Bob Reviewer',    email: 'bob.reviewer@test.com',    password: '123', quality: 3.5, quantity: 4.0, time: 3.0 },
  { name: 'Carol Reviewer',  email: 'carol.reviewer@test.com',  password: '123', quality: 2.0, quantity: 2.5, time: 3.0 },
  { name: 'Dave Reviewer',   email: 'dave.reviewer@test.com',   password: '123', quality: null, quantity: null, time: null },
];

async function run() {
  await AppDataSource.initialize();

  const userRepo  = AppDataSource.getRepository(User);
  const coordRepo = AppDataSource.getRepository(Coordinator);
  const labRepo   = AppDataSource.getRepository(Lab);
  const paperRepo = AppDataSource.getRepository(Paper);
  const roundRepo = AppDataSource.getRepository(Round);
  const assignRepo = AppDataSource.getRepository(Assignment);
  const ratingRepo = AppDataSource.getRepository(Rating);

  // Require the main seed to have been run first
  const coordinator = await coordRepo.findOne({
    where: { email: 'coordinator@mock.test' },
    relations: ['lab'],
  });
  if (!coordinator) {
    console.error('❌  Coordinator not found. Run the main seed first:  npm run seed');
    process.exitCode = 1;
    await AppDataSource.destroy();
    return;
  }

  // Find the lab via the coordinator's relation (robust to lab name changes)
  const labWithCoord = await coordRepo.findOne({
    where: { email: 'coordinator@mock.test' },
    relations: ['lab', 'lab.members'],
  });
  const lab = labWithCoord?.lab ?? null;
  if (!lab) {
    console.error('❌  No lab associated with coordinator. Run the main seed first:  npx ts-node src/reset-and-seed.ts');
    process.exitCode = 1;
    await AppDataSource.destroy();
    return;
  }
  console.log(`ℹ️   Using lab: "${lab.name}" (id: ${lab.id})`);

  // Analytics paper — coordinator is both coordinator and author so they can submit ratings.
  // Use shallow ID-only references for ManyToMany to avoid TypeORM circular-relation stack overflow.
  let paper = await paperRepo.findOne({
    where: { title: 'Analytics Test Paper' },
    relations: ['coordinators', 'labs', 'authors'],
  });
  if (!paper) {
    const coordRef = { id: coordinator.id } as Coordinator;
    const labRef   = { id: lab.id } as Lab;
    paper = paperRepo.create({
      title: 'Analytics Test Paper',
      abstractText: 'Paper used for testing the analytics leaderboard in issue #42.',
      creationTime: new Date(),
      status: PaperStatus.HumanReview,
      coordinators: [coordRef],
      labs: [labRef],
      authors: [coordRef],
    });
    await paperRepo.save(paper);
    console.log('✅  Analytics paper created');
  } else {
    console.log('ℹ️   Analytics paper already exists — skipping creation');
  }

  // Closed round with a past deadline (realistic for completed assignments)
  let round = await roundRepo.findOne({ where: { paper: { id: paper.id }, roundNumber: 1 } });
  if (!round) {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() - 7);
    round = roundRepo.create({
      paper,
      roundNumber: 1,
      deadline,
      status: RoundStatus.Completed,
      completedAt: new Date(),
      targetVenue: 'ICSE 2026',
      venueCategory: VenueCategory.Conference,
    });
    await roundRepo.save(round);
    console.log('✅  Analytics round created (Closed, deadline 7 days ago)');
  } else {
    console.log('ℹ️   Analytics round already exists — skipping creation');
  }

  for (const rd of REVIEWER_DATA) {
    // Ensure reviewer exists
    let reviewer = await userRepo.findOne({ where: { email: rd.email } });
    if (!reviewer) {
      const m = new LabMember();
      m.name = rd.name;
      m.email = rd.email;
      m.passwordHash = await hashPassword(rd.password);
      m.approvalStatus = ApprovalStatus.Approved;
      m.approvalReviewedAt = new Date();
      m.approvalNote = null;
      m.failedLogins = 0;
      m.failedLoginWindowStartedAt = null;
      m.lockedUntil = null;
      m.lastLoginAt = null;
      reviewer = await userRepo.save(m);
      console.log(`\n✅  Reviewer created: ${rd.name} (${rd.email})`);
    } else {
      console.log(`\nℹ️   Reviewer already exists: ${rd.name}`);
    }

    // Add to lab
    const freshLab = await labRepo.findOne({ where: { id: lab.id }, relations: ['members'] });
    if (freshLab && !freshLab.members.find(m => m.id === reviewer!.id)) {
      freshLab.members.push(reviewer!);
      await labRepo.save(freshLab);
      console.log(`   → Added to lab`);
    }

    // Completed assignment
    let assignment = await assignRepo.findOne({
      where: { round: { id: round.id }, reviewer: { id: reviewer.id } },
      relations: ['rating'],
    });
    if (!assignment) {
      assignment = assignRepo.create({
        round,
        reviewer,
        status: AssignmentStatus.Completed,
        deadline: round.deadline,
        submittedAt: new Date(),
      });
      await assignRepo.save(assignment);
      console.log(`   → Completed assignment created`);
    } else {
      console.log(`   → Assignment already exists (status: ${assignment.status})`);
    }

    // Rating (only for reviewers who have scores in REVIEWER_DATA)
    if (rd.quality !== null) {
      const existingRating = await ratingRepo.findOne({ where: { assignment: { id: assignment.id } } });
      if (!existingRating) {
        const rating = ratingRepo.create({
          qualityScore: rd.quality,
          quantityScore: rd.quantity!,
          timeScore: rd.time!,
          assignment,
          rater: coordinator,
        });
        await ratingRepo.save(rating);
        console.log(`   → Rating saved  quality=${rd.quality}  quantity=${rd.quantity}  time=${rd.time}`);
      } else {
        console.log(`   → Rating already exists`);
      }
    } else {
      console.log(`   → No rating (Dave tests null-score edge case)`);
    }
  }

  console.log('\n🌱  Analytics seed complete!');
  console.log('\n   Login credentials:');
  console.log('   Coordinator  coordinator@mock.test  /  123');
  console.log('   Alice        alice.reviewer@test.com       /  123');
  console.log('   Bob          bob.reviewer@test.com         /  123');
  console.log('   Carol        carol.reviewer@test.com       /  123');
  console.log('   Dave         dave.reviewer@test.com        /  123');
  console.log('\n   Open the dashboard as the coordinator to see the leaderboard.');

  await AppDataSource.destroy();
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
