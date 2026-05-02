import { ComplianceCheckAgentService } from './ai_content/services/ComplianceCheckAgentService';
import { SubmissionRuleExtractionService } from './ai_content/services/SubmissionRuleExtractionService';
import { AppDataSource } from './data-source';
import fs from 'fs';
import path from 'path';

async function testComplianceCheck() {
  try {
    // Initialize database connection
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const testUrl = 'https://conf.researchr.org/track/ease-2026/ease-2026-research-papers';
    const pdfPath = path.join(__dirname, 'ai_content', 'ease_paper.pdf');

    console.log('\n========================================');
    console.log('COMPLIANCE CHECK TEST');
    console.log('========================================\n');

    // Step 1: Get rules from database
    console.log('STEP 1: Loading submission rules...');
    console.log('----------------------------------------');
    const rules = await SubmissionRuleExtractionService.getRulesFromDatabase(testUrl);

    if (!rules) {
      console.log('❌ Rules not found in database for:', testUrl);
      console.log('Attempting to extract rules first...\n');

      const newRules = await SubmissionRuleExtractionService.extractSubmissionRules(testUrl);
      console.log('✓ Rules extracted and saved\n');
      console.log('Rules:');
      console.log(JSON.stringify(newRules, null, 2));
    } else {
      console.log('✓ Rules loaded successfully\n');
      console.log('Rules:');
      console.log(JSON.stringify(rules, null, 2));
    }

    // Step 2: Load PDF
    console.log('\n\nSTEP 2: Loading PDF...');
    console.log('----------------------------------------');
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF not found at ${pdfPath}`);
    }
    const pdfBuffer = fs.readFileSync(pdfPath);
    console.log(`✓ PDF loaded (${pdfBuffer.length} bytes)\n`);

    // Step 3: Run compliance check
    console.log('STEP 3: Running compliance check with Azure Agent...');
    console.log('----------------------------------------');
    const agentService = new ComplianceCheckAgentService();

    const fileId = await agentService.uploadPdf(pdfBuffer, 'ease_paper.pdf');
    console.log(`✓ PDF uploaded: ${fileId}\n`);

    const rulesForCheck = rules || await SubmissionRuleExtractionService.getRulesFromDatabase(testUrl);
    if (!rulesForCheck) {
      throw new Error('Cannot proceed without rules');
    }

    console.log('Sending compliance check request to agent...');
    const { complianceReport } = await agentService.runComplianceCheck(fileId, rulesForCheck);

    console.log('\n✓ Compliance check completed!\n');

    // Step 4: Display results
    console.log('COMPLIANCE REPORT:');
    console.log('========================================');
    console.log(JSON.stringify(complianceReport, null, 2));
    console.log('========================================\n');

    // Summary
    console.log('SUMMARY:');
    console.log('----------------------------------------');
    for (const [rule, result] of Object.entries(complianceReport)) {
      const status = result.status.toUpperCase();
      const icon = result.status === 'pass' ? '✓' : result.status === 'fail' ? '✗' : '?';
      console.log(`${icon} ${rule.padEnd(35)} ${status}`);
      if (result.details) {
        console.log(`  → ${result.details}`);
      }
    }

    console.log('\n========================================');
    console.log('TEST COMPLETED SUCCESSFULLY');
    console.log('========================================\n');

    await AppDataSource.destroy();
  } catch (error) {
    console.error('\n❌ TEST FAILED:');
    console.error(error);
    process.exit(1);
  }
}

testComplianceCheck();
