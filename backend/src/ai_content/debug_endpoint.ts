import axios from 'axios';
import fs from 'node:fs';
import yaml from 'js-yaml';
import path from 'node:path';

async function debugEndpoint() {
  const secretsPath = path.join(__dirname, 'secrets.yaml');
  const secrets = yaml.load(fs.readFileSync(secretsPath, 'utf8')) as any;

  const url = `${secrets.FOUNDRY_PROJECT_ENDPOINT}/openai/v1/models`;
  console.log(`Testing URL: ${url}`);

  try {
    const response = await axios.get(url, {
      headers: {
        'api-key': secrets.AZURE_OPENAI_KEY,
        'Accept': 'application/json'
      }
    });
    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.log('Error Status:', error.response?.status);
    console.log('Error Data:', JSON.stringify(error.response?.data, null, 2));
  }
}

debugEndpoint();
