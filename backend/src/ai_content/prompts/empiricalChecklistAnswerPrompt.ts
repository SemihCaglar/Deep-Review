export function buildChecklistAnswerPrompt(checklistItemsJson: string): string {
  return `You are given:
1. An academic paper PDF
2. A list of Empirical Standards checklist items

Answer each checklist item based only on the paper content.

Return ONLY valid JSON. No markdown fences. No explanations outside the JSON.

Use exactly this schema:
{
  "answers": [
    {
      "itemId": "string",
      "answer": "yes | no | unknown",
      "confidence": "high | medium | low",
      "evidence": "short evidence from the paper, or null"
    }
  ]
}

Answer rules:
- "yes" = the paper clearly satisfies the checklist item
- "no" = the paper clearly does not satisfy the checklist item
- "unknown" = the paper does not provide enough information, or the item cannot be judged confidently
- Answer every checklist item exactly once
- Use the given itemId exactly as provided. Do not rewrite or invent itemIds.
- Keep evidence short (one sentence max). Use null when there is no clear evidence.
- Do not create or modify any PDF files.
- Return JSON only. No other text.

Checklist items:
${checklistItemsJson}`;
}
