import { ChecklistService } from './ChecklistService';
import { AzureOpenAIClient } from '../utils/AzureOpenAIClient';
import { PdfAgentService } from './PdfAgentService';
import { ReferenceListVerificationService } from './ReferenceListVerificationService';
import fs from 'node:fs';
import path from 'node:path';

export interface EmpiricalStandardsChecklist {
  selectedStandards: Array<{
    label: string;
    confidence: 'high' | 'medium' | 'low';
    evidence: string;
  }>;
}

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

  static async generateAIReview(paperId: string, roundId: string, pdfBuffer: Buffer, skipChecklist: boolean = false): Promise<any> {
    console.log(`[AIReviewService] Starting AI Review pipeline for Paper ${paperId}, Round ${roundId}${skipChecklist ? ' (checklist skipped)' : ''}`);

    // 1. Upload PDF once
    const agentService = new PdfAgentService();
    const inputFilename = `paper_${paperId}_round_${roundId}.pdf`;
    console.log(`[AIReviewService] Uploading PDF...`);
    const fileId = await agentService.uploadPdf(pdfBuffer, inputFilename);

    // 2. Review call (passes fileId, no re-upload)
    let summaryText: string | null = null;
    let annotatedPdfUrl: string | null = null;
    try {
      console.log(`[AIReviewService] Calling AI agent for review and PDF annotation...`);
      const result = await agentService.runAnnotatedReview(fileId);
      summaryText = result.summaryText;
      const annotatedPdfBuffer = result.annotatedPdfBuffer;

      if (!summaryText || summaryText.trim().length === 0) {
        console.warn('[AIReviewService] Agent returned empty review text.');
      }

      // Save annotated PDF
      if (annotatedPdfBuffer) {
        const outputFilename = `paper_${paperId}_round_${roundId}_annotated.pdf`;
        const downloadsDir = path.join(process.cwd(), 'downloads');
        if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
        fs.writeFileSync(path.join(downloadsDir, outputFilename), annotatedPdfBuffer);
        annotatedPdfUrl = `/downloads/${outputFilename}`;
        console.log(`[AIReviewService] Annotated PDF saved to downloads/${outputFilename}`);
      } else {
        console.warn('[AIReviewService] Agent did not produce an annotated PDF.');
      }
    } catch (err) {
      console.error('[AIReviewService] AI review agent failed (continuing with other steps):', err);
    }

    // 3. Checklist call — separate thread, same fileId (skip if already exists)
    let checklistJson: EmpiricalStandardsChecklist | null = null;
    let checklistUrl: string | null = null;
    if (!skipChecklist) {
      try {
        console.log(`[AIReviewService] Calling AI agent for checklist analysis...`);
        const raw = await agentService.runChecklistAnalysis(fileId);
        const filtered = ChecklistService.filterValidStandards(raw.selectedStandards);
        checklistJson = { selectedStandards: filtered as EmpiricalStandardsChecklist['selectedStandards'] };
        checklistUrl = ChecklistService.buildEmpiricalStandardsUrl(filtered.map(s => s.label));
        console.log(`[AIReviewService] Checklist analysis complete: ${filtered.length} standards selected`);
      } catch (e) {
        console.warn('[AIReviewService] Checklist analysis failed:', e);
      }
    } else {
      console.log(`[AIReviewService] ⚪ Checklist skipped (already exists)`);
    }

    // 4. Reference verification
    console.log(`[AIReviewService] Running reference verification...`);
    let referenceVerificationReport: any = null;
    try {
      referenceVerificationReport = await ReferenceListVerificationService.verify(pdfBuffer);
      console.log(`[AIReviewService] ✓ Reference verification complete: ${referenceVerificationReport.verifiedCount}/${referenceVerificationReport.totalReferences} verified`);
    } catch (err) {
      console.error('[AIReviewService] Reference verification failed:', err);
    }

    return {
      success: true,
      summaryReport: summaryText,
      annotatedPdfUrl,
      annotations: [],
      checklistJson,
      checklistUrl,
      referenceVerificationReport,
    };
  }
}
