import 'reflect-metadata';
import { AppDataSource } from './data-source';
import { LabMember } from './entities/LabMember';
import { Paper, PaperStatus } from './entities/Paper';
import { Assignment, AssignmentStatus } from './entities/Assignment';

async function seed() {
    await AppDataSource.initialize();
    await AppDataSource.synchronize(true); // Drops all tables and cleanly recreates them
    console.log('✅ DB Connected and Reset for Seeding');

    const memberRepo = AppDataSource.getRepository(LabMember);
    const paperRepo = AppDataSource.getRepository(Paper);
    const assignRepo = AppDataSource.getRepository(Assignment);

    // 2. Create standard users mimicking Mock Data Context
    const user1 = Object.assign(new LabMember(), { name: 'Semih User', email: 'semih@builder.app', passwordHash: '123' });
    await memberRepo.save(user1);

    const user2 = Object.assign(new LabMember(), { name: 'Emily Chen', email: 'emily@builder.app', passwordHash: '123' });
    await memberRepo.save(user2);

    // 3. Create Papers
    const p1 = Object.assign(new Paper(), {
        title: 'Deep Learning for BILSEN Automation',
        abstractText: 'Exploring autonomous LLMs for paper review grading.',
        creationTime: new Date(),
        targetVenue: 'CS319 Symposium',
        status: PaperStatus.HumanReview,
    });
    await paperRepo.save(p1);

    const p2 = Object.assign(new Paper(), {
        title: 'React Next.js Component Scaling',
        abstractText: 'A comprehensive review of monorepos.',
        creationTime: new Date(),
        targetVenue: 'Frontend Conf 2026',
        status: PaperStatus.Registered,
    });
    await paperRepo.save(p2);

    // Save relation properly from the owning side (LabMember)
    user1.writtenPapers = [p1];
    await memberRepo.save(user1);

    user2.writtenPapers = [p2];
    await memberRepo.save(user2);

    // 4. Create Assignments
    const a1 = Object.assign(new Assignment(), {
        status: AssignmentStatus.Invited,
        reviewer: user1
    });
    await assignRepo.save(a1);

    console.log(`✅ successfully seeded data into Postgres! user.id='${user1.id}'`);
    await AppDataSource.destroy();
}

seed().catch(err => console.error(err));
