# AI Review Integration Assumptions

> **⚠️ SUPERSEDED DECISION**: The original approach described below (Overleaf Git Integration) has been **abandoned** as of May 2026. See Section 4 for the current design.

---

## ~~1. Overleaf Git Integration Strategy~~ (ABANDONED)

This section is kept for historical reference. The implementation using Overleaf Git cloning, LaTeX compilation, and `\todo{}` injection was **fully removed** from the codebase. The reasons for abandonment:

- Overleaf Git requires premium accounts for all coordinators.
- The LaTeX compilation chain (`tectonic`/`latexmk`/Docker) was fragile and introduced a critical remote code execution risk (via `-Z shell-escape`).
- The approach was tightly coupled to LaTeX and incompatible with papers submitted as plain PDFs.
- The annotation injection via `\todo{}` re-compilation was complex and error-prone for multi-file projects.

---

## 2. AI Review Workflow (Current Design)

The AI integration is powered by the **Azure OpenAI API** (model: `gpt-4.1-mini`). API keys and endpoints are stored in an unversioned `backend/src/ai_content/secrets.yaml` file, loaded at runtime via the `AzureOpenAIClient` utility class.

The AI Review is strictly a **Post-Human-Review** process. It cannot be triggered until the round status is `Completed`.

---

## 3. PDF Upload–Based Pipeline (Current)

Instead of cloning from Overleaf or any version control system, the author or coordinator **uploads a PDF directly** through the BILSEN UI. This can be done multiple times per round — each upload triggers a fresh AI analysis and overwrites the previous result for that round.

### 3.1 AI Review Agent Flow

```
[User uploads PDF]
       ↓
[Backend: pdf-parse extracts text + metadata]
       ↓
[Azure OpenAI: generates summaryReport + annotations ({page, comment})]
       ↓
[PDFAnnotationAgent: injects visual comment boxes into PDF via pdf-lib]
       ↓
[Annotated PDF saved to disk → URL stored in Round.annotatedPdfUrl]
       ↓
[Full result persisted in Round.aiReviewReport (JSON)]
```

### 3.2 Compliance Check Flow

```
[User uploads PDF]
       ↓
[Backend: pdf-parse extracts text + PDF metadata (author fields, etc.)]
       ↓
[Azure OpenAI: checks page limit, anonymity, abstract length, references, etc.]
       ↓
[Compliance report JSON stored in Round.complianceReport]
```

### 3.3 Data Persistence

Each `Round` entity stores:
- `aiReviewReport`: Full JSON result from the AI Review agent (summaryReport, checklist, annotations, paperType).
- `complianceReport`: Full JSON result from the Compliance Check (pageLimit, anonymity, referenceFormat, etc.).
- `annotatedPdfUrl`: Path/URL to the AI-annotated PDF file on disk.

### 3.4 Venue Rules (Pre-Check)

Before running the compliance check, the frontend calls `GET /api/rounds/:id/venue-rules` to query the AI for the target venue's basic rules (page limit, blind review policy, etc.). The result is displayed to the user who can manually correct it before passing it to the compliance check.

---

## 4. Checklist Generation and Pre-Filling

The system enforces automated compliance checking based on the **SIGSOFT Empirical Standards**. The methodology type (e.g., Case Study, Mixed Methods) must be explicitly confirmed by an Author or Coordinator via a UI dropdown.

### 4.1 Hybrid Determination Strategy
- The AI analyzes the paper's abstract to *suggest* a methodology type.
- The human must explicitly confirm the paper type.
- Once confirmed, the correct SIGSOFT checklist is generated and pre-filled by the AI.
- The human reviews and approves (or overrides) before finalization.

---

## 5. PC / Jury Related-Work Scan & Guardrails

To prevent LLM hallucination in citation suggestions:
- Any citation suggested by the AI must be verifiable via a scholarly index API (e.g., Semantic Scholar or CrossRef).
- Citations without verifiable metadata (Title, Authors, Year, Venue, DOI) are explicitly omitted.
- Citations already in the paper's bibliography are also filtered out.

> **Status**: The `AIGuardrailService` currently returns mock validated citations. External API integration (Semantic Scholar / CrossRef) is tracked in Issue #80.
