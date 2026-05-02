const https = require('https');
const fs = require('node:fs');
const yaml = require('js-yaml');
const path = require('node:path');

async function testPath(url, key) {
  return new Promise((resolve) => {
    const options = {
      headers: {
        'api-key': key,
        'Accept': 'application/json'
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, data: data });
      });
    }).on('error', (err) => {
      resolve({ status: 500, data: err.message });
    });
  });
}

async function debug() {
  const secretsPath = path.join(__dirname, 'secrets.yaml');
  const secrets = yaml.load(fs.readFileSync(secretsPath, 'utf8'));
  const endpoint = secrets.FOUNDRY_PROJECT_ENDPOINT;
  const key = secrets.AZURE_OPENAI_KEY;
  const agentId = secrets.AGENT_ID;

  const url = `${endpoint}/agents/${agentId}/endpoint/protocols/openai/models?api-version=v1`;
  const res = await testPath(url, key);
  console.log(`Result: Status ${res.status}`);
  console.log(`Data: ${res.data.substring(0, 200)}`);
}

debug();
