import { AppDataSource } from '../../data-source';
import { SubmissionRuleSet } from '../../entities/SubmissionRuleSet';
import { SubmissionRulesJSON } from '../../types/submissionRules';
import { WebsiteScraperService } from './WebsiteScraperService';
import { SubmissionRuleExtractionAIService } from './SubmissionRuleExtractionAIService';
import { cleanWebsiteHtml } from '../utils/cleanWebsiteHtml';
import { validateRulesJson } from '../utils/validateRulesJson';

export class SubmissionRuleExtractionService {
  static async extractSubmissionRules(submissionUrl: string): Promise<SubmissionRulesJSON> {
    console.log(`[SubmissionRuleExtractionService] Starting extraction for: ${submissionUrl}`);

    try {
      // 1. Check if rules already exist for this URL
      const existingRules = await this.getRulesFromDatabase(submissionUrl);
      if (existingRules) {
        console.log('[SubmissionRuleExtractionService] Rules already exist in database, returning cached result');
        return existingRules;
      }

      // 2. Fetch website HTML
      console.log('[SubmissionRuleExtractionService] Fetching website HTML...');
      const html = await WebsiteScraperService.fetchWebsiteHtml(submissionUrl);

      // 3. Clean website text
      console.log('[SubmissionRuleExtractionService] Cleaning website HTML...');
      const cleanText = cleanWebsiteHtml(html);

      // 4. Extract rules with AI
      console.log('[SubmissionRuleExtractionService] Extracting rules with AI...');
      const rulesWithoutSourceUrl = await SubmissionRuleExtractionAIService.extractRulesWithAI(
        submissionUrl,
        cleanText
      );

      // Ensure sourceUrl is set correctly
      const rules: SubmissionRulesJSON = {
        sourceUrl: submissionUrl,
        rules: rulesWithoutSourceUrl.rules,
      };

      // 5. Validate rules JSON
      console.log('[SubmissionRuleExtractionService] Validating rules JSON...');
      const validatedRules = validateRulesJson(rules);

      // 6. Save rules to database
      console.log('[SubmissionRuleExtractionService] Saving rules to database...');
      await this.saveRulesToDatabase(validatedRules);

      console.log('[SubmissionRuleExtractionService] Successfully extracted and saved rules');
      return validatedRules;
    } catch (error) {
      console.error('[SubmissionRuleExtractionService] Error during extraction:', error);
      throw error;
    }
  }

  static async getRulesFromDatabase(sourceUrl: string): Promise<SubmissionRulesJSON | null> {
    try {
      const repo = AppDataSource.getRepository(SubmissionRuleSet);
      const ruleSet = await repo.findOne({ where: { sourceUrl } });

      if (ruleSet) {
        return {
          sourceUrl: ruleSet.sourceUrl,
          rules: ruleSet.rules,
        };
      }

      return null;
    } catch (error) {
      console.error('[SubmissionRuleExtractionService] Error fetching from database:', error);
      return null;
    }
  }

  private static async saveRulesToDatabase(rules: SubmissionRulesJSON): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(SubmissionRuleSet);

      // Check if already exists
      const existing = await repo.findOne({ where: { sourceUrl: rules.sourceUrl } });

      if (existing) {
        // Update existing
        existing.rules = rules.rules;
        existing.updatedAt = new Date();
        await repo.save(existing);
      } else {
        // Create new
        const ruleSet = repo.create({
          sourceUrl: rules.sourceUrl,
          rules: rules.rules,
        });
        await repo.save(ruleSet);
      }

      console.log('[SubmissionRuleExtractionService] Rules saved to database');
    } catch (error) {
      console.error('[SubmissionRuleExtractionService] Error saving to database:', error);
      throw error;
    }
  }

  static async getAllRules(): Promise<SubmissionRulesJSON[]> {
    try {
      const repo = AppDataSource.getRepository(SubmissionRuleSet);
      const ruleSets = await repo.find();

      return ruleSets.map(rs => ({
        sourceUrl: rs.sourceUrl,
        rules: rs.rules,
      }));
    } catch (error) {
      console.error('[SubmissionRuleExtractionService] Error fetching all rules:', error);
      throw error;
    }
  }

  static async deleteRules(sourceUrl: string): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(SubmissionRuleSet);
      await repo.delete({ sourceUrl });
      console.log('[SubmissionRuleExtractionService] Rules deleted for:', sourceUrl);
    } catch (error) {
      console.error('[SubmissionRuleExtractionService] Error deleting rules:', error);
      throw error;
    }
  }
}
