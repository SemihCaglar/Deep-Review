export interface RuleProperty {
  exists: boolean;
  value: string | number | boolean | string[] | null;
  unit: string;
  sourceText: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface SubmissionRulesJSON {
  sourceUrl: string;
  rules: {
    pageLimit: RuleProperty;
    abstractWordCount: RuleProperty;
    requiredSections: RuleProperty;
    referenceFormat: RuleProperty;
    anonymityRequired: RuleProperty;
    pdfMetadataAnonymizationRequired: RuleProperty;
    artifactLinkAnonymizationRequired: RuleProperty;
  };
}
