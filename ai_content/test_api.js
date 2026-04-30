import { AzureOpenAI } from "openai";
import fs from "fs";
import yaml from "js-yaml";

const fileContents = fs.readFileSync('./secrets.yaml', 'utf8');
const secrets = yaml.load(fileContents);

const endpoint = secrets.AZURE_OPENAI_ENDPOINT;
const modelName = secrets.AZURE_OPENAI_MODEL;
const deployment = secrets.AZURE_OPENAI_DEPLOYMENT;
const apiKey = secrets.AZURE_OPENAI_KEY;
const apiVersion = secrets.AZURE_OPENAI_API_VERSION;

export async function main() {
  const options = { endpoint, apiKey, deployment, apiVersion }

  const client = new AzureOpenAI(options);

  const response = await client.chat.completions.create({
    messages: [
      { role:"system", content: "You are a helpful assistant." },
      { role:"user", content: "I am going to Paris, what should I see?" }
    ],
    max_completion_tokens: 16384,
    model: modelName
  });

  if (response?.error !== undefined && response.status !== "200") {
    throw response.error;
  }
  console.log(response.choices[0].message.content);
}

main().catch((err) => {
  console.error("The sample encountered an error:", err);
});
