import { PdfAgentService } from './src/ai_content/services/PdfAgentService';
import fs from 'fs';
import path from 'path';

async function test() {
  console.log('🧪 Testing Checklist Analysis\n');

  const testPdfPath = path.join(__dirname, 'src/ai_content/test_input.pdf');
  const pdfBuffer = fs.readFileSync(testPdfPath);

  const agent = new PdfAgentService();

  try {
    console.log('1️⃣  Uploading PDF...');
    const fileId = await agent.uploadPdf(pdfBuffer, 'test_paper.pdf');
    console.log(`✅ File ID: ${fileId}\n`);

    console.log('2️⃣  Running checklist analysis...');
    const result = await agent.runChecklistAnalysis(fileId);

    console.log('✅ Checklist analysis completed!');
    console.log(`\nPaper Title: "${result.paperTitle}"`);
    console.log(`\nSelected Standards (${result.selectedStandards.length}):`);
    result.selectedStandards.forEach(s => {
      console.log(`  - ${s.label} (${s.confidence})`);
      console.log(`    Evidence: ${s.evidence}`);
    });

    console.log('\n✅ Test completed successfully!');
    process.exit(0);

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

test();
