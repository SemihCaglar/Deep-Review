import { AgentsClient } from "@azure/ai-agents";
import { ClientSecretCredential } from "@azure/identity";
import { Readable } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { EmpiricalChecklistItem } from "../../entities/EmpiricalChecklistItem";
import { ChecklistAnswerAgentResponse } from "../../types/empiricalChecklist";
import { buildChecklistAnswerPrompt } from "../prompts/empiricalChecklistAnswerPrompt";

export class EmpiricalChecklistAnswerAgentService {
  private client: AgentsClient;
  private agentId: string;

  constructor() {
    const secretsPath = path.resolve(__dirname, "../secrets.yaml");
    if (!fs.existsSync(secretsPath)) throw new Error(`Secrets file not found at ${secretsPath}`);

    const secrets: any = yaml.load(fs.readFileSync(secretsPath, "utf8"));

    if (!secrets.CHECKLIST_ANSWER_AGENT_ID) {
      throw new Error("CHECKLIST_ANSWER_AGENT_ID not found in secrets.yaml");
    }

    const credential = new ClientSecretCredential(
      secrets.AZURE_TENANT_ID,
      secrets.AZURE_CLIENT_ID,
      secrets.AZURE_CLIENT_SECRET
    );

    this.client = new AgentsClient(secrets.FOUNDRY_PROJECT_ENDPOINT, credential);
    this.agentId = secrets.CHECKLIST_ANSWER_AGENT_ID;

    console.log(`[EmpiricalChecklistAnswerAgentService] Initialized with agent: ${this.agentId}`);
  }

  async uploadPdf(pdfBuffer: Buffer, filename: string = "paper.pdf"): Promise<string> {
    console.log(`[EmpiricalChecklistAnswerAgentService] Uploading PDF (${pdfBuffer.length} bytes)...`);
    const stream = Readable.from(pdfBuffer);
    const uploadedFile = await this.client.files.upload(stream, "assistants", { fileName: filename });
    console.log(`[EmpiricalChecklistAnswerAgentService] File uploaded: ${uploadedFile.id}`);
    return uploadedFile.id;
  }

  async runChecklistAnswering(
    fileId: string,
    items: EmpiricalChecklistItem[]
  ): Promise<ChecklistAnswerAgentResponse> {
    console.log(`[EmpiricalChecklistAnswerAgentService] Starting checklist answering for ${items.length} items`);

    const checklistItemsJson = JSON.stringify(
      items.map(item => ({
        itemId: item.id,
        standard: item.standard,
        sectionTitle: item.sectionTitle,
        itemText: item.itemText,
      })),
      null,
      2
    );

    const prompt = buildChecklistAnswerPrompt(checklistItemsJson);

    const thread = await this.client.threads.create();
    console.log(`[EmpiricalChecklistAnswerAgentService] Thread created: ${thread.id}`);

    await this.client.messages.create(thread.id, "user", prompt, {
      attachments: [{ fileId, tools: [{ type: "code_interpreter" }] }],
    });

    console.log(`[EmpiricalChecklistAnswerAgentService] Creating and running agent...`);
    let run = await this.client.runs.create(thread.id, this.agentId);
    console.log(`[EmpiricalChecklistAnswerAgentService] Run created: ${run.id} (status: ${run.status})`);

    let pollCount = 0;
    while (run.status === "queued" || run.status === "in_progress") {
      pollCount++;
      console.log(`[EmpiricalChecklistAnswerAgentService] Polling (attempt ${pollCount})... status: ${run.status}`);
      await new Promise((r) => setTimeout(r, 1500));
      run = await this.client.runs.get(thread.id, run.id);
    }

    console.log(`[EmpiricalChecklistAnswerAgentService] Run completed after ${pollCount} polls: ${run.status}`);

    if (run.status === "failed") {
      console.error(`[EmpiricalChecklistAnswerAgentService] Run failed: ${run.lastError?.message}`);
      throw new Error(`Agent run failed: ${run.lastError?.message}`);
    }

    let answersJson = "";
    const messages = this.client.messages.list(thread.id, { order: "asc" });

    for await (const m of messages) {
      if (m.role !== "assistant") continue;

      for (const block of m.content) {
        if (block.type === "text" && "text" in block) {
          const text = (block as any).text.value;
          const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
          try {
            JSON.parse(cleaned);
            answersJson = cleaned;
            console.log(`[EmpiricalChecklistAnswerAgentService] Valid JSON extracted (${cleaned.length} chars)`);
          } catch {
            // keep trying other blocks
          }
        }
      }
    }

    if (!answersJson) {
      throw new Error("Agent did not return valid checklist answers JSON");
    }

    const parsed = JSON.parse(answersJson) as ChecklistAnswerAgentResponse;
    console.log(`[EmpiricalChecklistAnswerAgentService] Parsed ${parsed.answers?.length ?? 0} answers`);
    return parsed;
  }
}
