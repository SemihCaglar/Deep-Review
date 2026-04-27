import 'reflect-metadata';
import { AppDataSource } from './data-source';
import { LabMember } from './entities/LabMember';
import { Coordinator } from './entities/Coordinator';
import { Paper, PaperStatus } from './entities/Paper';
import { Round, RoundStatus } from './entities/Round';
import { Assignment, AssignmentStatus } from './entities/Assignment';
import { ApprovalStatus } from './entities/User';
import { hashPassword } from './services/accountSecurity';

async function seed() {
    await AppDataSource.initialize();
    await AppDataSource.synchronize(true); // Drops all tables and cleanly recreates them
    console.log('✅ DB Connected and Reset for Seeding');

    const memberRepo = AppDataSource.getRepository(LabMember);
    const paperRepo = AppDataSource.getRepository(Paper);
    const assignRepo = AppDataSource.getRepository(Assignment);

    // 2. Create standard users mimicking Mock Data Context
    const user1 = Object.assign(new Coordinator(), {
        name: 'Semih User',
        email: 'semih@builder.app',
        passwordHash: await hashPassword('123'),
        approvalStatus: ApprovalStatus.Approved,
        approvalReviewedAt: new Date(),
    });
    await memberRepo.save(user1);

    const user2 = Object.assign(new LabMember(), {
        name: 'Emily Chen',
        email: 'emily@builder.app',
        passwordHash: await hashPassword('123'),
        approvalStatus: ApprovalStatus.Approved,
        approvalReviewedAt: new Date(),
    });
    await memberRepo.save(user2);

    // 3. Create Papers
    const p1 = Object.assign(new Paper(), {
        title: 'Deep Learning for BILSEN Automation',
        abstractText: 'Exploring autonomous LLMs for paper review grading.',
        creationTime: new Date(),
        targetVenue: 'CS319 Symposium',
        status: PaperStatus.HumanReview,
        coordinator: user1,
    });
    await paperRepo.save(p1);

    const p2 = Object.assign(new Paper(), {
        title: 'React Next.js Component Scaling',
        abstractText: 'A comprehensive review of monorepos.',
        creationTime: new Date(),
        targetVenue: 'Frontend Conf 2026',
        status: PaperStatus.Draft,
        coordinator: user1,
    });
    await paperRepo.save(p2);

    // The coordinator is also an author on every paper in BILSEN.
    // user1 (coordinator) is linked as author of both papers.
    // user2 is linked as author of p2 as well.
    user1.writtenPapers = [p1, p2];
    await memberRepo.save(user1);

    user2.writtenPapers = [p2];
    await memberRepo.save(user2);

    // 4. Create Rounds & Assignments
    const roundRepo = AppDataSource.getRepository(Round);

    const r1 = Object.assign(new Round(), {
        paper: p1,
        roundNumber: 1,
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 days
        status: RoundStatus.Open,
        startedAt: new Date()
    });
    await roundRepo.save(r1);

    const r2 = Object.assign(new Round(), {
        paper: p2,
        roundNumber: 1,
        deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // +14 days
        status: RoundStatus.Open,
        startedAt: new Date()
    });
    await roundRepo.save(r2);

    const a1 = Object.assign(new Assignment(), {
        round: r1,
        reviewer: user1,
        status: AssignmentStatus.Invited,
        invitedAt: new Date()
    });
    await assignRepo.save(a1);

    const a2 = Object.assign(new Assignment(), {
        round: r1,
        reviewer: user2,
        status: AssignmentStatus.Accepted,
        invitedAt: new Date(),
        acceptedAt: new Date()
    });
    await assignRepo.save(a2);

    const a3 = Object.assign(new Assignment(), {
        round: r2,
        reviewer: user1,
        status: AssignmentStatus.Declined,
        invitedAt: new Date(),
        declineReason: 'Conflict of interest.'
    });
    await assignRepo.save(a3);

    console.log(`✅ successfully seeded database! user.id='${user1.id}'`);
    await AppDataSource.destroy();
}

seed().catch(err => console.error(err));
