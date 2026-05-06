import { AgentsClient } from "@azure/ai-agents";
import { ClientSecretCredential } from "@azure/identity";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ComplianceReport } from "../../types/complianceReport";
import { SubmissionRulesJSON } from "../../types/submissionRules";
import { uploadPdfWithRetry } from "../utils/uploadWithRetry";

export interface ComplianceCheckResult {
  complianceReport: ComplianceReport;
}

export class ComplianceCheckAgentService {
  private client: AgentsClient;
  private agentId: string;

  constructor() {
    const secretsPath = path.resolve(__dirname, "../secrets.yaml");
    if (!fs.existsSync(secretsPath)) throw new Error(`Secrets file not found at ${secretsPath}`);

    const secrets: any = yaml.load(fs.readFileSync(secretsPath, "utf8"));

    if (!secrets.COMPLIANCE_AGENT_ID) {
      throw new Error("COMPLIANCE_AGENT_ID not found in secrets.yaml");
    }

    const credential = new ClientSecretCredential(
      secrets.AZURE_TENANT_ID,
      secrets.AZURE_CLIENT_ID,
      secrets.AZURE_CLIENT_SECRET
    );

    this.client = new AgentsClient(secrets.FOUNDRY_PROJECT_ENDPOINT, credential);
    this.agentId = secrets.COMPLIANCE_AGENT_ID;

    console.log(`[ComplianceCheckAgentService] Initialized with agent: ${this.agentId}`);
  }

  async uploadPdf(pdfBuffer: Buffer, filename: string = "paper.pdf"): Promise<string> {
    console.log(`[ComplianceCheckAgentService] Uploading PDF (${pdfBuffer.length} bytes)...`);
    return uploadPdfWithRetry(
      async (stream) => {
        const uploadedFile = await this.client.files.upload(stream, "assistants", { fileName: filename });
        console.log(`[ComplianceCheckAgentService] File uploaded: ${uploadedFile.id}`);
        return uploadedFile.id;
      },
      pdfBuffer,
      'ComplianceCheckAgentService'
    );
  }

