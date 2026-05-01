import { AIGuardrailService } from './AIGuardrailService';
import { ChecklistService } from './ChecklistService';
import { AzureOpenAIClient } from '../utils/AzureOpenAIClient';
import { PdfAgentService } from './PdfAgentService';
import fs from 'node:fs';
import path from 'node:path';
const pdfParse = require('pdf-parse');

export class AIReviewService {
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

  static async generateAIReview(paperId: string, roundId: string, pdfBuffer: Buffer): Promise<any> {
    console.log(`[AIReviewService] Starting AI Review pipeline for Paper ${paperId}, Round ${roundId}`);

    // 1. Extract text from PDF (needed for checklist generation)
    console.log(`[AIReviewService] Extracting text from PDF...`);
    const pdfData = await pdfParse(pdfBuffer);
    const paperText = pdfData.text;
    if (!paperText || paperText.trim().length === 0) {
      throw new Error('The uploaded PDF appears to be empty or could not be parsed.');
    }
    const maxContentLength = 80000;
    const contentToSend = paperText.length > maxContentLength
      ? paperText.substring(0, maxContentLength) + '\n...[TRUNCATED]...'
      : paperText;

    // 2. Detect paper type (lightweight call — needed for checklist template selection)
    console.log(`[AIReviewService] Detecting paper type...`);
    let paperType = 'Research';
    try {
      const typeResponse = await AzureOpenAIClient.sendPrompt(
        'You are an academic expert. Detect the paper type from the text. Return ONLY one word: Research, Survey, CaseStudy, or Engineering.',
        `Paper excerpt:\n${contentToSend.substring(0, 5000)}`
      );
      const detected = typeResponse.trim();
      if (['Research', 'Survey', 'CaseStudy', 'Engineering'].includes(detected)) {
        paperType = detected;
      }
    } catch (e) {
      console.warn('[AIReviewService] Paper type detection failed, defaulting to Research');
    }

    // 3. Run the Foundry agent: generates the review text AND annotates the PDF
    console.log(`[AIReviewService] Calling AI agent for review and PDF annotation...`);
    const agentService = new PdfAgentService();
    const inputFilename = `paper_${paperId}_round_${roundId}.pdf`;
    const { summaryText, annotatedPdfBuffer } = await agentService.runAnnotatedReview(pdfBuffer, inputFilename);

    // 4. Save annotated PDF returned by the agent
    const outputFilename = `paper_${paperId}_round_${roundId}_annotated.pdf`;
    const downloadsDir = path.join(process.cwd(), 'downloads');
    if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

    if (annotatedPdfBuffer) {
      fs.writeFileSync(path.join(downloadsDir, outputFilename), annotatedPdfBuffer);
      console.log(`[AIReviewService] Annotated PDF saved to downloads/${outputFilename}`);
    } else {
      console.warn('[AIReviewService] Agent did not produce an annotated PDF.');
    }

    const annotatedPdfUrl = annotatedPdfBuffer ? `/downloads/${outputFilename}` : null;

    // 5. Citation guardrails (stub — validates & deduplicates)
    console.log(`[AIReviewService] Validating citations...`);
    const rawCitations = [{ title: "Fake Paper 2024", authors: ["John Doe"] }];
    const validatedCitations = await AIGuardrailService.validateCitations(rawCitations);

    // 6. Checklist prediction
    console.log(`[AIReviewService] Pre-filling checklist for paper type: ${paperType}...`);
    const emptyChecklist = ChecklistService.generateChecklistForType(paperType);
    const preFilledChecklist = await ChecklistService.preFillChecklist(emptyChecklist, contentToSend);

    return {
      success: true,
      summaryReport: summaryText,
      annotatedPdfUrl,
      annotations: [],
      suggestedCitations: validatedCitations,
      checklist: preFilledChecklist,
      paperType,
    };
  }
}
