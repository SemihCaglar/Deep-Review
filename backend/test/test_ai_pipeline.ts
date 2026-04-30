import { AIReviewService } from '../src/ai_content/services/AIReviewService';

async function runTest() {
  console.log("=== Starting System Test for AI Review Pipeline ===");
  try {
    const paperId = "test-paper-123";
    const roundId = "round-1";
    const gitUrl = "https://git.overleaf.com/test-project-xyz";
    const token = "dummy-token";

    const result = await AIReviewService.generateAIReview(paperId, roundId, gitUrl, token);
    
    console.log("=== Test Completed Successfully ===");
    console.log("Pipeline Output:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("=== Test Failed ===", error);
  }
}
if (require.main === module) {
  runTest().catch(console.error);
}
