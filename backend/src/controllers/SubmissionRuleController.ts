import { Request, Response } from 'express';
import { SubmissionRuleExtractionService } from '../ai_content/services/SubmissionRuleExtractionService';

export class SubmissionRuleController {
  static async extractRules(req: Request, res: Response): Promise<void> {
    try {
      const { submissionUrl } = req.body;

      if (!submissionUrl || typeof submissionUrl !== 'string') {
        res.status(400).json({
          success: false,
          error: 'submissionUrl is required and must be a string',
        });
        return;
      }

      const rules = await SubmissionRuleExtractionService.extractSubmissionRules(submissionUrl);

      res.status(200).json({
        success: true,
        data: rules,
      });
    } catch (error) {
      console.error('[SubmissionRuleController] Error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  static async getRules(req: Request, res: Response): Promise<void> {
    try {
      const { submissionUrl } = req.query;

      if (!submissionUrl || typeof submissionUrl !== 'string') {
        res.status(400).json({
          success: false,
          error: 'submissionUrl query parameter is required',
        });
        return;
      }

      const rules = await SubmissionRuleExtractionService.getRulesFromDatabase(submissionUrl);

      if (!rules) {
        res.status(404).json({
          success: false,
          error: 'Rules not found for the given URL',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: rules,
      });
    } catch (error) {
      console.error('[SubmissionRuleController] Error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  static async getAllRules(req: Request, res: Response): Promise<void> {
    try {
      const rules = await SubmissionRuleExtractionService.getAllRules();

      res.status(200).json({
        success: true,
        data: rules,
      });
    } catch (error) {
      console.error('[SubmissionRuleController] Error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  static async deleteRules(req: Request, res: Response): Promise<void> {
    try {
      const { submissionUrl } = req.body;

      if (!submissionUrl || typeof submissionUrl !== 'string') {
        res.status(400).json({
          success: false,
          error: 'submissionUrl is required and must be a string',
        });
        return;
      }

      await SubmissionRuleExtractionService.deleteRules(submissionUrl);

      res.status(200).json({
        success: true,
        message: 'Rules deleted successfully',
      });
    } catch (error) {
      console.error('[SubmissionRuleController] Error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
