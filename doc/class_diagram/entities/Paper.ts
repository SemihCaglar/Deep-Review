import { LabMember } from './LabMember';
import { Coordinator } from './Coordinator';
import { Topic } from './Topic';
import { Round } from './Round';

export enum PaperStatus {
  Draft = 'Draft',
  Registered = 'Registered',
  HumanReview = 'HumanReview',
  AIReview = 'AIReview',
  Completed = 'Completed',
  Closed = 'Closed',
  Archived = 'Archived'
}

export class Paper {
  id: string;
  title: string;
  abstractText: string;
  creationTime: Date;
  targetVenue: string;
  status: PaperStatus;
  
  manuscriptUrl?: string;
  overleafLink?: string;

  // Relationships
  authors: LabMember[]; // Many-to-many 
  coordinator: Coordinator; // Many-to-one
  topics: Topic[]; // Many-to-many
  parentPapers: Paper[]; // Many-to-many (Papers this one extends)
  rounds: Round[]; // One-to-many

  constructor(id: string, title: string, abstractText: string, coordinator: Coordinator) {}
}
