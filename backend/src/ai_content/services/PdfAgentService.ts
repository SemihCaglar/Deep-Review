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
  paperTitle?: string;
  selectedStandards: Array<{ label: string; confidence: string; evidence: string }>;
}

const CHECKLIST_PROMPT = `STEP 1: READ THE ATTACHED PDF USING PYTHON CODE
Use Python to:
- Load the attached PDF file using PyPDF2 or pdfplumber
- Extract ALL text from the first 1-2 pages
- Find the COMPLETE paper title:
  → The title is at the very beginning and may span multiple lines
  → Concatenate all title lines together and remove extra whitespace
  → The title ends when author names/affiliations appear
- Understand the research methodology and type

STEP 2: ANALYZE AND RETURN JSON ONLY
Analyze the paper content and select the applicable SIGSOFT Empirical Standards checklist categories.

If the manuscript proposes and assesses a new artifact (e.g. a tool) select Engineering Research and the empirical method(s) used to assess the artifact. If the manuscript reports a multimethodology or mixed-methods study, select Multimethodology and both methods. If the manuscript uses a method not listed here, choose the last option.

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

Return ONLY this exact JSON (no markdown, no explanations):
{
  "paperTitle": "Extracted paper title from the PDF",
  "selectedStandards": [
    { "label": "Engineering Research", "confidence": "high", "evidence": "Short evidence from the paper" }
  ]
}

Rules:
- Select only standards clearly supported by the paper.
- Use confidence: "high", "medium", or "low".
- Keep evidence short and concrete.
- label must exactly match one of the 19 standards listed above.
- Return JSON only - no other text.`;

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


  async runAnnotatedReview(fileId: string): Promise<AgentReviewResult> {
    const thread = await this.client.threads.create();

    const reviewPrompt = `You are a critical academic peer reviewer.

STEP 1: READ THE ATTACHED PDF USING PYTHON CODE
Use Python to:
- Load the attached PDF file using PyPDF2 or pdfplumber
- Extract ALL text from the first 1-2 pages
- Find the paper title:
  → The title is at the very beginning of the document
  → It may span 1, 2, or 3 lines before the author names appear
  → IMPORTANT: Concatenate all title lines together and clean up extra whitespace
  → Example: if you see "SERSEM: Selective Entropy-Weighted Scoring for Membership" on line 1
             and "Inference in Code Language Models" on line 2,
             the full title is "SERSEM: Selective Entropy-Weighted Scoring for Membership Inference in Code Language Models"
- Identify all major sections and their content

STEP 2: WRITE THE REVIEW in EXACTLY this format (with NO preamble or postamble):

## Paper Title
[The EXACT paper title extracted from the PDF]

## Overall Decision
[Your decision: Strong Accept / Accept / Weak Accept / Weak Reject / Reject]

## Summary of Contribution
[2-3 sentences describing what the paper contributes]

## Critical Review
### Methodology & Validity
[Critical analysis of research methods and validity]

### Industrial Relevance
[Analysis of practical importance and applicability]

### Clarity & Presentation
[Assessment of writing quality and clarity]

## Prioritized Improvements
### High Priority
[List items that must be addressed]

### Medium Priority
[List items that should be addressed]

### Low Priority
[List items that could be addressed]

## Scope Analysis
### Underemphasized Areas
[What is under-explored in the paper]

### Overemphasized Areas
[What receives too much attention relative to importance]

STEP 3: CREATE AN ANNOTATED PDF
- Read the original PDF
- Create a new PDF with annotations/highlights marking key sections and issues from your review
- Save it as output

CRITICAL RULES:
- You MUST extract and use the actual paper title from the PDF, not a generic title
- Output only the review text in Step 2 format - no preamble like "Certainly" or postamble like "I will"
- Start immediately with "## Paper Title"
- Then create the annotated PDF`;

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

    // Clean preamble and postamble from review text
    let cleanedText = summaryText.trim();

    // Remove preamble (everything before "## Paper Title")
    const paperTitleMatch = cleanedText.match(/^[\s\S]*?(## Paper Title)/i);
    if (paperTitleMatch && paperTitleMatch.index !== undefined && paperTitleMatch.index > 0) {
      cleanedText = cleanedText.substring(paperTitleMatch.index);
    }

    // Remove postamble (everything after completion markers)
    // Look for patterns that mark the end of the scope analysis section
    const postambleMatch = cleanedText.match(/(\n\n\[Annotated PDF|The review is complete|Next, I will|Annotation complete)/i);
    if (postambleMatch && postambleMatch.index !== undefined) {
      cleanedText = cleanedText.substring(0, postambleMatch.index);
    }

    cleanedText = cleanedText.trim();

    return { summaryText: cleanedText, annotatedPdfBuffer };
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
      console.log(`[PdfAgentService] Checklist analysis: paperTitle="${result.paperTitle}", ${result.selectedStandards.length} standards`);
      return result;
    } catch (e) {
      console.error(`[PdfAgentService] Failed to parse checklist JSON:`, jsonText);
      throw new Error(`Invalid JSON response from checklist agent: ${e}`);
    }
  }
}
