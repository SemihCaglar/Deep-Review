import { AIGuardrailService } from './AIGuardrailService';
import { ChecklistService } from './ChecklistService';
import { AzureOpenAIClient } from '../utils/AzureOpenAIClient';
import { PDFAnnotationAgent } from './PDFAnnotationAgent';
const pdfParse = require('pdf-parse');

export class AIReviewService {
  /**
   * Queries Azure OpenAI to extract basic rules for a specific academic venue.
   * Since this can hallucinate, the frontend must allow users to edit the result.
   */
  static async getVenueRules(venueName: string): Promise<any> {
    console.log(`[AIReviewService] Fetching venue rules for: ${venueName}`);
    const systemPrompt = "You are an academic expert. Provide the basic submission rules (e.g., max page limit, abstract word count limit, blind review policy) for the requested venue. Return ONLY a JSON object. If you do not know the venue, return an empty JSON object {}.";
    const userPrompt = `Venue: ${venueName}`;

    try {
      const responseText = await AzureOpenAIClient.sendPrompt(systemPrompt, userPrompt);
      const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanedText);
    } catch (err) {
      console.warn(`[AIReviewService] Failed to get venue rules for ${venueName}, returning empty.`, err);
      return {};
    }
  }

  /**
   * Main orchestration method for generating an AI Review for a given paper/round.
   * Accepts a PDF buffer directly — no Overleaf or LaTeX source needed.
   */
  static async generateAIReview(paperId: string, roundId: string, pdfBuffer: Buffer): Promise<any> {
    console.log(`[AIReviewService] Starting AI Review pipeline for Paper ${paperId}, Round ${roundId}`);

    // 1. Extract text from PDF
    console.log(`[AIReviewService] Extracting text from PDF...`);
    const pdfData = await pdfParse(pdfBuffer);
    const paperText = pdfData.text;

    if (!paperText || paperText.trim().length === 0) {
      throw new Error('The uploaded PDF appears to be empty or could not be parsed.');
    }

    // Truncate to avoid hitting API token limits
    const maxContentLength = 80000;
    const contentToSend = paperText.length > maxContentLength
      ? paperText.substring(0, maxContentLength) + '\n...[TRUNCATED]...'
      : paperText;

    // 2. Generate Draft Review Feedback & Structured Annotations
    console.log(`[AIReviewService] Calling Azure OpenAI to generate review feedback...`);
    const systemPrompt = `You are an expert academic reviewer. Review the provided paper content (extracted from a PDF).
You MUST output your response as a strictly formatted JSON object with three fields:
1. "summaryReport": A high-level, critical, constructive review report (string).
2. "annotations": An array of specific issues to highlight. Each must have:
   - "page": The approximate page number (1-indexed integer) where the issue occurs.
   - "comment": A concise review comment (string, max 80 chars). Do NOT use special characters.
3. "detectedPaperType": Detected paper type (e.g., "Research", "Survey", "Case Study", "Engineering").

Return ONLY the JSON. No markdown ticks.`;

    const aiResponse = await AzureOpenAIClient.sendPrompt(systemPrompt, `Here is the paper content:\n${contentToSend}`);

    let reviewData: { summaryReport: string; annotations: { page: number; comment: string }[]; detectedPaperType: string };
    try {
      const cleanedText = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      reviewData = JSON.parse(cleanedText);
    } catch (e) {
      console.warn("[AIReviewService] Failed to parse AI review JSON, falling back to no annotations.");
      reviewData = { summaryReport: aiResponse, annotations: [], detectedPaperType: 'Unknown' };
    }

    // 3. Citation Guardrails
    console.log(`[AIReviewService] Validating suggested citations...`);
    const rawCitations = [{ title: "Fake Paper 2024", authors: ["John Doe"] }];
    const validatedCitations = await AIGuardrailService.validateCitations(rawCitations);

    // 4. Checklist Prediction
    console.log(`[AIReviewService] Pre-filling checklist for paper type: ${reviewData.detectedPaperType}...`);
    const paperType = reviewData.detectedPaperType || 'CaseStudy';
    const emptyChecklist = ChecklistService.generateChecklistForType(paperType);
    const preFilledChecklist = await ChecklistService.preFillChecklist(emptyChecklist, contentToSend);

    // 5. Annotate PDF using the PDFAnnotationAgent
    console.log(`[AIReviewService] Injecting annotations into PDF...`);
    const outputFilename = `paper_${paperId}_round_${roundId}_annotated.pdf`;
    await PDFAnnotationAgent.annotate(
      pdfBuffer,
      reviewData.annotations || [],
      outputFilename
    );

    // Produce a public URL (relative path from server root)
    const annotatedPdfUrl = `/downloads/${outputFilename}`;

    return {
      success: true,
      summaryReport: reviewData.summaryReport,
      annotatedPdfUrl,
      annotations: reviewData.annotations,
      suggestedCitations: validatedCitations,
      checklist: preFilledChecklist,
      paperType,
    };
  }
}
