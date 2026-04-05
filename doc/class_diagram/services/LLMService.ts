export class LLMService {
  /**
   * Sends a generic chat completion request to the LLM and returns the text response.
   */
  generateCompletion(prompt: string, modelType?: string): string {
    return '';
  }

  /**
   * Sends a request to the LLM and forces the output to match a specific structured JSON configuration.
   */
  generateStructuredCompletion(prompt: string, jsonSchema: any, modelType?: string): any {
    return null;
  }
}
