import { AppDataSource } from '../../data-source';
import { EmpiricalChecklistConfiguration } from '../../entities/EmpiricalChecklistConfiguration';
import { EmpiricalChecklistItem } from '../../entities/EmpiricalChecklistItem';
import { EmpiricalChecklistAnswer } from '../../entities/EmpiricalChecklistAnswer';
import { ChecklistService } from './ChecklistService';
import { scrapeEmpiricalChecklistItems } from './EmpiricalChecklistScraperService';
import { EmpiricalChecklistAnswerAgentService } from './EmpiricalChecklistAnswerAgentService';
import { ChecklistAnswerResult, EmpiricalChecklistResult } from '../../types/empiricalChecklist';

const VALID_ANSWERS = new Set(['yes', 'no', 'unknown']);
const VALID_CONFIDENCES = new Set(['high', 'medium', 'low']);
const BATCH_SIZE = 20;

function buildConfigKey(role: string, standards: string[]): string {
  return `${role}:${[...standards].sort().join('|')}`;
}

async function getOrCreateConfiguration(
  role: string,
  standards: string[]
): Promise<EmpiricalChecklistConfiguration> {
  const repo = AppDataSource.getRepository(EmpiricalChecklistConfiguration);
  const configKey = buildConfigKey(role, standards);

  const existing = await repo.findOne({ where: { configKey } });
  if (existing) {
    console.log(`[EmpiricalChecklistOrchestrationService] Reusing configuration: ${existing.id}`);
    return existing;
  }

  const resultUrl = ChecklistService.buildEmpiricalStandardsUrl(standards, role);
  const config = repo.create({ configKey, role, standards, resultUrl });
  await repo.save(config);
  console.log(`[EmpiricalChecklistOrchestrationService] Created configuration: ${config.id}`);
  return config;
}

async function getOrScrapeItems(
  configuration: EmpiricalChecklistConfiguration
): Promise<EmpiricalChecklistItem[]> {
  const repo = AppDataSource.getRepository(EmpiricalChecklistItem);

  const existing = await repo.find({ where: { configurationId: configuration.id } });
  if (existing.length > 0) {
    console.log(`[EmpiricalChecklistOrchestrationService] Reusing ${existing.length} scraped items`);
    return existing;
  }

  console.log(`[EmpiricalChecklistOrchestrationService] Scraping checklist items for standards: ${configuration.standards.join(', ')}`);
  const itemData = await scrapeEmpiricalChecklistItems(configuration.standards, configuration.id);

  if (itemData.length === 0) {
    throw new Error('No checklist items could be extracted from the SIGSOFT standards');
  }

  const entities = repo.create(itemData.map(d => ({ ...d, configurationId: configuration.id })));
  await repo.save(entities);
  console.log(`[EmpiricalChecklistOrchestrationService] Saved ${entities.length} checklist items`);
  return entities;
}

function validateBatchAnswers(
  rawAnswers: ChecklistAnswerResult[],
  batchItems: EmpiricalChecklistItem[]
): ChecklistAnswerResult[] {
  const itemIds = new Set(batchItems.map(i => i.id));
  const answerMap = new Map<string, ChecklistAnswerResult>();

  for (const raw of rawAnswers) {
    if (!itemIds.has(raw.itemId)) {
      console.warn(`[EmpiricalChecklistOrchestrationService] Ignoring unknown itemId from agent: ${raw.itemId}`);
      continue;
    }
    const answer = VALID_ANSWERS.has(raw.answer) ? raw.answer : 'unknown';
    const confidence = VALID_CONFIDENCES.has(raw.confidence) ? raw.confidence : 'low';
    answerMap.set(raw.itemId, { itemId: raw.itemId, answer, confidence, evidence: raw.evidence ?? null } as ChecklistAnswerResult);
  }

  for (const item of batchItems) {
    if (!answerMap.has(item.id)) {
      answerMap.set(item.id, { itemId: item.id, answer: 'unknown', confidence: 'low', evidence: null } as ChecklistAnswerResult);
    }
  }

  return Array.from(answerMap.values());
}

