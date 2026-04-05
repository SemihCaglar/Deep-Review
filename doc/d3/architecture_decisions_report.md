# BILSEN Review Management System: Architecture Refinement Session Report

This comprehensive report documents every architectural decision, feature refinement, entity restructure, and diagram optimization made from the beginning to the end of this session.

## 1. Feature Ideation and Scope
- **Brainstorming New Features**: Generated and evaluated a list of potential new features suitable for an advanced, modern PC (Program Committee) review management system.
- **Removed Unnecessary Features**: Eliminated the `Schedule` feature to streamline the system.
- **Removed Conflict of Interest (COI)**: Dismissed the automated COI resolution feature based on user feedback to simplify constraints.

## 2. Architecture Model Refinement
- **Strict MVC Paradigm**: Stripped out business logic methodology and active behavior methods from `Entity` classes to strictly enforce them as pure data-container models.
- **Stereotype Implementation**: Injected explicit standard UML stereotypes (`<<Entity>>`, `<<Controller>>`, `<<Agent>>`, `<<Service>>`) across all system domains to explicitly demarcate responsibilities.

## 3. Entity Refactoring
- **LabMember Unification**: Consolidated `Author` and `Reviewer` roles into a single polymorphic `LabMember` entity for more unified user modeling.
- **Paper Enhancements**:
  - Added `creationTime` to `Paper`.
  - Added `targetVenue` (e.g., specific conference names) to `Paper`.
  - Introduced an `Archived` status to the `PaperStatus` enum to support long-term document retention.
- **Round Configuration**:
  - Linked `proposedReviewers` explicitly to the `Round` entity to track early-stage reviewer selection.
  - Linked `aiReviewReports: AIReviewReport[]` to the `Round` instead of limiting the AI loop to a single `aiReviewReport`, enabling multi-turn autonomous reviews.
- **Workload Management**:
  - Centralized task constraints by adding the `BlackoutPeriod` entity.
  - Linked `BlackoutPeriod` exclusively to the `LabMember`.
- **Feedback Revamp**: Grouped abstract payloads by replacing `textPayload` with an encapsulated `summary` mapping connected strictly to `ReviewFeedback`.
- **Assignment Enhancements**:
  - Centralized process extensions deeply into an explicitly typed `Extension` entity hooked securely to the `Assignment`.
  - Strictly enforced the linkage of the `Rating` object by making it a standard mandatory association inside the `Assignment`.
- **Email Notification Schema**: Constructed a new structural mapping for `EmailNotification` directly tied into the foundational `User` class.
- **AI Domain Naming**: Refactored `AIPredictedCitation` terminology to the more descriptive `CitationSuggestion`. 

## 4. Administrative and Core Controllers
- **AdminController Rewrite**: Replaced generic `manage` functions with concrete, explicit CRUD operational signatures (e.g., `createUser`, `updateUserRole`, `lockUserAccount`, `createTopic`).
- **AssignmentController Synthesis**:
  - Orchestrated a new dedicated `AssignmentController` separated entirely from the `RoundController`.
  - Shifted core tasks: `assignReviewers`, `sendInvitations`, `sendReminders`, `cancelAssignment`, and `updateAssignmentDeadline` natively into `AssignmentController`.
- **RoundController Cleanup**:
  - Purged Assignment orchestration methods explicitly moved above.
  - Added explicit methods: `addProposeReviewer`, `getProposeReviewers`, `editRoundDeadline`, and `startAIReview`.
  - Purged the deprecated `reassignReviewer` method permanently from the system architecture.
- **PaperController Synchronization**: Added advanced metadata extraction hooks via `getMyCurrentReviewedPapers` and the administrative `updatePaperStatus`.
- **ReviewerResponseController Cleanup**:
  - Stripped `proposedDate` natively from `Extension` models; reviewers will now strictly reply via text reasons.
  - Adjusted the `processExtensionRequest` to dynamically inject a `newDeadline` argument if physically approved by the coordinator.
  - Purged the `accessPaper` mechanism altogether.
- **AccountController Expansion**: Empowered it structurally to actively process and integrate `BlackoutPeriod` profiles.

## 5. Introduction of Specialized Agent Layers (`<<Agent>>`)
- Standardized an intermediate autonomous intelligence layer sitting strictly between logic (Controllers) and operations (Services).
- **AIReviewEngineAgent**: Generates foundational content analyses and formulates actionable validation datasets, outputting structured `CitationSuggestion` nodes.
- **AIGuardrailAgent**: Safely checks generated ML text output natively against existing data logic structures looking uniquely for potential AI duplicate assertions or "hallucinations."
- **ChecklistAgent**:
  - Evaluates explicit form parameters and formatting compliance statically.
  - `autofillMissingItems` explicitly requires a `ChecklistItem` payload payload.

## 6. Implementation of the External Service Topology (`<<Service>>`)
- Converted `EmailController` into a headless background integration named `EmailService`.
- Initialized the dynamic **`LLMService`** integration, designed generically to wrap standard LLM framework API calls structurally supporting explicit `modelType` parameterization and JSON structural serialization.
- Set up **`GitHubService`** for Overleaf source injection, parsing Git commits via remote API payloads.
- **`WebScraperService`**: Added scraping behaviors explicitly to scan metadata inside public Program Committee spheres via `getPCMembersOfConference` and `getConferenceChecklist`.
- **`LatexService`**: Engineered specifically downstream of `AIReviewController` to natively handle dynamic compilation protocols converting raw `.tex` repository sources forcefully to binary PDF paths natively for visual PDF annotation hooks.

## 7. Visual Component Modeling and Diagram Layout Overhaul (`class_diagram.puml`)
- **Package Encapsulation**: Organized all 22 components comprehensively into distinct conceptual `package` regions visually clustering logic contexts: `Entities`, `Controllers`, `Agents`, and `Services`.
- **Redundant Arrow Cleanup**: Replaced thousands of arbitrary directed vectors recursively with pure double-dash bindings (`--`) explicitly rendering cardinal structural constraints natively to reduce visual saturation.
- **Stereotype Consistency Check**: Cross-referenced `Multiplicity` vectors explicitly for overlapping boundaries forcing `0..*` mappings strictly against `1..1` nodes natively inside `Assignment` loops.
- **Generation Pipelines**: Integrated a raw terminal artifact pipeline (`compile.sh`) scripting robust regex sweeps natively stripping dynamic TS Types into simplified visual arrays (producing two diagram formats per sweep: Type and NoType artifacts).
- **Layout Direction Experiments & The LabMember Fix**:
  - Initially pursued deep vertical-stack forcing with raw physical constraint instructions (`up`, `down`, `left`) directly breaking spatial algorithms natively on overlapping components.
  - Pursued native PlantUML engine commands forcing severe `left to right direction` global overrides aiming to cluster packages spatially (simulating column UI styling). 
  - **Final Layout Decision**: Purged all manual directional forces natively and reset the internal visualizer back to organic defaults. Fixed isolated spatial collisions on the `LabMember` array structure efficiently leveraging native dash-expansion syntaxes (forcing components physically apart using `---` and `----` bindings organically).
