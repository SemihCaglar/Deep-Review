import fs from 'node:fs';
import https from 'node:https';
import yaml from 'js-yaml';
import path from 'node:path';

async function debugEndpoint() {
  const secretsPath = path.join(__dirname, 'secrets.yaml');
  const secrets = yaml.load(fs.readFileSync(secretsPath, 'utf8')) as any;

  const url = `${secrets.FOUNDRY_PROJECT_ENDPOINT}/openai/v1/models`;
  console.log(`Testing URL: ${url}`);

  try {
    const response = await getJson(url, {
        'api-key': secrets.AZURE_OPENAI_KEY,
        'Accept': 'application/json'
    });
    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.log('Error Status:', error.status);
    console.log('Error Data:', JSON.stringify(error.data, null, 2));
  }
}

function getJson(url: string, headers: Record<string, string>): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers }, response => {
      let rawData = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        rawData += chunk;
      });
      response.on('end', () => {
        const data = rawData ? JSON.parse(rawData) : null;
        const status = response.statusCode ?? 0;

        if (status >= 400) {
          reject({ status, data });
          return;
        }

        resolve({ status, data });
      });
    });

    request.on('error', reject);
  });
}

debugEndpoint();
