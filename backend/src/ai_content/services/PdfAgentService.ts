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

  async runAnnotatedReview(pdfBuffer: Buffer, filename: string = "paper.pdf"): Promise<AgentReviewResult> {
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

      const thread = await this.client.threads.create();

      const reviewPrompt = `Review this attached PDF using the EASE Industry Track review guidelines.
Focus on:
1. Practicality and industry relevance.
2. Clarity of the problem statement.
3. Soundness of the proposed solution.
4. Quality of the empirical evaluation.

Provide constructive feedback for the authors.`;

      await this.client.messages.create(thread.id, "user", reviewPrompt, {
        attachments: [{ fileId: uploadedFile.id, tools: [{ type: "code_interpreter" }] }],
      });

      console.log(`[PdfAgentService] Running agent...`);
      let run = await this.client.runs.create(thread.id, this.agentId);
      while (run.status === "queued" || run.status === "in_progress") {
        await new Promise((r) => setTimeout(r, 1500));
        run = await this.client.runs.get(thread.id, run.id);
      }

      if (run.status === "failed") {
        throw new Error(`Agent run failed: ${run.lastError?.message}`);
      }
      console.log(`[PdfAgentService] Run completed: ${run.status}`);

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
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  }
}
