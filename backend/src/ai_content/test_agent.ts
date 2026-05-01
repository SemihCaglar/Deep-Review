import { PdfAgentService } from "./services/PdfAgentService";
import path from "node:path";
import fs from "node:fs";

async function testAgent() {
  const service = new PdfAgentService();
  const inputPath = path.join(__dirname, "test_input.pdf");
  const outputPath = path.join(__dirname, "test_output.pdf");

  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found at ${inputPath}`);
    return;
  }

  try {
    console.log("Starting Agent Test...");
    const pdfBuffer = fs.readFileSync(inputPath);
    const result = await service.runAnnotatedReview(pdfBuffer, "test_input.pdf");
    if (result.annotatedPdfBuffer) {
      fs.writeFileSync(outputPath, result.annotatedPdfBuffer);
      console.log(`Success! Annotated PDF saved to: ${outputPath}`);
    } else {
      console.log("Review complete, but no annotated PDF was returned.");
    }
    console.log(`Summary (first 200 chars): ${result.summaryText.substring(0, 200)}`);
  } catch (error) {
    console.error("Test failed with error:", error);
  }
}

testAgent().catch(console.error);
