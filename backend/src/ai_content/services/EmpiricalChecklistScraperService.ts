import { EmpiricalChecklistItemData } from '../../types/empiricalChecklist';

const BASE_URL = 'https://www2.sigsoft.org/EmpiricalStandards/docs/standards';

// Maps user-facing standard labels (from ChecklistService.ts) to markdown file names
const STANDARD_FILENAME_MAP: Record<string, string> = {
  'Engineering Research': 'EngineeringResearch',
  'Multimethodology or mixed methods': 'MixedMethods',
  'Action Research': 'ActionResearch',
  'Case Study': 'CaseStudy',
  'Grounded Theory': 'GroundedTheory',
  'Qualitative Survey': 'QualitativeSurveys',
  'Benchmarking': 'Benchmarking',
  'Data Science': 'DataScience',
  'Experiment with human participants': 'Experiments',
  'Optimization Study': 'OptimizationStudies',
  'Quantitative Longitudinal Study': 'Longitudinal',
  'Quantitative Simulation': 'QuantitativeSimulation',
  'Questionnaire Survey': 'QuestionnaireSurveys',
  'Repository Mining': 'RepositoryMining',
  'Case Survey': 'CaseSurvey',
  'Systematic Literature Review': 'SystematicReviews',
  'Meta Science': 'MetaScience',
  'Replication': 'Replication',
  'Empirical Method Not Listed Above': 'GeneralStandard',
  'General Standard': 'GeneralStandard',
};

// Section tag labels within Essential checklist blocks
const SECTION_TAG_LABELS: Record<string, string> = {
  intro: 'Introduction',
  method: 'Method',
  results: 'Results',
  discussion: 'Discussion',
  other: 'Other',
};

async function fetchStandardMarkdown(standardLabel: string): Promise<string | null> {
  const filename = STANDARD_FILENAME_MAP[standardLabel];
  if (!filename) {
    console.warn(`[EmpiricalChecklistScraperService] No filename mapping for standard: "${standardLabel}"`);
    return null;
  }

  const url = `${BASE_URL}/${filename}.md`;
  console.log(`[EmpiricalChecklistScraperService] Fetching: ${url}`);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[EmpiricalChecklistScraperService] HTTP ${res.status} for ${url}`);
      return null;
    }
    return res.text();
  } catch (err) {
    console.error(`[EmpiricalChecklistScraperService] Failed to fetch ${url}:`, err);
    return null;
  }
}

function parseChecklistItemsFromMarkdown(
  markdown: string,
  standardLabel: string,
  configurationId: string,
  startOrder: number
): EmpiricalChecklistItemData[] {
  const items: EmpiricalChecklistItemData[] = [];
  let order = startOrder;

  // Extract all <checklist name="...">...</checklist> blocks
  const checklistRegex = /<checklist\s+name="([^"]+)">([\s\S]*?)<\/checklist>/g;
  let match: RegExpExecArray | null;

  while ((match = checklistRegex.exec(markdown)) !== null) {
    const checklistType = match[1]; // Essential, Desirable, Extraordinary
    const content = match[2];

    // Split content by section tags like <intro>, <method>, etc.
    // Each section tag starts a new section
    const sectionPattern = /<(intro|method|results|discussion|other)>/gi;
    const sectionParts = content.split(sectionPattern);

    let currentSection: string | null = checklistType === 'Essential' ? null : null;

    // sectionParts alternates: [beforeFirstTag, tag1, content1, tag2, content2, ...]
    // For Desirable/Extraordinary there are no section tags, so sectionParts = [content]
    let i = 0;
    while (i < sectionParts.length) {
      const part = sectionParts[i];

      // Check if this part is a section tag name (from the split capture groups)
      const lowerPart = part.toLowerCase();
      if (SECTION_TAG_LABELS[lowerPart]) {
        currentSection = SECTION_TAG_LABELS[lowerPart];
        i++;
        continue;
      }

      // Parse checklist items from this content block
      // Use [\s\S] instead of . with s-flag (s-flag requires ES2018+)
      const lineItemRegex = /^-\s+\[\s*\]\s+([\s\S]+?)(?=\n-\s+\[|\n<|\n#{2,}|$)/gm;
      let itemMatch: RegExpExecArray | null;

      while ((itemMatch = lineItemRegex.exec(part)) !== null) {
        const rawText = itemMatch[1]
          .replace(/<[^>]+>/g, '')            // strip HTML/XML tags
          .replace(/\s+/g, ' ')               // collapse whitespace
          .trim();

        if (rawText.length > 0) {
          items.push({
            configurationId,
            standard: standardLabel,
            sectionTitle: currentSection,
            itemText: rawText,
            itemOrder: order++,
          });
        }
      }

      i++;
    }
  }

  return items;
}

export async function scrapeEmpiricalChecklistItems(
  standards: string[],
  configurationId: string
): Promise<EmpiricalChecklistItemData[]> {
  const allItems: EmpiricalChecklistItemData[] = [];

  // Always prepend General Standard (as the JS site does)
  const standardsWithGeneral = standards.includes('General Standard')
    ? standards
    : ['General Standard', ...standards];

  let order = 0;
  for (const standardLabel of standardsWithGeneral) {
    const markdown = await fetchStandardMarkdown(standardLabel);
    if (!markdown) {
      console.warn(`[EmpiricalChecklistScraperService] Skipping standard (could not fetch): ${standardLabel}`);
      continue;
    }

    const items = parseChecklistItemsFromMarkdown(markdown, standardLabel, configurationId, order);
    console.log(`[EmpiricalChecklistScraperService] Extracted ${items.length} items for "${standardLabel}"`);
    allItems.push(...items);
    order += items.length;
  }

  console.log(`[EmpiricalChecklistScraperService] Total items extracted: ${allItems.length}`);
  return allItems;
}
