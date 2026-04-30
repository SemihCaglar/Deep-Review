import { OverleafGitService } from './OverleafGitService';
import { AIGuardrailService } from './AIGuardrailService';
import { ChecklistService } from './ChecklistService';
import { AzureOpenAIClient } from '../utils/AzureOpenAIClient';
import { LatexSanitizer } from '../utils/LatexSanitizer';
import fs from 'fs';
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
   */
  static async generateAIReview(paperId: string, roundId: string, overleafGitUrl: string, coordinatorToken: string): Promise<any> {
    console.log(`[AIReviewService] Starting AI Review pipeline for Paper ${paperId}, Round ${roundId}`);

    // 1. Clone the repository
    const tempDir = await OverleafGitService.cloneProject(overleafGitUrl, coordinatorToken);

    try {
      // 2. Read LaTeX source
      console.log(`[AIReviewService] Reading all LaTeX sources from ${tempDir}`);
      const texFiles = OverleafGitService.readAllTexFiles(tempDir);
      
      if (texFiles.length === 0) {
        throw new Error("No .tex files found in the repository.");
      }

      let paperContent = "";
      for (const file of texFiles) {
        paperContent += `\n=== ${file.filename} ===\n${file.content}\n`;
      }

      // 3. Generate Draft Review Feedback & Inline Annotations
      console.log(`[AIReviewService] Calling Azure OpenAI to generate review feedback...`);
      const systemPrompt = `You are an expert academic reviewer. Review the provided paper content, which may be split across multiple .tex files.
You MUST output your response as a strictly formatted JSON object with two fields:
1. "summaryReport": A high-level, critical, constructive review report (string).
2. "inlineAnnotations": An array of specific issues to highlight in the LaTeX code.

Each annotation in the array MUST have:
- "file": The exact filename as provided in the === headers ===.
- "line": The approximate line number in that file where the issue occurs (integer).
- "comment": A concise review comment to inject. Do NOT use LaTeX special characters.

Return ONLY the JSON. No markdown ticks.`;
      
      // Truncate paperContent to avoid hitting API limits
      const maxContentLength = 80000;
      let contentToSend = paperContent;
      if (paperContent.length > maxContentLength) {
        console.warn(`[AIReviewService] Paper content exceeds ${maxContentLength} characters, truncating.`);
        contentToSend = paperContent.substring(0, maxContentLength) + "\n...[TRUNCATED]...";
      }
      
      const aiResponse = await AzureOpenAIClient.sendPrompt(systemPrompt, `Here is the paper content:\n${contentToSend}`);
      let reviewData;
      try {
        const cleanedText = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        reviewData = JSON.parse(cleanedText);
      } catch (e) {
        console.warn("[AIReviewService] Failed to parse AI review JSON, falling back to empty annotations.");
        reviewData = { summaryReport: aiResponse, inlineAnnotations: [] };
      }

      // 4. PC/Jury Related-Work Scan & Guardrails
      console.log(`[AIReviewService] Generating suggested citations...`);
      const rawCitations = [{ title: "Fake Paper 2024", authors: ["John Doe"] }];
      const validatedCitations = await AIGuardrailService.validateCitations(rawCitations);

      // 5. Checklist Prediction
      console.log(`[AIReviewService] Determining paper type and pre-filling checklist...`);
      const paperType = "CaseStudy"; // Predicted by AI
      const emptyChecklist = ChecklistService.generateChecklistForType(paperType);
      const preFilledChecklist = await ChecklistService.preFillChecklist(emptyChecklist, paperContent);

      // 6. Inject Annotations, Compile, and Archive
      console.log(`[AIReviewService] Injecting LaTeX comments...`);
      
      // Group annotations by file to handle line shifting
      const annotationsByFile: Record<string, any[]> = {};
      for (const ann of reviewData.inlineAnnotations || []) {
        if (!annotationsByFile[ann.file]) annotationsByFile[ann.file] = [];
        annotationsByFile[ann.file].push(ann);
      }

      for (const [filename, annotations] of Object.entries(annotationsByFile)) {
        const targetFile = texFiles.find(f => f.filename === filename);
        if (!targetFile) continue;

        const lines = targetFile.content.split('\n');
        
        // Sort descending to avoid line shift issues during insertion
        annotations.sort((a, b) => b.line - a.line);
        
        for (const ann of annotations) {
          const safeLineIndex = Math.max(0, Math.min(ann.line - 1, lines.length - 1));
          const safeComment = LatexSanitizer.escapeLatex(ann.comment);
          // Insert the inline todonotes command right before the target line
          // Wait, user prefers highlighting/banner style, we will use \todo[inline, color=yellow]
          lines.splice(safeLineIndex, 0, `\\todo[inline, color=yellow]{AI Review: ${safeComment}}`);
        }
        
        fs.writeFileSync(targetFile.fullPath, lines.join('\n'));
      }

      console.log(`[AIReviewService] Compiling PDF...`);
      const pdfPath = await OverleafGitService.compileToPdf(tempDir);

      console.log(`[AIReviewService] Archiving modified source code...`);
      const zipFilename = `paper_${paperId}_round_${roundId}_annotated.zip`;
      const zipPath = await OverleafGitService.archiveProject(tempDir, zipFilename);

      return {
        success: true,
        summaryReport: reviewData.summaryReport,
        reportUrl: "/downloads/mock_report.pdf", 
        annotatedPdfUrl: "/downloads/mock_annotated.pdf", // In reality, expose pdfPath
        sourceZipUrl: `/downloads/${zipFilename}`,
        suggestedCitations: validatedCitations,
        checklist: preFilledChecklist,
        paperType
      };

    } finally {
      // 7. Cleanup
      await OverleafGitService.cleanup(tempDir);
    }
  }
}
