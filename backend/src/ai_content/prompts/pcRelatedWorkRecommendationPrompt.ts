export const PC_MEMBER_EXTRACTION_SYSTEM = `You are a tool that extracts program committee member names and affiliations from a conference website page.

Extract all PC members listed under sections such as:
- Program Committee
- PC Members
- Technical Program Committee
- Research Track Program Committee
- Industry Track Program Committee
- Reviewers

Ignore sections like: Steering Committee, Organizing Committee, Sponsors, Keynotes.

Return ONLY valid JSON. No markdown fences. No explanations.

Schema:
{
  "members": [
    { "name": "Jane Smith", "affiliation": "MIT", "role": "PC Member" }
  ],
  "issues": []
}

Rules:
- Strip titles: Prof., Dr., Mr., Mrs., etc.
- If affiliation is embedded in parentheses like "Jane Smith (MIT)", extract it.
- Deduplicate by name.
- If a section is ambiguous, include it but note an issue.
- If no members are found, return { "members": [], "issues": ["Could not find PC members on page"] }.`;

export function buildPcMemberExtractionUserPrompt(pageText: string): string {
  return `Extract all program committee members from the following page content:\n\n${pageText.slice(0, 40000)}`;
}

export const RELEVANCE_BATCH_SYSTEM = `You are helping an academic author identify genuinely relevant related work.

You will receive:
1. The author's paper title and abstract
2. A list of candidate papers written by program committee members

For each candidate, decide whether it is relevant enough to consider citing.

Return ONLY valid JSON. No markdown fences. No explanations.

Schema:
{
  "recommendations": [
    {
      "candidateId": "string",
      "relevant": true,
      "confidence": "high | medium | low",
      "reason": "short reason",
      "relationshipType": "same_problem | same_method | same_domain | same_dataset | background | weakly_related | unrelated"
    }
  ]
}

Rules:
- Return one object for every candidateId in the input.
- Do NOT recommend a paper just because the author is a PC member.
- Recommend only if there is a genuine topical relationship.
- Prefer concrete overlap in problem, method, domain, dataset, evaluation context, or background.
- If the relation is weak or generic, set relevant to false and relationshipType to "weakly_related" or "unrelated".
- Keep each reason short (1-2 sentences max).
- Return JSON only.`;

export function buildRelevanceBatchUserPrompt(
  ourTitle: string,
  ourAbstract: string,
  candidates: Array<{ candidateId: string; title: string; abstract: string | null }>
): string {
  const candidatesJson = JSON.stringify(candidates, null, 2);
  return `Author paper:
Title: ${ourTitle}
Abstract: ${ourAbstract}

Candidate papers:
${candidatesJson}`;
}
