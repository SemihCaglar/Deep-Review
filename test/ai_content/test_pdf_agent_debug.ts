import { PdfAgentService } from '../../backend/src/ai_content/services/PdfAgentService';
import { ClientSecretCredential } from "@azure/identity";
import { AgentsClient } from "@azure/ai-agents";
import yaml from "js-yaml";
import fs from 'fs';
import path from 'path';

async function test() {
  console.log('🧪 Testing PDF Agent - Debug Mode\n');

  const testPdfPath = path.join(__dirname, 'test_input.pdf');
  
  if (!fs.existsSync(testPdfPath)) {
    console.error('❌ Test PDF not found:', testPdfPath);
    process.exit(1);
  }

  const pdfBuffer = fs.readFileSync(testPdfPath);
  console.log(`✅ Loaded test PDF: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB\n`);

  try {
    // Initialize secrets
    const secretsPath = path.resolve(__dirname, 'secrets.yaml');
    const secrets: any = yaml.load(fs.readFileSync(secretsPath, "utf8"));
    
    const credential = new ClientSecretCredential(
      secrets.AZURE_TENANT_ID,
      secrets.AZURE_CLIENT_ID,
      secrets.AZURE_CLIENT_SECRET
    );

    const client = new AgentsClient(secrets.FOUNDRY_PROJECT_ENDPOINT, credential);
    const agentId = secrets.AGENT_ID;

    // Step 1: Upload file
    console.log('1️⃣  Uploading PDF...');
    const tmpPath = path.join('/tmp', `test_${Date.now()}.pdf`);
    fs.writeFileSync(tmpPath, pdfBuffer);
    
    const uploadedFile = await client.files.upload(
      fs.createReadStream(tmpPath),
      "assistants",
      { fileName: 'test_paper.pdf' }
    );
    console.log(`✅ File uploaded: ${uploadedFile.id}\n`);

    // Step 2: Create thread and run simple test
    console.log('2️⃣  Creating thread and running agent...');
    const thread = await client.threads.create();
    console.log(`✅ Thread created: ${thread.id}`);

    const prompt = `Review the attached PDF paper. Provide a brief summary.`;
    
    await client.messages.create(thread.id, "user", prompt, {
      attachments: [{ fileId: uploadedFile.id, tools: [{ type: "code_interpreter" }] }],
    });
    console.log('✅ Message sent');

    let run = await client.runs.create(thread.id, agentId);
    console.log(`✅ Run created: ${run.id} (status: ${run.status})`);

    // Poll for completion
    let pollCount = 0;
    while (run.status === "queued" || run.status === "in_progress") {
      await new Promise((r) => setTimeout(r, 2000));
      run = await client.runs.get(thread.id, run.id);
      pollCount++;
      console.log(`   Poll ${pollCount}: status = ${run.status}`);
      if (pollCount > 60) {
        console.log('⏱️  Timeout - agent taking too long');
        break;
      }
    }

    console.log(`\n✅ Run completed with status: ${run.status}`);
    
    if (run.status === "failed") {
      console.error(`❌ Agent failed:`, run.lastError);
    } else if (run.status === "completed") {
      // Get messages
      const messages = client.messages.list(thread.id, { order: "asc" });
      let messageCount = 0;
      for await (const m of messages) {
        messageCount++;
        console.log(`\nMessage ${messageCount} (${m.role}):`);
        for (const block of m.content) {
          if (block.type === "text" && "text" in block) {
            const textBlock = block as any;
            console.log(textBlock.text.value);
          }
        }
      }
    }

    // Cleanup
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

test();
