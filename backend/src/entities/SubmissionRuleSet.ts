import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { SubmissionRulesJSON } from '../types/submissionRules';

@Entity('submission_rule_sets')
export class SubmissionRuleSet {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text', { unique: true })
  sourceUrl!: string;

  @Column('simple-json')
  rules!: SubmissionRulesJSON['rules'];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
