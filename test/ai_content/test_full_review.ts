import { PdfAgentService } from '../../backend/src/ai_content/services/PdfAgentService';
import fs from 'fs';
import path from 'path';

async function test() {
  console.log('🧪 Testing Full Review with Annotation\n');

  const testPdfPath = path.join(__dirname, 'test_input.pdf');
  const pdfBuffer = fs.readFileSync(testPdfPath);

  const agent = new PdfAgentService();

  try {
    console.log('1️⃣  Uploading PDF...');
    const fileId = await agent.uploadPdf(pdfBuffer, 'test_paper.pdf');
    console.log(`✅ File ID: ${fileId}\n`);

    console.log('2️⃣  Running annotated review...');
    const result = await agent.runAnnotatedReview(fileId);
    
    console.log('✅ Review completed!');
    console.log(`\nReview Text (first 500 chars):\n${result.summaryText.substring(0, 500)}\n`);
    console.log(`Annotated PDF: ${result.annotatedPdfBuffer ? `Yes (${(result.annotatedPdfBuffer.length / 1024).toFixed(2)} KB)` : 'No'}\n`);

    // Save review
    const reviewPath = path.join(__dirname, 'test_review_output.txt');
    fs.writeFileSync(reviewPath, result.summaryText);
    console.log(`💾 Review saved to: ${reviewPath}`);

    if (result.annotatedPdfBuffer) {
      const pdfPath = path.join(__dirname, 'test_annotated_review.pdf');
      fs.writeFileSync(pdfPath, result.annotatedPdfBuffer);
      console.log(`💾 Annotated PDF saved to: ${pdfPath}`);
    }

    console.log('\n✅ Test completed successfully!');
    process.exit(0);

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

test();
