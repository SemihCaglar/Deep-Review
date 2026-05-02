import { PdfAgentService } from './src/ai_content/services/PdfAgentService';
import fs from 'fs';
import path from 'path';

async function test() {
  const testPdfPath = path.join(__dirname, 'src/ai_content/test_input.pdf');
  const pdfBuffer = fs.readFileSync(testPdfPath);

  const agent = new PdfAgentService();
  const fileId = await agent.uploadPdf(pdfBuffer, 'test_paper.pdf');
  console.log('File uploaded:', fileId);

  const result = await agent.runAnnotatedReview(fileId, 'EASE 2026');

  console.log('\n=== FULL SUMMARY OUTPUT ===');
  console.log(result.summaryText);
  console.log('\n=== END SUMMARY ===');
  console.log('\nPDF buffer:', result.annotatedPdfBuffer ? result.annotatedPdfBuffer.length + ' bytes' : 'null');

  process.exit(0);
}

test().catch(e => { console.error('Error:', e); process.exit(1); });
