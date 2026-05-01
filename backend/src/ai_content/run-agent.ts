import { AgentsClient } from "@azure/ai-agents";
import { ClientSecretCredential } from "@azure/identity";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

async function runAgentConversation() {
  // Load secrets from secrets.yaml
  const secretsPath = path.join(__dirname, "secrets.yaml");
  console.log(`Loading secrets from: ${secretsPath}`);

  if (!fs.existsSync(secretsPath)) {
    throw new Error(`Secrets file not found at ${secretsPath}`);
  }

  const secrets = yaml.load(fs.readFileSync(secretsPath, "utf8")) as any;

  const endpoint = secrets.FOUNDRY_PROJECT_ENDPOINT;
  const agentId = secrets.AGENT_ID;

  // Resolve PDF path
  let pdfPath = secrets.PDF_PATH;
  if (pdfPath.startsWith("./")) {
    pdfPath = path.resolve(__dirname, "../../", pdfPath);
  } else if (!path.isAbsolute(pdfPath)) {
    pdfPath = path.resolve(__dirname, pdfPath);
  }

  console.log(`Endpoint: ${endpoint}`);
  console.log(`Agent ID: ${agentId}`);
  console.log(`PDF Path: ${pdfPath}`);

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found at ${pdfPath}`);
  }

  const credential = new ClientSecretCredential(
    secrets.AZURE_TENANT_ID,
    secrets.AZURE_CLIENT_ID,
    secrets.AZURE_CLIENT_SECRET
  );

  console.log("Initializing AgentsClient...");
  const client = new AgentsClient(endpoint, credential);

  // Step 1: Get the agent
  console.log("Step 1: Retrieving agent...");
  const agent = await client.getAgent(agentId);
  console.log(`Step 1 Complete: Retrieved agent: ${agent.name}`);

  // Step 2: Upload the PDF file
  console.log(`Step 2: Uploading PDF: ${pdfPath}`);
  const uploadedFile = await client.files.upload(
    fs.createReadStream(pdfPath),
    "assistants",
    { fileName: path.basename(pdfPath) }
  );
  console.log(`Step 2 Complete: File uploaded: ${uploadedFile.id}`);

  // Step 3: Create a thread
  console.log("Step 3: Creating thread...");
  const thread = await client.threads.create();
  console.log(`Step 3 Complete: Created thread, ID: ${thread.id}`);

  // Step 4: Create a message with PDF attached
  const reviewPrompt = `Review this attached PDF using the EASE Industry Track review guidelines. 
Focus on:
1. Practicality and industry relevance.
2. Clarity of the problem statement.
3. Soundness of the proposed solution.
4. Quality of the empirical evaluation.

Provide constructive feedback for the authors.`;

  console.log("Step 4: Adding message with PDF attachment...");
  const message = await client.messages.create(
    thread.id,
    "user",
    reviewPrompt,
    {
      attachments: [
        {
          fileId: uploadedFile.id,
          tools: [{ type: "code_interpreter" }],
        },
      ],
    }
  );
  console.log(`Step 4 Complete: Created message, ID: ${message.id}`);

  // Step 5: Create and poll the run
  console.log("Step 5: Starting run...");
  let run = await client.runs.create(thread.id, agent.id);
  console.log(`Step 5: Run started with status: ${run.status}`);

  // Poll until terminal status
  while (run.status === "queued" || run.status === "in_progress") {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    run = await client.runs.get(thread.id, run.id);
    console.log(`  Polling... status: ${run.status}`);
  }

  if (run.status === "failed") {
    console.error(`Run failed:`, run.lastError);
    return;
  }

  console.log(`Step 5 Complete: Run completed with status: ${run.status}`);

  // Step 6: Retrieve and display messages, extract any output files
  console.log("Step 6: Retrieving messages...");
  const outputDir = path.dirname(pdfPath);
  const outputPath = path.join(outputDir, "annotated_output.pdf");
  let downloadedFile: string | null = null;

  console.log("\n--- AGENT REVIEW ---\n");
  const messages = client.messages.list(thread.id, { order: "asc" });
  for await (const m of messages) {
    for (const block of m.content) {
      if (block.type === "text" && "text" in block) {
        const textBlock = block as any;
        console.log(`[${m.role}]: ${textBlock.text.value}`);

        // Download any file_path annotations produced by code_interpreter
        if (m.role === "assistant" && textBlock.text.annotations) {
          for (const annotation of textBlock.text.annotations) {
            if (annotation.type === "file_path" && annotation.filePath?.fileId) {
              const fileId: string = annotation.filePath.fileId;
              console.log(`\nStep 7: Downloading output file ${fileId} -> ${outputPath}`);
              const streamResponse = await client.files.getContent(fileId).asNodeStream();
              if (!streamResponse.body) throw new Error("No body in file download response");
              const chunks: Buffer[] = [];
              for await (const chunk of streamResponse.body) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array | string));
              }
              fs.writeFileSync(outputPath, Buffer.concat(chunks));
              downloadedFile = outputPath;
              console.log(`Step 7 Complete: Saved to ${outputPath}`);
            }
          }
        }
      }
    }
  }
  console.log("\n--------------------\n");

  if (downloadedFile) {
    console.log(`Annotated PDF saved to: ${downloadedFile}`);
  } else {
    console.log("No output file was generated by the agent.");
  }
}

runAgentConversation().catch((err) => {
  console.error("FATAL ERROR:");
  console.error(err);
  process.exit(1);
});