async function runAgentInBatches(
  agentService: EmpiricalChecklistAnswerAgentService,
  fileId: string,
  items: EmpiricalChecklistItem[]
): Promise<ChecklistAnswerResult[]> {
  const batches: EmpiricalChecklistItem[][] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    batches.push(items.slice(i, i + BATCH_SIZE));
  }

  console.log(`[EmpiricalChecklistOrchestrationService] Running ${batches.length} batch(es) in parallel (${items.length} items, batch size ${BATCH_SIZE})`);

  // Each batch gets its own thread — run all in parallel
  const batchResults = await Promise.all(
    batches.map(async (batch, idx) => {
      console.log(`[EmpiricalChecklistOrchestrationService] Batch ${idx + 1}/${batches.length} started (${batch.length} items)`);
      const response = await agentService.runChecklistAnswering(fileId, batch);
      const validated = validateBatchAnswers(response.answers ?? [], batch);
      console.log(`[EmpiricalChecklistOrchestrationService] Batch ${idx + 1}/${batches.length} complete: ${validated.length} answers`);
      return validated;
    })
  );

  return batchResults.flat();
}

export async function runChecklistAnswers(
  paperId: string,
  standards: string[],
  role: string,
  pdfBuffer: Buffer
): Promise<EmpiricalChecklistResult> {
  const answerRepo = AppDataSource.getRepository(EmpiricalChecklistAnswer);

  // Step 1: Find or create configuration
  const configuration = await getOrCreateConfiguration(role, standards);

  // Step 2: Find or scrape items (always reuse scraped items)
  const items = await getOrScrapeItems(configuration);

  // Step 3: Delete any existing answers for this paper + configuration (always overwrite)
  const existing = await answerRepo.find({ where: { paperId, configurationId: configuration.id } });
  if (existing.length > 0) {
    await answerRepo.remove(existing);
    console.log(`[EmpiricalChecklistOrchestrationService] Deleted ${existing.length} existing answers for paper ${paperId}`);
  }

  // Step 4: Upload PDF once, then run agent in batches
  console.log(`[EmpiricalChecklistOrchestrationService] Running checklist answer agent for paper ${paperId} (${items.length} items, batch size ${BATCH_SIZE})`);
  const agentService = new EmpiricalChecklistAnswerAgentService();
  const fileId = await agentService.uploadPdf(pdfBuffer, `paper_${paperId}.pdf`);
  const allAnswers = await runAgentInBatches(agentService, fileId, items);

  // Step 5: Save all answers
  const answerEntities = answerRepo.create(
    allAnswers.map(v => ({
      paperId,
      configurationId: configuration.id,
      checklistItemId: v.itemId,
      answer: v.answer,
      confidence: v.confidence,
      evidence: v.evidence,
    }))
  );
  await answerRepo.save(answerEntities);
  console.log(`[EmpiricalChecklistOrchestrationService] Saved ${answerEntities.length} answers`);

  return formatResult(configuration, items, answerEntities);
}

export async function getStoredChecklistAnswers(
  paperId: string,
  standards: string[],
  role: string
): Promise<EmpiricalChecklistResult | null> {
  const configKey = buildConfigKey(role, standards);
  const configRepo = AppDataSource.getRepository(EmpiricalChecklistConfiguration);
  const configuration = await configRepo.findOne({ where: { configKey } });
  if (!configuration) return null;

  const items = await AppDataSource.getRepository(EmpiricalChecklistItem).find({
    where: { configurationId: configuration.id },
  });
  if (items.length === 0) return null;

  const answers = await AppDataSource.getRepository(EmpiricalChecklistAnswer).find({
    where: { paperId, configurationId: configuration.id },
  });
  if (answers.length === 0) return null;

  return formatResult(configuration, items, answers);
}

function formatResult(
  configuration: EmpiricalChecklistConfiguration,
  items: EmpiricalChecklistItem[],
  answers: EmpiricalChecklistAnswer[]
): EmpiricalChecklistResult {
  return {
    checklistConfiguration: {
      id: configuration.id,
      role: configuration.role,
      standards: configuration.standards,
      resultUrl: configuration.resultUrl,
      createdAt: configuration.createdAt,
    },
    items: items
      .sort((a, b) => a.itemOrder - b.itemOrder)
      .map(item => ({
        id: item.id,
        standard: item.standard,
        sectionTitle: item.sectionTitle,
        itemText: item.itemText,
        itemOrder: item.itemOrder,
      })),
    answers: answers.map(a => ({
      itemId: a.checklistItemId,
      answer: a.answer,
      confidence: a.confidence,
      evidence: a.evidence,
      createdAt: a.createdAt,
    })),
  };
}
