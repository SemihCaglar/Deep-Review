import { SubmissionRulesJSON, RuleProperty } from '../../types/submissionRules';

const REQUIRED_RULE_KEYS = [
  'pageLimit',
  'abstractWordCount',
  'requiredSections',
  'referenceFormat',
  'anonymityRequired',
  'pdfMetadataAnonymizationRequired',
  'artifactLinkAnonymizationRequired',
];

export function validateRulesJson(data: any): SubmissionRulesJSON {
  if (!data || typeof data !== 'object') {
    throw new Error('Rules must be a JSON object');
  }

  if (typeof data.sourceUrl !== 'string' || !data.sourceUrl.trim()) {
    throw new Error('sourceUrl must be a non-empty string');
  }

  if (!data.rules || typeof data.rules !== 'object') {
    throw new Error('rules must be an object');
  }

  // Validate each required rule property
  for (const key of REQUIRED_RULE_KEYS) {
    const rule = data.rules[key];
    validateRuleProperty(rule, key);
  }

  return data as SubmissionRulesJSON;
}

function validateRuleProperty(rule: any, key: string): void {
  if (!rule || typeof rule !== 'object') {
    throw new Error(`Rule ${key} must be an object`);
  }

  if (typeof rule.exists !== 'boolean') {
    throw new Error(`Rule ${key}: exists must be a boolean`);
  }

  if (!['high', 'medium', 'low'].includes(rule.confidence)) {
    throw new Error(`Rule ${key}: confidence must be one of: high, medium, low`);
  }

  // If exists is false, value and sourceText should be null
  if (!rule.exists) {
    if (rule.value !== null) {
      throw new Error(`Rule ${key}: value must be null when exists is false`);
    }
    if (rule.sourceText !== null) {
      throw new Error(`Rule ${key}: sourceText must be null when exists is false`);
    }
  } else {
    // If exists is true, validate value based on unit
    if (rule.value === null) {
      throw new Error(`Rule ${key}: value cannot be null when exists is true`);
    }

    // sourceText should be a string or null, but ideally not null if exists is true
    if (rule.sourceText !== null && typeof rule.sourceText !== 'string') {
      throw new Error(`Rule ${key}: sourceText must be a string or null`);
    }
  }

  // Validate unit is a string
  if (typeof rule.unit !== 'string') {
    throw new Error(`Rule ${key}: unit must be a string`);
  }
}
