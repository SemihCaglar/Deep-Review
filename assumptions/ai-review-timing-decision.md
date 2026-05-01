---
date: 2026-05-01
issue: AI Review Timing Gate
decision-by: Semih Çağlar
---

# Decision: AI Review Can Be Run at Any Time

## Original Design (from Post-Review Phase Activity Diagram)

The diagram specified: *"Run AI Review — Can only be run after Human Review concludes."*

This gate was intended to prevent authors from using AI feedback to shortcut the human peer-review process.

## Revised Decision

The timing gate has been **removed**. Authors or Coordinators may trigger the AI Review at any point in a round's lifecycle — before, during, or after human review.

## Rationale

- Enforcing the gate requires reliable round-state tracking and adds UI complexity without proportional benefit.
- The AI Review supplements human feedback rather than replacing it; there is no meaningful risk in allowing early access.
- Simplifies the backend controller (`POST /rounds/:id/ai`) — no round-status check needed.

## Impact

- `RoundController.startAIReview` does **not** check whether human review has concluded.
- The frontend "Run AI Review" button is always available to Authors and Coordinators regardless of round status.
- The diagram annotation *"Can only be run after Human Review concludes"* is superseded by this decision.
