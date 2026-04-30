# System Architecture & AI Integration Assumptions

This document formally details every technical assumption, architectural decision, and workflow constraint regarding the AI Integration and Overleaf Git Integration within the BILSEN Review Management System.

## 1. Overleaf Git Integration Strategy

There is no native REST API to programmatically add review comments directly inside an author's live Overleaf editor. To provide an automated "Annotated PDF" experience for users, we strictly leverage **Overleaf's Git Integration**, not the GitHub Sync feature.

### 1.1 Authentication & Token Storage
- **Global Token Approach:** Overleaf Git requires HTTP Basic Auth. Instead of forcing authors to generate and provide individual access tokens (which is error-prone and requires premium accounts for all authors), we rely on a single, global **Coordinator Token**.
- **Database Storage:** The Coordinator will generate an Overleaf Git Authentication Token and store it in the system. This token is securely saved in the database under the `Lab` entity in the `overleafGitToken` column. This allows the system to scale and support multiple labs, each using their Coordinator's premium token.
- **Author Requirement:** Authors DO NOT need to provide tokens during paper registration. They only need to enable **"Link Sharing" (Anyone with the link can edit)** for their Overleaf project and provide the Overleaf Git URL. 

### 1.2 Cloning and Compilation Workflow
1. **Clone:** The backend orchestrator (`AIReviewService`) spawns a child process to run `git clone https://x-token-auth:<CoordinatorToken>@git.overleaf.com/<project-id> <temp_dir>`.
2. **Inject:** The AI reads the `.tex` source files and injects review comments using standard LaTeX annotation packages (e.g., `\todo{}` from the `todonotes` package).
3. **Compile:** The backend invokes a local or containerized `pdflatex` (or `tectonic`) compiler to generate the PDF off-Overleaf.
### 1.3 Multi-File LaTeX Projects and Source Code Injection
Most academic papers are split across multiple files (e.g., `main.tex`, `intro.tex`). The system handles this gracefully:
1. **Reading:** The backend recursively scans the cloned repository for all `.tex` files and passes their combined, labeled content to the AI.
2. **Injection:** The AI does NOT rewrite the entire paper. Instead, it returns a JSON payload specifying the filename, line number, and the `\todo{}` comment string. The backend programmatically injects these comments into the respective files.
3. **LaTeX Sanitization Guardrail:** To prevent the AI's review comments from breaking the `pdflatex` compilation, the backend enforces a sanitization step. AI comments are automatically checked/escaped for illegal LaTeX characters (e.g., unescaped `%`, `&`, `$`, `_`, `#`) before injection.

### 1.4 Outputs (Annotated PDF & ZIP Archive)
- **Primary Output:** The successfully compiled PDF with visible marginal notes.
- **Secondary Output (ZIP):** Because we strictly **DO NOT** push the modified `.tex` files back to Overleaf (to prevent merge conflicts and data loss for the author), the backend will ZIP the modified source directory. Authors can download this `.zip` to copy the exact `\todo{}` placements into their live Overleaf project manually.

## 2. AI Review Workflow

The AI integration is powered by the **Azure OpenAI API** (model: `gpt-5.4-mini`). To ensure code security, API keys and endpoints are stored in an unversioned `ai_content/secrets.yaml` file, loaded at runtime via the `AzureOpenAIClient` utility class.

The AI Review is strictly a **Post-Human-Review** process. It cannot be triggered until human reviewers have finalized their assessments. The AI pipeline provides multiple capabilities:

### 2.1 Draft Feedback Generation
The AI reads the entire raw `.tex` paper content and generates a critical, constructive academic review. The output is versioned (e.g., v1, v2) within the `AIReviewReport` entity in case the AI review is triggered multiple times for revised submissions.

### 2.2 PC / Jury Related-Work Scan & Guardrails
To prevent LLM hallucination:
- The system retrieves the PC/Jury list for the relevant conference/track.
- Instead of relying on the LLM's internal weights to "guess" related work, we utilize logic inspired by **EasyPaper** to query actual scholarly index APIs (like Semantic Scholar or CrossRef).
- **Verification Guardrail:** Any citation suggested by the AI must contain verifiable metadata (Title, Authors, Year, Venue, DOI). If it cannot be retrieved via API, it is explicitly omitted.
- **Duplication Guardrail:** The backend automatically checks the paper's existing bibliography. The AI will not suggest citations that the authors have already referenced.

## 3. Checklist Generation and Pre-Filling

The system enforces automated compliance checking based on the **SIGSOFT Empirical Standards**. Since these standards are highly complex and depend strictly on the research methodology (e.g., Case Study, Mixed Methods, Engineering Research), applying the wrong standard would derail the review.

### 3.1 Venue Rules Extraction (Pre-AI Review)
Before the AI Review triggers, the backend provides an endpoint (`GET /api/rounds/:id/venue-rules`) that queries the AI for the target venue's basic rules (e.g., `abstractWordCount`, `pageLimit`, `blindReview`). 
- Because the AI might hallucinate or fail to find obscure venues, it returns a JSON object which the frontend displays to the user.
- The Authors/Coordinators can manually correct or continue filling this data.

### 3.2 The Hybrid Determination Strategy
- We do not allow the AI to silently determine the methodology type.
- The AI will analyze the paper's **Abstract** (fetched directly from the `Paper` database entity without needing to parse the LaTeX source) and *suggest* a methodology type.
- The Author (during submission) or Coordinator MUST explicitly confirm this paper type via a UI dropdown.

### 3.2 Full Pre-Filling Automation
Once the methodology is confirmed by the human, the system dynamically pulls the correct SIGSOFT checklist questions. 
- The `ChecklistService` passes the entire `.tex` paper content to the Azure OpenAI model, instructing it to evaluate every single question in the checklist (e.g., "Are threats to validity explicitly documented?").
- The AI returns a JSON structure containing predicted boolean answers (and confidence scores) for every item.
- The BILSEN dashboard presents this **fully pre-filled checklist** to the Author or Coordinator.
- The human must explicitly review and approve (or override) the AI's pre-filled answers before the checklist is finalized, keeping the human in the loop while maximizing automation speed.
