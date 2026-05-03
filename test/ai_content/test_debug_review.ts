import { PdfAgentService } from '../../backend/src/ai_content/services/PdfAgentService';
import { ClientSecretCredential } from "@azure/identity";
import { AgentsClient } from "@azure/ai-agents";
import yaml from "js-yaml";
import fs from 'fs';
import path from 'path';

async function test() {
  const testPdfPath = path.join(__dirname, 'test_input.pdf');
  const pdfBuffer = fs.readFileSync(testPdfPath);

  const agent = new PdfAgentService();
  const fileId = await agent.uploadPdf(pdfBuffer, 'test_paper.pdf');
  console.log('File uploaded:', fileId);

  console.log('\nCalling runAnnotatedReview...');
  const result = await agent.runAnnotatedReview(fileId, 'EASE 2026');

  console.log('\n=== RESULT ===');
  console.log('Summary length:', result.summaryText.length);
  console.log('PDF buffer:', result.annotatedPdfBuffer ? result.annotatedPdfBuffer.length + ' bytes' : 'null');

  console.log('\n=== FIRST 1000 CHARS OF SUMMARY ===');
  console.log(result.summaryText.substring(0, 1000));

  if (result.annotatedPdfBuffer) {
    fs.writeFileSync(path.join(__dirname, 'test_annotated_debug.pdf'), result.annotatedPdfBuffer);
    console.log('\nAnnotated PDF saved to test_annotated_debug.pdf');
  }

  process.exit(0);
}

test().catch(e => { console.error('Error:', e); process.exit(1); });
