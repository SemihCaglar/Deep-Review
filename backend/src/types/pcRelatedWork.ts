export type ProgramCommitteeMember = {
  id: string;
  name: string;
  affiliation: string | null;
  role: string | null;
  sourceUrl: string;
};

export type PCMemberPaper = {
  openAlexId: string;
  pcMemberName: string;
  openAlexAuthorId: string;
  title: string;
  abstract: string | null;
  year: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
};

export type RelationshipType =
  | 'same_problem'
  | 'same_method'
  | 'same_domain'
  | 'same_dataset'
  | 'background'
  | 'weakly_related'
  | 'unrelated';

export type RelatedWorkRecommendation = {
  pcMemberName: string;
  paperTitle: string;
  paperAbstract: string | null;
  year: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
  relevant: boolean;
  confidence: 'high' | 'medium' | 'low';
  relationshipType: RelationshipType;
  recommendationReason: string;
};

export type PCRelatedWorkResponse = {
  venueUrl: string;
  paperTitle: string;
  summary: {
    pcMembersExtracted: number;
    pcMembersMatchedInOpenAlex: number;
    candidatePapersChecked: number;
    recommendationsReturned: number;
  };
  recommendations: RelatedWorkRecommendation[];
  issues: string[];
};
