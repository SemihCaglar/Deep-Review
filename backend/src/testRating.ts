import { AppDataSource } from './data-source';
import { User, ApprovalStatus, UserRole } from './entities/User';
import { Paper, PaperStatus } from './entities/Paper';
import { Round, RoundStatus } from './entities/Round';
import { Assignment, AssignmentStatus } from './entities/Assignment';
import { RatingAnalyticsController } from './controllers/RatingAnalyticsController';
import { Rating } from './entities/Rating';
import { generateAuthToken } from './services/tokenService';
import { authenticateRequest } from './middleware/auth';
import type { AuthenticatedRequest } from './types/auth';

async function runTest() {
  await AppDataSource.initialize();

  const userRepo = AppDataSource.getRepository(User);
  const nowStr = Date.now().toString();
  const author = userRepo.create({
    name: "Test Author",
    email: `author_${nowStr}@test.com`,
    passwordHash: "hash",
    approvalStatus: ApprovalStatus.Approved,
    role: UserRole.LabMember,
    failedLogins: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  await userRepo.save(author);

  const reviewer = userRepo.create({
    name: "Test Reviewer",
    email: `reviewer_${nowStr}@test.com`,
    passwordHash: "hash",
    approvalStatus: ApprovalStatus.Approved,
    role: UserRole.LabMember,
    failedLogins: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  await userRepo.save(reviewer);

  const paperRepo = AppDataSource.getRepository(Paper);
  const paper = paperRepo.create({
    title: "Test Paper",
    abstractText: "Test Abstract",
    creationTime: new Date(),
    status: PaperStatus.Draft,
    authors: [author]
  });
  await paperRepo.save(paper);

  const roundRepo = AppDataSource.getRepository(Round);
  const round = roundRepo.create({
    roundNumber: 1,
    status: RoundStatus.Open,
    paper: paper,
    deadline: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  });
  await roundRepo.save(round);

  const assignmentRepo = AppDataSource.getRepository(Assignment);
  const assignment = assignmentRepo.create({
    status: AssignmentStatus.Completed,
    round: round,
    reviewer: reviewer,
    invitedAt: new Date()
  });
  await assignmentRepo.save(assignment);

  console.log('Entities created. Running tests...');

  // Generate tokens
  const authorToken = generateAuthToken(author);
  const reviewerToken = generateAuthToken(reviewer);

  // Helper for req/res
  const executeController = async (body: any, token: string | null) => {
    let passedMiddleware = false;

    const req = {
      body,
      header: (name: string) => name === 'authorization' ? (token ? `Bearer ${token}` : undefined) : undefined,
    } as any;

    const res = {
      statusCode: 200,
      data: null,
      status: function(code: number) { this.statusCode = code; return this; },
      json: function(data: any) { this.data = data; return this; }
    } as any;

    const next = () => { passedMiddleware = true; };

    await authenticateRequest(req, res, next);
    
    if (passedMiddleware) {
      await RatingAnalyticsController.rateReviewer(req as AuthenticatedRequest, res);
    }

    return { res };
  };

  try {
    // Test 1: No auth token
    let { res } = await executeController({ assignmentId: assignment.id, qualityScore: 5, quantityScore: 5, timeScore: 5 }, null);
    console.log('Test 1 (No auth token):', res.statusCode === 401 ? 'PASS' : 'FAIL', res.data);

    // Test 2: Invalid scores
    ({ res } = await executeController({ assignmentId: assignment.id, qualityScore: 6, quantityScore: 5, timeScore: 5 }, authorToken));
    console.log('Test 2 (Invalid scores):', res.statusCode === 400 ? 'PASS' : 'FAIL', res.data);

    // Test 3: Not the author
    ({ res } = await executeController({ assignmentId: assignment.id, qualityScore: 5, quantityScore: 5, timeScore: 5 }, reviewerToken));
    console.log('Test 3 (Not author):', res.statusCode === 403 ? 'PASS' : 'FAIL', res.data);

    // Test 4: Valid submission
    ({ res } = await executeController({ assignmentId: assignment.id, qualityScore: 4, quantityScore: 5, timeScore: 3 }, authorToken));
    console.log('Test 4 (Valid submission):', res.statusCode === 201 ? 'PASS' : 'FAIL', res.data);

    // Test 5: Already rated
    ({ res } = await executeController({ assignmentId: assignment.id, qualityScore: 5, quantityScore: 5, timeScore: 5 }, authorToken));
    console.log('Test 5 (Already rated):', res.statusCode === 400 ? 'PASS' : 'FAIL', res.data);

  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    console.log('Cleaning up...');
    const ratingRepo = AppDataSource.getRepository(Rating);
    await ratingRepo.delete({ assignment: { id: assignment.id } });
    await assignmentRepo.delete(assignment.id);
    await roundRepo.delete(round.id);
    await paperRepo.delete(paper.id);
    await userRepo.delete([author.id, reviewer.id]);
    await AppDataSource.destroy();
  }

  console.log('Done.');
}

runTest().catch(console.error);
