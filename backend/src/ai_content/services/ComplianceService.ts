const pdfParse = require('pdf-parse');
import { AzureOpenAIClient } from '../utils/AzureOpenAIClient';

export class ComplianceService {
  /**
   * Orchestrates the compliance verification pipeline:
   * 1. Extracts text from the uploaded PDF buffer.
   * 2. Calls Azure OpenAI to verify rules and generate confidence scores.
   */
  static async verifyCompliance(paperId: string, pdfBuffer: Buffer, venueRules: any): Promise<any> {
    console.log(`[ComplianceService] Starting compliance check for paper ${paperId}`);

    // 1. Extract text + metadata from PDF
    console.log(`[ComplianceService] Parsing PDF...`);
    const pdfData = await pdfParse(pdfBuffer);
    const pdfText = pdfData.text;

    if (!pdfText || pdfText.trim().length === 0) {
      throw new Error('The uploaded PDF appears to be empty or could not be parsed.');
    }

    const metadataStr = pdfData.info ? JSON.stringify(pdfData.info) : "No PDF Metadata available.";

    // 2. Run AI Compliance Check
    const complianceReport = await this.runAIComplianceCheck(pdfText, metadataStr, venueRules);

    return complianceReport;
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
${pdfText.substring(0, 30000)}
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
