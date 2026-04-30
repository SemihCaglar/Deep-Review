import * as fs from 'fs';
import * as path from 'path';
const pdfParse = require('pdf-parse');
import { AzureOpenAIClient } from '../utils/AzureOpenAIClient';
import { OverleafGitService } from './OverleafGitService';

export class ComplianceService {
  /**
   * Orchestrates the compliance verification pipeline:
   * 1. Clones the Overleaf repository.
   * 2. Finds and parses the PDF.
   * 3. Calls Azure OpenAI to verify rules and generate confidence scores.
   * 4. Cleans up.
   */
  static async verifyCompliance(paperId: string, gitUrl: string, token: string, venueRules: any): Promise<any> {
    console.log(`[ComplianceService] Starting compliance check for paper ${paperId}`);
    
    // 1. Clone the repository
    const tempDir = await OverleafGitService.cloneProject(gitUrl, token);
    
    try {
      // 2. Compile the project to PDF (since Overleaf Git doesn't include it)
      console.log(`[ComplianceService] Compiling LaTeX project to PDF...`);
      const pdfPath = await OverleafGitService.compileToPdf(tempDir);
      
      if (!pdfPath || !fs.existsSync(pdfPath)) {
        throw new Error('Failed to compile the project. Please ensure the LaTeX source is valid and compiles without errors.');
      }

      // 3. Extract text from PDF
      const dataBuffer = fs.readFileSync(pdfPath);
      const pdfData = await pdfParse(dataBuffer);
      const pdfText = pdfData.text;
      
      // Pass metadata strings along if available
      const metadataStr = pdfData.info ? JSON.stringify(pdfData.info) : "No PDF Metadata available.";

      // 4. Run AI Compliance Check
      const complianceReport = await this.runAIComplianceCheck(pdfText, metadataStr, venueRules);
      
      return complianceReport;

    } catch (err) {
      console.error('[ComplianceService] Error during compliance check:', err);
      throw err;
    } finally {
      // 5. Cleanup
      await OverleafGitService.cleanup(tempDir);
    }
  }

  /**
   * Helper to find a PDF file in the cloned directory.
   */
  private static findPdfInDir(dirPath: string): string | null {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      if (file.toLowerCase().endsWith('.pdf')) {
        return path.join(dirPath, file);
      }
    }
    return null;
  }

  /**
   * Invokes Azure OpenAI to verify compliance based on the extracted PDF text.
   */
  private static async runAIComplianceCheck(pdfText: string, metadata: string, venueRules: any): Promise<any> {
    const systemPrompt = `You are an expert academic compliance checker. You are reviewing a submitted academic paper against strict venue rules.
You will be provided with:
1. The extracted text from the paper's PDF.
2. The extracted PDF Metadata.
3. The Target Venue Rules (JSON).

Your job is to verify compliance for each of the following:
- Page limit
- Abstract word count
- Required sections (if any are specified in venue rules)
- Reference format
- Anonymity requirements (blind review): Look for author names, organization names, non-anonymized git/dataset links, and check the PDF metadata to ensure author/company fields are cleared.
- Detect the paper type (e.g., "Research", "Survey", "Case Study", "Engineering") to activate the appropriate checklist dynamically.

You MUST return ONLY a valid JSON object.
For each check, include an "isCompliant" boolean, a "confidence" score (0.0 to 1.0), and a brief "details" string explaining any issues.
The root JSON structure should look like this:
{
  "pageLimit": { "isCompliant": true, "confidence": 0.9, "details": "The paper is 8 pages, within the 10 page limit." },
  "abstractWordCount": { "isCompliant": true, "confidence": 0.95, "details": "Abstract has 150 words." },
  "anonymity": { "isCompliant": false, "confidence": 0.99, "details": "Found author name 'John Doe' in PDF Metadata Author field." },
  "referenceFormat": { "isCompliant": true, "confidence": 0.8, "details": "References appear to follow standard IEEE format." },
  "requiredSections": { "isCompliant": true, "confidence": 0.9, "details": "Found Introduction, Methodology, Conclusion." },
  "detectedPaperType": "Case Study",
  "paperTypeConfidence": 0.95
}`;

    const userPrompt = `
=== VENUE RULES ===
${JSON.stringify(venueRules, null, 2)}

=== PDF METADATA ===
${metadata}

=== PDF TEXT CONTENT (Truncated if too long) ===
${pdfText.substring(0, 30000)} // Truncating to ~30k chars to stay within token limits safely.
`;

    const responseText = await AzureOpenAIClient.sendPrompt(systemPrompt, userPrompt);
    try {
      const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanedText);
    } catch (err) {
      console.warn('[ComplianceService] AI returned invalid JSON. Raw output:', responseText);
      throw new Error('The AI failed to generate a valid compliance report format.');
    }
  }
}
