export type ComplianceStatus = 'pass' | 'fail' | 'unknown' | 'skipped';
export type ConfidenceLevel = 'high' | 'medium' | 'low' | null;

export interface RuleComplianceResult {
  status: ComplianceStatus;
  details: string | null;
  confidence: ConfidenceLevel;
}

export interface ComplianceReport {
  pageLimit: RuleComplianceResult;
  abstractWordCount: RuleComplianceResult;
  requiredSections: RuleComplianceResult;
  referenceFormat: RuleComplianceResult;
  anonymityRequired: RuleComplianceResult;
  pdfMetadataAnonymizationRequired: RuleComplianceResult;
  artifactLinkAnonymizationRequired: RuleComplianceResult;
}
