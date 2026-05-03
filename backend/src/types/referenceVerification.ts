export type ReferenceStatus =
  | 'verified'
  | 'possible_match'
  | 'not_found'
  | 'metadata_mismatch'
  | 'parse_failed';

export interface ParsedReference {
  rawText: string;
  doi: string | null;
  year: number | null;
  title: string | null;
}

export interface VerifiedReference {
  index: number;
  rawText: string;
  parsedDoi: string | null;
  parsedYear: number | null;
  parsedTitle: string | null;
  status: ReferenceStatus;
  openAlexTitle: string | null;
  openAlexDoi: string | null;
  openAlexYear: number | null;
  note: string | null;
}

export interface ReferenceVerificationReport {
  generatedAt: string;
  totalReferences: number;
  verifiedCount: number;
  possibleMatchCount: number;
  notFoundCount: number;
  metadataMismatchCount: number;
  parseFailedCount: number;
  references: VerifiedReference[];
  issues: string[];
}
