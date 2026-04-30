import { AzureOpenAI } from 'openai';
import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';

export class AzureOpenAIClient {
  private static client: AzureOpenAI | null = null;
  private static modelName: string = '';

  /**
   * Initializes the Azure OpenAI Client reading from ai_content/secrets.yaml.
   */
  private static initClient() {
    if (this.client) return;

    try {
      // Find the ai_content folder which is at the root of the project
      // backend/src/utils/AzureOpenAIClient.ts -> ../../../ai_content/secrets.yaml
      const secretsPath = path.resolve(__dirname, '../../../ai_content/secrets.yaml');
      const fileContents = fs.readFileSync(secretsPath, 'utf8');
      const secrets: any = yaml.load(fileContents);

      const endpoint = secrets.AZURE_OPENAI_ENDPOINT;
      this.modelName = secrets.AZURE_OPENAI_MODEL;
      const deployment = secrets.AZURE_OPENAI_DEPLOYMENT;
      const apiKey = secrets.AZURE_OPENAI_KEY;
      const apiVersion = secrets.AZURE_OPENAI_API_VERSION;

      const options = { endpoint, apiKey, deployment, apiVersion };
      this.client = new AzureOpenAI(options);
      console.log(`[AzureOpenAIClient] Successfully initialized with model: ${this.modelName}`);
    } catch (error) {
      console.error('[AzureOpenAIClient] Failed to initialize client. Make sure secrets.yaml exists.', error);
      throw error;
    }
  }

  /**
   * Sends a prompt to the Azure OpenAI model and returns the response content.
   */
  static async sendPrompt(systemMessage: string, userMessage: string): Promise<string> {
    this.initClient();
    
    if (!this.client) {
      throw new Error("AzureOpenAI Client is not initialized.");
    }

    try {
      const response = await this.client.chat.completions.create({
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userMessage }
        ],
        max_completion_tokens: 4096,
        model: this.modelName
      });

      return response.choices[0].message.content || '';
    } catch (error) {
      console.error('[AzureOpenAIClient] Error during chat completion:', error);
      throw error;
    }
  }
}
