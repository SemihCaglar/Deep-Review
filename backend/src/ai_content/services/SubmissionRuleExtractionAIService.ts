import { AzureOpenAI } from 'openai';
import { SUBMISSION_RULE_EXTRACTION_SYSTEM_PROMPT, buildUserPrompt } from '../prompts/submissionRuleExtractionPrompt';
import { SubmissionRulesJSON } from '../../types/submissionRules';
import { AzureOpenAIClient } from '../utils/AzureOpenAIClient';

export class SubmissionRuleExtractionAIService {
  static async extractRulesWithAI(sourceUrl: string, websiteText: string): Promise<SubmissionRulesJSON> {
    console.log(`[SubmissionRuleExtractionAIService] Extracting rules from: ${sourceUrl}`);

    try {
      const userPrompt = buildUserPrompt(sourceUrl, websiteText);

      const responseText = await AzureOpenAIClient.sendPrompt(
        SUBMISSION_RULE_EXTRACTION_SYSTEM_PROMPT,
        userPrompt
      );

      console.log('[SubmissionRuleExtractionAIService] AI response received');

      // Parse JSON response
      const jsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const rulesJson = JSON.parse(jsonStr);

      return rulesJson as SubmissionRulesJSON;
    } catch (error) {
      console.error('[SubmissionRuleExtractionAIService] Failed to extract rules:', error);
      throw new Error(`Failed to extract rules: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
