const { AzureOpenAI } = require("openai");
const fs = require("fs");
const yaml = require("js-yaml");
const path = require("path");

const secretsPath = path.join(__dirname, "secrets.yaml");
const secrets = yaml.load(fs.readFileSync(secretsPath, "utf8"));

// Try the Foundry project's OpenAI-compatible endpoint
const endpoints = [
  secrets.AZURE_OPENAI_ENDPOINT,
  "https://cs319-ai.openai.azure.com/",
  secrets.FOUNDRY_PROJECT_ENDPOINT + "/openai",
];

async function tryEndpoint(endpoint) {
  console.log(`\nTrying endpoint: ${endpoint}`);
  const openai = new AzureOpenAI({
    endpoint,
    apiKey: secrets.AZURE_OPENAI_KEY,
    apiVersion: secrets.AZURE_OPENAI_API_VERSION || "2024-12-01-preview",
  });
  try {
    const list = await openai.beta.assistants.list();
    console.log(`  -> Found ${list.data.length} assistants:`);
    for (const a of list.data) {
      console.log(`     - ID: ${a.id}, Name: ${a.name}`);
    }
  } catch (err) {
    console.error(`  -> Error: ${err.status} ${err.message}`);
  }
}

(async () => {
  for (const ep of endpoints) {
    await tryEndpoint(ep);
  }
})();
