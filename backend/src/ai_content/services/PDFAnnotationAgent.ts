import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

export interface PDFAnnotation {
  page: number;   // 1-indexed
  comment: string;
}

export class PDFAnnotationAgent {
  /**
   * Takes a PDF buffer and a list of annotations from the AI,
   * injects visual comment boxes into the PDF using pdf-lib,
   * saves to disk, and returns the file path.
   */
  static async annotate(
    pdfBuffer: Buffer,
    annotations: PDFAnnotation[],
    outputFilename: string
  ): Promise<string> {
    console.log(`[PDFAnnotationAgent] Annotating PDF with ${annotations.length} comments...`);

    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();

    for (const ann of annotations) {
      const pageIndex = Math.max(0, Math.min(ann.page - 1, pages.length - 1));
      const page = pages[pageIndex];
      const { width, height } = page.getSize();

      // Truncate long comments to fit in the box
      const maxChars = 80;
      const displayText = ann.comment.length > maxChars
        ? ann.comment.substring(0, maxChars) + '...'
        : ann.comment;

      const boxHeight = 30;
      const boxY = height - 60 - (annotations.indexOf(ann) % 5) * (boxHeight + 5);
      const safeY = Math.max(10, boxY);

      // Draw yellow highlight box
      page.drawRectangle({
        x: 10,
        y: safeY,
        width: width - 20,
        height: boxHeight,
        color: rgb(1, 1, 0.5),
        opacity: 0.6,
        borderColor: rgb(0.9, 0.7, 0),
        borderWidth: 1,
      });

      // Draw annotation text
      page.drawText(`⚑ ${displayText}`, {
        x: 15,
        y: safeY + 9,
        size: 8,
        font,
        color: rgb(0.2, 0.1, 0),
        maxWidth: width - 30,
      });
    }

    const annotatedPdfBytes = await pdfDoc.save();

    // Save to public/downloads
    const downloadsDir = path.join(process.cwd(), 'public', 'downloads');
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }

    const outputPath = path.join(downloadsDir, outputFilename);
    fs.writeFileSync(outputPath, annotatedPdfBytes);
    console.log(`[PDFAnnotationAgent] Annotated PDF saved to: ${outputPath}`);

    return outputPath;
  }
}