  async runComplianceCheck(fileId: string, rules: SubmissionRulesJSON): Promise<ComplianceCheckResult> {
    console.log(`[ComplianceCheckAgentService] Starting compliance check`);
    console.log(`[ComplianceCheckAgentService] Source URL: ${rules.sourceUrl}`);
    console.log(`[ComplianceCheckAgentService] Rules to check: ${Object.keys(rules.rules).length} categories`);

    // Log which rules are active
    const activeRules = Object.entries(rules.rules)
      .filter(([_, rule]) => rule.exists)
      .map(([key, _]) => key);
    console.log(`[ComplianceCheckAgentService] Active rules: ${activeRules.join(', ')}`);

    const thread = await this.client.threads.create();
    console.log(`[ComplianceCheckAgentService] Thread created: ${thread.id}`);

    // Build the prompt with rules JSON
    const rulesJson = JSON.stringify(rules.rules, null, 2);
    console.log(`[ComplianceCheckAgentService] Building compliance prompt...`);
    const compliancePrompt = `STEP 1: READ THE ATTACHED PDF USING PYTHON CODE
Use Python to:
- Load the attached PDF file using PyMuPDF (fitz) or pdfplumber
- Extract ALL text from the first 1-2 pages
- Find the paper title:
  → The title is at the very beginning of the document
  → It may span 1, 2, or 3 lines before the author names appear
  → IMPORTANT: Concatenate all title lines together and clean up extra whitespace
- Extract complete PDF text and metadata
- Count total number of pages in the PDF
- Extract PDF metadata fields (Author, Creator, Producer, Keywords, Subject, etc.)
- Find and extract the abstract section
- Identify all section headings
- CAREFULLY locate ONLY the References section:
  → Look for "References", "Bibliography", "Works Cited", or similar heading
  → If no clear heading, scan the PDF structure: references typically appear at the end with numbered citations like [1], [2], etc. or Author (Year) format
  → Once located, count pages from the start of references until the next major section, end of document, or appendix
  → Do NOT include appendices, supplementary materials, or acknowledgments as part of references
  → Only count consecutive pages that contain actual citation entries
  → Report the exact page range (e.g., "pages 8-9 contain references = 2 pages")
- Scan for URLs and hyperlinks
- Check for author names, affiliations, and personal identifiers

STEP 2: CHECK COMPLIANCE AGAINST RULES
For each rule where "exists" is true in the provided rules JSON, determine:
- "pass" if the paper complies
- "fail" if the paper violates (include specific details and evidence from the PDF)
- "unknown" if the rule applies but cannot be verified from the content

For rules where "exists" is false, mark status as "skipped".

SPECIAL ATTENTION:
- For pageLimit: The rule value may be a compound string like "10 (main) + 2 (references)" OR just a number
  → If compound: check main text pages against first number, reference pages against second number
  → If just a number: that's the total page limit including everything
  → Count only pages that contain actual citations in the References section (don't count appendices as reference pages)
  → Details should show actual page counts found (e.g., "Found: 10 main + 2 references = PASS")
- For referenceFormat: check if the reference list matches the required citation style and page count requirements

STEP 3: RETURN JSON COMPLIANCE REPORT ONLY
Return ONLY valid JSON. No markdown fences. No explanations. No other text.

Use exactly this schema:
{
  "pageLimit": { "status": "pass|fail|unknown|skipped", "details": "string or null", "confidence": "high|medium|low|null" },
  "abstractWordCount": { "status": "pass|fail|unknown|skipped", "details": "string or null", "confidence": "high|medium|low|null" },
  "requiredSections": { "status": "pass|fail|unknown|skipped", "details": "string or null", "confidence": "high|medium|low|null" },
  "referenceFormat": { "status": "pass|fail|unknown|skipped", "details": "string or null", "confidence": "high|medium|low|null" },
  "anonymityRequired": { "status": "pass|fail|unknown|skipped", "details": "string or null", "confidence": "high|medium|low|null" },
  "pdfMetadataAnonymizationRequired": { "status": "pass|fail|unknown|skipped", "details": "string or null", "confidence": "high|medium|low|null" },
  "artifactLinkAnonymizationRequired": { "status": "pass|fail|unknown|skipped", "details": "string or null", "confidence": "high|medium|low|null" }
}

SUBMISSION RULES TO CHECK:
${rulesJson}`;

    await this.client.messages.create(thread.id, "user", compliancePrompt, {
      attachments: [{ fileId, tools: [{ type: "code_interpreter" }] }],
    });
    console.log(`[ComplianceCheckAgentService] Message sent to agent with PDF attachment`);

    console.log(`[ComplianceCheckAgentService] Creating and running agent...`);
    let run = await this.client.runs.create(thread.id, this.agentId);
    console.log(`[ComplianceCheckAgentService] Run created: ${run.id} (status: ${run.status})`);

    let pollCount = 0;
    const maxPollAttempts = 120; // 120 * 1.5s = 3 minutes max
    const pollTimeoutMs = 10000; // 10s timeout per individual poll request
    while (run.status === "queued" || run.status === "in_progress") {
      pollCount++;
      console.log(`[ComplianceCheckAgentService] Polling run status (attempt ${pollCount})... current: ${run.status}`);
      if (pollCount > maxPollAttempts) {
        throw new Error(`Compliance check timed out after ${pollCount} poll attempts (~${(pollCount * 1.5).toFixed(0)}s)`);
      }
      await new Promise((r) => setTimeout(r, 1500));
      try {
        run = await Promise.race([
          this.client.runs.get(thread.id, run.id),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Poll request timed out")), pollTimeoutMs))
        ]);
      } catch (err: any) {
        console.warn(`[ComplianceCheckAgentService] Poll error on attempt ${pollCount}: ${err?.message || err}. Retrying...`);
        // Don't break — retry on next iteration
      }
    }

    console.log(`[ComplianceCheckAgentService] Run completed after ${pollCount} poll(s): ${run.status}`);

    if (run.status === "failed") {
      console.error(`[ComplianceCheckAgentService] Run failed: ${run.lastError?.message}`);
      throw new Error(`Agent run failed: ${run.lastError?.message}`);
    }

    let complianceJson = "";
    let messageCount = 0;

    console.log(`[ComplianceCheckAgentService] Reading agent messages...`);
    const messages = this.client.messages.list(thread.id, { order: "asc" });
    for await (const m of messages) {
      if (m.role !== "assistant") continue;
      messageCount++;
      console.log(`[ComplianceCheckAgentService] Message ${messageCount} from assistant (${m.content.length} blocks)`);

      for (const block of m.content) {
        if (block.type === "text" && "text" in block) {
          const textBlock = block as any;
          const text = textBlock.text.value;
          console.log(`[ComplianceCheckAgentService] Text block found (${text.length} chars)`);

          // Extract JSON from response
          const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
          try {
            JSON.parse(cleaned);
            complianceJson = cleaned;
            console.log(`[ComplianceCheckAgentService] ✓ Valid JSON extracted`);
          } catch (e) {
            console.warn(`[ComplianceCheckAgentService] Text block is not valid JSON, trying next block`);
          }
        }
      }
    }

    console.log(`[ComplianceCheckAgentService] Processing complete - Found ${messageCount} assistant messages`);

    // Parse compliance report
    if (!complianceJson) {
      console.error(`[ComplianceCheckAgentService] ❌ No valid compliance report JSON found in responses`);
      throw new Error("Agent did not return a compliance report JSON");
    }

    try {
      const complianceReport = JSON.parse(complianceJson) as ComplianceReport;

      // Log summary of results
      const results = Object.entries(complianceReport).map(([rule, result]) => {
        return `${rule}: ${result.status.toUpperCase()}`;
      });
      console.log(`[ComplianceCheckAgentService] ✓ Compliance report parsed successfully`);
      console.log(`[ComplianceCheckAgentService] Results: ${results.join(', ')}`);

      return { complianceReport };
    } catch (e) {
      console.error(`[ComplianceCheckAgentService] ❌ Failed to parse compliance JSON`);
      console.error(`[ComplianceCheckAgentService] JSON content: ${complianceJson.substring(0, 500)}...`);
      throw new Error(`Invalid JSON response from compliance agent: ${e}`);
    }
  }
}
