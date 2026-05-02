import { PdfAgentService } from './src/ai_content/services/PdfAgentService';
import { ChecklistService } from './src/ai_content/services/ChecklistService';
import fs from 'fs';
import path from 'path';

async function test() {
  console.log('🧪 Testing PDF Agent with test input...\n');

  const testPdfPath = path.join(__dirname, 'src/ai_content/test_input.pdf');
  
  if (!fs.existsSync(testPdfPath)) {
    console.error('❌ Test PDF not found:', testPdfPath);
    process.exit(1);
  }

  const pdfBuffer = fs.readFileSync(testPdfPath);
  console.log(`✅ Loaded test PDF: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB\n`);

  const agent = new PdfAgentService();

  try {
    // Step 1: Upload PDF
    console.log('1️⃣  Uploading PDF to agent...');
    const fileId = await agent.uploadPdf(pdfBuffer, 'test_paper.pdf');
    console.log(`✅ File uploaded: ${fileId}\n`);

    // Step 2: Run annotated review
    console.log('2️⃣  Running peer review...');
    const reviewResult = await agent.runAnnotatedReview(fileId, 'EASE 2026');
    console.log('✅ Review completed!');
    console.log(`   Review text length: ${reviewResult.summaryText.length} chars`);
    console.log(`   Annotated PDF: ${reviewResult.annotatedPdfBuffer ? 'Yes (' + (reviewResult.annotatedPdfBuffer.length / 1024 / 1024).toFixed(2) + ' MB)' : 'No'}\n`);

    // Step 3: Run checklist analysis
    console.log('3️⃣  Running checklist analysis...');
    const checklistResult = await agent.runChecklistAnalysis(fileId);
    console.log('✅ Checklist analysis completed!');
    console.log(`   Selected standards: ${checklistResult.selectedStandards.length}`);
    checklistResult.selectedStandards.forEach(s => {
      console.log(`     - ${s.label} (${s.confidence}): ${s.evidence.substring(0, 50)}...`);
    });
    console.log();

    // Step 4: Filter and build URL
    console.log('4️⃣  Filtering standards and building URL...');
    const filtered = ChecklistService.filterValidStandards(checklistResult.selectedStandards);
    const url = ChecklistService.buildEmpiricalStandardsUrl(filtered.map(s => s.label));
    console.log(`✅ Filtered to ${filtered.length} valid standards`);
    console.log(`   URL: ${url}\n`);

    // Save outputs
    if (reviewResult.annotatedPdfBuffer) {
      const outputPath = path.join(__dirname, 'test_output_annotated.pdf');
      fs.writeFileSync(outputPath, reviewResult.annotatedPdfBuffer);
      console.log(`💾 Annotated PDF saved: ${outputPath}`);
    }

    console.log('\n✅ All tests passed!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

test();
