import { SubmissionRuleExtractionService } from './src/ai_content/services/SubmissionRuleExtractionService';

async function testExtractEaseRules() {
  const url = 'https://conf.researchr.org/track/ease-2026/ease-2026-research-papers';
  console.log(`\n[Test] Extracting rules from: ${url}\n`);
  
  try {
    const rules = await SubmissionRuleExtractionService.extractSubmissionRules(url);
    
    console.log('[Test] ✓ Rules extracted successfully');
    console.log('\n[Test] Rules JSON:');
    console.log(JSON.stringify(rules, null, 2));
    
  } catch (err) {
    console.error('[Test] ✗ Error:', err instanceof Error ? err.message : err);
  }
}

testExtractEaseRules();
