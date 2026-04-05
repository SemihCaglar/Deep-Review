import { Round } from './Round';

export class CitationSuggestion {
  id: string;
  title: string;
  authors: string;
  year: number;
  venue: string;
  doi?: string;
  evidence: string;

  constructor(id: string, title: string, authors: string, evidence: string) {}
}

export class AIReviewReport {
  id: string;
  generatedReportUrl: string;
  annotatedPdfUrl: string;

  // Relationships
  round: Round; // One-to-one
  citationSuggestions: CitationSuggestion[]; // One-to-many

  constructor(id: string, round: Round, generatedReportUrl: string, annotatedPdfUrl: string) {}
}
