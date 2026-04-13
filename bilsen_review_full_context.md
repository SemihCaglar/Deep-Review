# BILSEN Review Management System — Full Chat Context (Consolidated)

This document consolidates **all decisions, constraints, corner cases, exceptions, and artifacts** discussed in the chat so they can be moved to another conversation.

---

## 1) Project scope summary

A web system to manage the **internal BILSEN paper review process**.

Core capabilities:

- User accounts, authentication, password reset.
- Paper registration (Title + **Abstract first**) + topics + files/links.
- Create review rounds, **set deadlines**, assign reviewers, send invitations/reminders.
- Reviewer responses: accept, request decline, request deadline extension (low-probability exception flows).
- Review submission (in-app text and/or report upload) + mark completed.
- AI review after human review (report, annotated PDF, PC/Jury related-work scan with evidence guardrails).
- End-of-round ratings of reviewers.
- Public analytics dashboard (competition-style): **everyone can view**.
- Paper status view (author + coordinator).
- Paper history view (author + coordinator).
- History lists:
  - Users can see **their own written** and **their own reviewed** papers only.
  - Coordinator can see **all papers**.

---

## 2) Key actors and role model

### Actors
- **User**: base actor for shared actions.
- **Author**: a user who authors papers.
- **Reviewer**: a user who can be assigned to review.
- **Coordinator**: special actor that is also an Author.
- **Admin**: system-level management.

### Actor relationships
- `User <|-- Author`
- `User <|-- Reviewer`
- `User <|-- Admin`
- `Author <|-- Coordinator` (coordinator is also an author of every paper)

### Authority rules (final)
- **Coordinator**:
  - Sets deadlines and manages process (invitations, reminders, approvals for decline/extension, reassignment, close round, start next round).
  - Makes the **final reviewer assignment decision**.
  - Is listed as an author on every paper.
  - “Not bound by deadlines” = deadlines constrain review process; coordinator can still act/modify after deadlines.
- **Author**:
  - Registers paper, updates abstract/topics, views status/history, runs AI review, rates reviewers.
  - **Does not propose reviewer candidates** (removed).
- **Reviewer**:
  - Maintains interests + availability schedule.
  - Accepts/declines/requests extension.
  - Submits review and marks completed.
- **Admin**:
  - Manages users/roles, global topics list, policies/templates, audit.

---

## 3) Overleaf integration decision

- There is **no Overleaf API for editing/creating Overleaf comments** in this project (we cannot manipulate others’ comments).
- Overleaf appears as an **external actor/system** to represent:
  - storing / opening the Overleaf link as a paper artifact during **paper registration**,
  - a conceptual integration point for **assignment** (e.g., coordinator shares the Overleaf link or manages access out-of-band).
- The system’s primary review management remains inside the BILSEN system.

---

## 4) Paper registration requirements

- Paper registration must start with:
  - **Title + Abstract (mandatory)** at the beginning.
- Paper also has:
  - **Topics** (from a controlled global topic list).
  - Manuscript / file uploads and/or links (including Overleaf link).
  - Parent paper(s) link(s).

### Abstract/topics update policy
- **Author and Coordinator can update abstract/topics anytime.**
- **No notifications** are sent on abstract/topic updates.
- (Optional UI-only suggestion) show “Updated on …” to reviewers when they open, but no email.

---

## 5) Parent paper (extends) rules

- The current paper **P** may extend **parent paper(s) Q**.
- **Parent paper is always already in the system** (no external/stub parents).
- **Coordinator** sets parent by searching:
  - title keywords or author name fragments,
  - then linking the chosen paper(s).

Validation (recommended):
- cannot link a paper as its own parent,
- prevent parent cycles.

---

## 6) Interests & topics for assignment proposals (no scoring)

### Inputs
- Every user sets **interests** (topics).
- Every paper has **topics**.
- Users can also set **availability schedule**.

### Output behavior
- The system proposes candidates **with human-readable reasons** (no numeric scoring shown).
- Coordinator selects final reviewers.

Reason examples:
- “Author of linked parent paper(s) — strong context on extended work.”
- “Topic overlap: {X, Y}.”
- “Availability fits deadline window.”
- “Low workload.”
- “Reliability flag: previously accepted but did not submit (informational only).”

---

## 7) Round management rules and corner cases

### Core round lifecycle actions
- Create round → includes setting/updating deadline.
- Start next round → **extends** create round (pre-fills from previous and enforces new-reviewer policy).

### Exceptions (low probability; model with extend)
- Reviewer requests **decline**:
  - Reviewer provides reason.
  - Coordinator processes request (approve/deny).
- Reviewer requests **deadline extension**:
  - Allowed only after accepting (extension extends accept).
  - Reviewer provides reason.
  - Coordinator processes request (approve/deny).
