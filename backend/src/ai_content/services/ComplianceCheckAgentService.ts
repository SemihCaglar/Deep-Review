import { AgentsClient } from "@azure/ai-agents";
import { ClientSecretCredential } from "@azure/identity";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import { ComplianceReport } from "../../types/complianceReport";
import { SubmissionRulesJSON } from "../../types/submissionRules";

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
    const tmpPath = path.join(os.tmpdir(), `compliance_${Date.now()}_${filename}`);
    fs.writeFileSync(tmpPath, pdfBuffer);

    try {
      console.log(`[ComplianceCheckAgentService] Uploading PDF (${pdfBuffer.length} bytes)...`);
      const uploadedFile = await this.client.files.upload(
        fs.createReadStream(tmpPath),
        "assistants",
        { fileName: filename }
      );
      console.log(`[ComplianceCheckAgentService] File uploaded: ${uploadedFile.id}`);
      return uploadedFile.id;
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  }

  async runComplianceCheck(fileId: string, rules: SubmissionRulesJSON): Promise<ComplianceCheckResult> {
    const thread = await this.client.threads.create();

    // Build the prompt with rules JSON
    const rulesJson = JSON.stringify(rules.rules, null, 2);
    const compliancePrompt = `STEP 1: READ THE ATTACHED PDF USING PYTHON CODE
Use Python to:
- Load the attached PDF file using PyMuPDF (fitz) or pdfplumber
- Extract ALL text from the first 1-2 pages
- Find the paper title:
  → The title is at the very beginning of the document
  → It may span 1, 2, or 3 lines before the author names appear
  → IMPORTANT: Concatenate all title lines together and clean up extra whitespace
- Extract complete PDF text and metadata
- Count total number of pages
- Extract PDF metadata fields (Author, Creator, Producer, Keywords, Subject, etc.)
- Find and extract the abstract section
- Identify all section headings
- Scan for URLs and hyperlinks
- Check for author names, affiliations, and personal identifiers

STEP 2: CHECK COMPLIANCE AGAINST RULES
For each rule where "exists" is true in the provided rules JSON, determine:
- "pass" if the paper complies
- "fail" if the paper violates (include specific details and evidence)
- "unknown" if the rule applies but cannot be verified

For rules where "exists" is false, mark status as "skipped".

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

    console.log(`[ComplianceCheckAgentService] Running agent for compliance check...`);
    let run = await this.client.runs.create(thread.id, this.agentId);
    while (run.status === "queued" || run.status === "in_progress") {
      await new Promise((r) => setTimeout(r, 1500));
      run = await this.client.runs.get(thread.id, run.id);
    }

    if (run.status === "failed") {
      throw new Error(`Agent run failed: ${run.lastError?.message}`);
    }
    console.log(`[ComplianceCheckAgentService] Compliance check run completed: ${run.status}`);

    let complianceJson = "";

    const messages = this.client.messages.list(thread.id, { order: "asc" });
    for await (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const block of m.content) {
        if (block.type === "text" && "text" in block) {
          const textBlock = block as any;
          const text = textBlock.text.value;

          // Extract JSON from response
          const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
          try {
            JSON.parse(cleaned);
            complianceJson = cleaned;
          } catch {
            // Continue to next block if this isn't valid JSON
          }
        }
      }
    }

    // Parse compliance report
    if (!complianceJson) {
      throw new Error("Agent did not return a compliance report JSON");
    }

    try {
      const complianceReport = JSON.parse(complianceJson) as ComplianceReport;
      console.log(`[ComplianceCheckAgentService] Compliance report parsed successfully`);
      return { complianceReport };
    } catch (e) {
      console.error(`[ComplianceCheckAgentService] Failed to parse compliance JSON:`, complianceJson);
      throw new Error(`Invalid JSON response from compliance agent: ${e}`);
    }
  }
}
