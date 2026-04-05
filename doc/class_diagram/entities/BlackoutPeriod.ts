import { LabMember } from './LabMember';

export class BlackoutPeriod {
  id: string;
  startDate: Date;
  endDate: Date;
  reason?: string;

  // Relationships
  member: LabMember; // Many-to-one

  constructor(id: string, member: LabMember, startDate: Date, endDate: Date) {}
}
