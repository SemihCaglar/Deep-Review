import { AgentsClient } from "@azure/ai-agents";
import { ClientSecretCredential } from "@azure/identity";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";

export interface AgentReviewResult {
  summaryText: string;
  annotatedPdfBuffer: Buffer | null;
}

export interface ChecklistAnalysisResult {
  selectedStandards: Array<{ label: string; confidence: string; evidence: string }>;
}

const CHECKLIST_PROMPT = `Analyze the attached academic paper PDF and select the applicable SIGSOFT Empirical Standards checklist categories.
Return ONLY valid JSON. Do not include markdown. Do not include explanations outside JSON.

If your manuscript proposes and assesses a new artifact (e.g. a tool) select Engineering Research and the empirical method(s) used to assess the artifact. If your manuscript reports a multimethodology or mixed-methods study, select Multimethodology and both methods. If your manuscript uses a method not listed here, choose the last option.

Possible standards:
- Engineering Research
- Multimethodology or mixed methods
- Action Research
- Case Study
- Grounded Theory
- Qualitative Survey
- Benchmarking
- Data Science
- Experiment with human participants
- Optimization Study
- Quantitative Longitudinal Study
- Quantitative Simulation
- Questionnaire Survey
- Repository Mining
- Case Survey
- Systematic Literature Review
- Meta Science
- Replication
- Empirical Method Not Listed Above

Return this exact JSON schema:
{
  "selectedStandards": [
    { "label": "Engineering Research", "confidence": "high", "evidence": "Short evidence from the paper" }
  ]
}

Rules:
- Select only standards clearly supported by the paper.
- Use confidence: "high", "medium", or "low".
- Keep evidence short and concrete.
- label must exactly match one of the 19 standards listed above.
- Return JSON only.`;

export class PdfAgentService {
  private client: AgentsClient;
  private agentId: string;

  constructor() {
    const secretsPath = path.resolve(__dirname, "../secrets.yaml");
    if (!fs.existsSync(secretsPath)) throw new Error(`Secrets file not found at ${secretsPath}`);

    const secrets: any = yaml.load(fs.readFileSync(secretsPath, "utf8"));

    const credential = new ClientSecretCredential(
      secrets.AZURE_TENANT_ID,
      secrets.AZURE_CLIENT_ID,
      secrets.AZURE_CLIENT_SECRET
    );

    this.client = new AgentsClient(secrets.FOUNDRY_PROJECT_ENDPOINT, credential);
    this.agentId = secrets.AGENT_ID;

    console.log(`[PdfAgentService] Initialized with agent: ${this.agentId}`);
  }

  async uploadPdf(pdfBuffer: Buffer, filename: string = "paper.pdf"): Promise<string> {
    const tmpPath = path.join(os.tmpdir(), `bilsen_${Date.now()}_${filename}`);
    fs.writeFileSync(tmpPath, pdfBuffer);

    try {
      console.log(`[PdfAgentService] Uploading PDF (${pdfBuffer.length} bytes)...`);
      const uploadedFile = await this.client.files.upload(
        fs.createReadStream(tmpPath),
        "assistants",
        { fileName: filename }
      );
      console.log(`[PdfAgentService] File uploaded: ${uploadedFile.id}`);
      return uploadedFile.id;
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  }


  async runAnnotatedReview(fileId: string, venueName: string = "the conference"): Promise<AgentReviewResult> {
    const thread = await this.client.threads.create();

    const reviewPrompt = `You are a critical academic peer reviewer for ${venueName}.

Review the attached PDF paper. Start with the paper title, then provide a structured peer review with:
1. Overall decision (Strong Accept / Accept / Weak Accept / Weak Reject / Reject)
2. Summary of contribution (2-3 sentences)
3. Critical review with attack points (Methodology & Validity, Industrial Relevance, Clarity & Presentation)
4. Prioritized improvements (High/Medium/Low priority)
5. Scope analysis (Underemphasized and Overemphasized areas)

Be tough but fair.

After writing the review, create an annotated version of the PDF highlighting the key issues and save it as output.`;

    await this.client.messages.create(thread.id, "user", reviewPrompt, {
      attachments: [{ fileId, tools: [{ type: "code_interpreter" }] }],
    });

    console.log(`[PdfAgentService] Running agent for review...`);
    let run = await this.client.runs.create(thread.id, this.agentId);
    while (run.status === "queued" || run.status === "in_progress") {
      await new Promise((r) => setTimeout(r, 1500));
      run = await this.client.runs.get(thread.id, run.id);
    }

    if (run.status === "failed") {
      throw new Error(`Agent run failed: ${run.lastError?.message}`);
    }
    console.log(`[PdfAgentService] Review run completed: ${run.status}`);

    let summaryText = "";
    let annotatedPdfBuffer: Buffer | null = null;

    const messages = this.client.messages.list(thread.id, { order: "asc" });
    for await (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const block of m.content) {
        if (block.type === "text" && "text" in block) {
          const textBlock = block as any;
          summaryText += textBlock.text.value + "\n\n";

          for (const annotation of (textBlock.text.annotations || [])) {
            if (annotation.type === "file_path" && annotation.filePath?.fileId) {
              console.log(`[PdfAgentService] Downloading annotated PDF from agent...`);
              const streamResponse = await this.client.files.getContent(annotation.filePath.fileId).asNodeStream();
              if (streamResponse.body) {
                const chunks: Buffer[] = [];
                for await (const chunk of streamResponse.body) {
                  chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array | string));
                }
                annotatedPdfBuffer = Buffer.concat(chunks);
                console.log(`[PdfAgentService] Annotated PDF downloaded (${annotatedPdfBuffer.length} bytes)`);
              }
            }
          }
        }
      }
    }

    return { summaryText: summaryText.trim(), annotatedPdfBuffer };
  }

  async runChecklistAnalysis(fileId: string): Promise<ChecklistAnalysisResult> {
    const thread = await this.client.threads.create();

    await this.client.messages.create(thread.id, "user", CHECKLIST_PROMPT, {
      attachments: [{ fileId, tools: [{ type: "code_interpreter" }] }],
    });

    console.log(`[PdfAgentService] Running agent for checklist analysis...`);
    let run = await this.client.runs.create(thread.id, this.agentId);
    while (run.status === "queued" || run.status === "in_progress") {
      await new Promise((r) => setTimeout(r, 1500));
      run = await this.client.runs.get(thread.id, run.id);
    }

    if (run.status === "failed") {
      throw new Error(`Agent run failed: ${run.lastError?.message}`);
    }
    console.log(`[PdfAgentService] Checklist run completed: ${run.status}`);

    let jsonText = "";

    const messages = this.client.messages.list(thread.id, { order: "asc" });
    for await (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const block of m.content) {
        if (block.type === "text" && "text" in block) {
          const textBlock = block as any;
          jsonText = textBlock.text.value;
          break;
        }
      }
    }

    try {
      const cleanedText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
      const result = JSON.parse(cleanedText) as ChecklistAnalysisResult;
      return result;
    } catch (e) {
      console.error(`[PdfAgentService] Failed to parse checklist JSON:`, jsonText);
      throw new Error(`Invalid JSON response from checklist agent: ${e}`);
    }
  }
}
