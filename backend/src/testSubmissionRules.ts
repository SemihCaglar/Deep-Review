import { SubmissionRuleExtractionService } from './ai_content/services/SubmissionRuleExtractionService';
import { WebsiteScraperService } from './ai_content/services/WebsiteScraperService';
import { cleanWebsiteHtml } from './ai_content/utils/cleanWebsiteHtml';
import { SUBMISSION_RULE_EXTRACTION_SYSTEM_PROMPT, buildUserPrompt } from './ai_content/prompts/submissionRuleExtractionPrompt';
import { AppDataSource } from './data-source';

async function testSubmissionRuleExtraction() {
  try {
    // Initialize database connection
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const testUrl = 'https://conf.researchr.org/track/ease-2026/ease-2026-research-papers';

    console.log('\n========================================');
    console.log('SUBMISSION RULES EXTRACTION TEST');
    console.log('========================================\n');

    console.log(`Testing URL: ${testUrl}\n`);

    // Step 1: Fetch website
    console.log('STEP 1: Fetching website HTML...');
    console.log('----------------------------------------');
    const html = await WebsiteScraperService.fetchWebsiteHtml(testUrl);
    console.log(`✓ HTML fetched successfully (${html.length} characters)\n`);

    // Step 2: Clean HTML
    console.log('STEP 2: Cleaning HTML...');
    console.log('----------------------------------------');
    const cleanedText = cleanWebsiteHtml(html);
    console.log(`✓ HTML cleaned (${cleanedText.length} characters)\n`);

    // Show first 1000 chars of cleaned text for verification
    console.log('CLEANED WEBSITE TEXT (first 1000 chars):');
    console.log('----------------------------------------');
    console.log(cleanedText.substring(0, 1000));
    console.log('...\n');

    // Step 3: Build and log the prompt
    console.log('STEP 3: Building prompt for AI...');
    console.log('----------------------------------------');
    const userPrompt = buildUserPrompt(testUrl, cleanedText);

    console.log('SYSTEM PROMPT:');
    console.log('----------------------------------------');
    console.log(SUBMISSION_RULE_EXTRACTION_SYSTEM_PROMPT);
    console.log('\n');

    console.log('USER PROMPT:');
    console.log('----------------------------------------');
    console.log(userPrompt);
    console.log('\n');

    // Step 4: Extract rules
    console.log('STEP 4: Calling AI to extract rules...');
    console.log('----------------------------------------');
    const rules = await SubmissionRuleExtractionService.extractSubmissionRules(testUrl);

    console.log('✓ Rules extracted successfully!\n');

    console.log('EXTRACTED RULES:');
    console.log('----------------------------------------');
    console.log(JSON.stringify(rules, null, 2));
    console.log('\n');

    console.log('========================================');
    console.log('TEST COMPLETED SUCCESSFULLY');
    console.log('========================================\n');

    await AppDataSource.destroy();
  } catch (error) {
    console.error('\n❌ TEST FAILED:');
    console.error(error);
    process.exit(1);
  }
}

testSubmissionRuleExtraction();