- Reassignment:
  - Reassign is an independent coordinator action.
  - It may be triggered by decline approval, overdue, or manual coordinator decision.

---

## 8) “Different people each round” rule (final)

Goal: assign different reviewers each round for the same paper.

**Final policy chosen:**
- A reviewer becomes **ineligible in future rounds** for the same paper **only if they SUBMITTED a review** in a previous round.
- If they accepted but **did not submit**, they **can still be assigned** in later rounds.
- Declined / no-response do not make them ineligible.

Optional (soft) reliability tracking:
- “Accepted but did not submit” should be recorded as a reliability flag; used for informational warnings (not a hard ban).

---

## 9) Conflict of interest (COI) rule (hard constraint)

- If someone is an **author of a paper**, they can **never** be assigned as a reviewer for that same paper.
- If a reviewer later becomes an author:
  - Future rounds: automatically excluded.
  - Current round (recommended handling):
    - invited but not accepted → cancel invitation,
    - accepted but not submitted → unassign and reassign,
    - submitted already → mark as COI-tainted and do not count toward required reviews (if you enforce a required count).

---

## 10) Paper status and paper history

### Paper status view
- **Author and Coordinator** can view paper status (checklist/human review/AI/rating stages).

### Per-paper history view
- **Author and Coordinator** can view paper history (all rounds, decisions, artifacts).

### Global history lists (self-limited)
- “My written papers”: user sees only papers they authored.
- “My reviewed papers”: user sees only papers where they submitted a review.
- “All papers”: Coordinator sees everything.

---

## 11) AI review stage and related-work scan

AI review is executed after human review completion (system workflow expectation).

AI capabilities:
- Generate review report.
- Generate annotated PDF.
- PC/Jury related-work scan:
  - Retrieve PC/jury list (conference website/DB) and query scholarly index.
  - Suggest candidate citations **with evidence**.

Guardrails:
- **No fabricated references**: each suggested citation must include verifiable metadata (title, authors, year, venue, DOI/identifier).
- If evidence cannot be retrieved, omit that citation.

---

## 12) UML notation preferences used

- Actor–use case connections are drawn as **associations (plain lines)**: `Actor -- UseCase` (no arrows).
- `<<include>>` used for mandatory sub-steps.
- `<<extend>>` used for optional/exceptional flows.
- Use-case inheritance/generalization is avoided for “history” because it is not mandatory; instead, we relate history variants via `<<extend>>` from a base list.

---

## 13) PlantUML rendering tips agreed

Spacing / routing to make arrows clearer:
```plantuml
left to right direction
skinparam packageStyle rectangle
skinparam shadowing false

skinparam linetype ortho
skinparam ranksep 80
skinparam nodesep 40
```

Export as SVG to avoid cropping:
```bash
java -DPLANTUML_LIMIT_SIZE=16384 -jar plantuml.jar -tsvg your_diagram.puml
```

---


## 15) Non-functional requirements (final combined set)

**NFR-1 — Dashboard Performance**  
For **95%** of requests under normal load, the analytics dashboard page must fully load (server response + client render) within **2 seconds**.

**NFR-2 — Idempotent Assignment & Email Consistency**  
For a given *(paper, round, reviewer)* combination, at most **one** active assignment record may exist, and at most **one** invitation email may be sent. Retries/timeouts must not create duplicate assignments or duplicate emails. Enforced via database uniqueness constraint and verifiable via logs.

**NFR-3 — Password Security**  
Passwords stored using **Argon2id or bcrypt** with per-user salt. Password reset tokens single-use and expire within **15 minutes**. After **5** failed logins in **10 minutes**, lock account for **10 minutes**.

**NFR-4 — Privacy & Access Control (Paper Confidentiality)**  
Users may access paper content (files/links/abstract/history) only if they are an **author** or an **assigned reviewer** of that paper. Otherwise deny with **HTTP 403** and log the attempt (user id, paper id, timestamp).

**NFR-5 — Email Delivery Timeliness & Retries**  
For **95%** of cases, invitation/reminder emails must be submitted to the Email Service within **30 seconds** of the triggering action. On failure, retry at least **3** times with exponential backoff and log each attempt.

---

## 16) PlantUML commands (SVG)

Single file to SVG:
```bash
java -DPLANTUML_LIMIT_SIZE=16384 -jar ./plantuml-gplv2-1.2026.1.jar -tsvg usecase.puml
```

All `.puml` in a directory to SVG:
```bash
java -DPLANTUML_LIMIT_SIZE=16384 -jar ./plantuml-gplv2-1.2026.1.jar -tsvg .
```

Output to a folder:
```bash
java -DPLANTUML_LIMIT_SIZE=16384 -jar ./plantuml-gplv2-1.2026.1.jar -tsvg -o out usecase.puml
```

---

End of consolidated context.
