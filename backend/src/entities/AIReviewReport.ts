import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Round } from './Round';

@Entity()
export class AIReviewReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  reviewText: string;

  @Column({ nullable: true })
  annotatedPdfUrl: string;

  @Column({ nullable: true })
  venue: string;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @ManyToOne(() => Round, round => round.aiReviewReports)
  round: Round;

  @OneToMany(() => CitationSuggestion, suggestion => suggestion.report)
  citationSuggestions: CitationSuggestion[];
}

@Entity()
export class CitationSuggestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column()
  authors: string;

  @Column()
  year: number;

  @Column()
  venue: string;

  @Column({ nullable: true })
  doi: string;

  @Column('text')
  evidence: string;

  @ManyToOne(() => AIReviewReport, report => report.citationSuggestions)
  report: AIReviewReport;
}
