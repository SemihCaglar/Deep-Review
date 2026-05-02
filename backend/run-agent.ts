import "dotenv/config";
import { AIProjectClient } from "@azure/ai-projects";
import { ClientSecretCredential } from "@azure/identity";
import fs from "node:fs";

async function runAgentConversation() {
  const endpoint = process.env.FOUNDRY_PROJECT_ENDPOINT!;
  const agentId = process.env.AGENT_ID!;
<truncated 3731 bytes>