export interface ChecklistAnswerResult {
  itemId: string;
  answer: "yes" | "no" | "unknown";
  confidence: "high" | "medium" | "low";
  evidence: string | null;
}

export interface ChecklistAnswerAgentResponse {
  answers: ChecklistAnswerResult[];
}

export interface EmpiricalChecklistItemData {
  configurationId: string;
  standard: string;
  sectionTitle: string | null;
  itemText: string;
  itemOrder: number;
}

export interface EmpiricalChecklistResult {
  checklistConfiguration: {
    id: string;
    role: string;
    standards: string[];
    resultUrl: string;
    createdAt: Date;
  };
  items: {
    id: string;
    standard: string;
    sectionTitle: string | null;
    itemText: string;
    itemOrder: number;
  }[];
  answers: {
    itemId: string;
    answer: string;
    confidence: string;
    evidence: string | null;
    createdAt: Date;
  }[];
}
