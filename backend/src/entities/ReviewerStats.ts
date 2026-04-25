import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { User } from './User';

/**
 * Cached analytics per reviewer, used to power the competition-style Dashboard.
 * This table is recomputed whenever a Rating or Assignment changes.
 * (SQLite does not support automatic materialized views, so we maintain
 * this table explicitly via the ReviewerStats service.)
 */
@Entity()
export class ReviewerStats {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  /** Total number of assignments ever issued to this reviewer. */
  @Column({ default: 0 })
  totalAssigned: number;

  /** Total assignments where the reviewer submitted a completed review. */
  @Column({ default: 0 })
  totalCompleted: number;

  /** Total assignments where the reviewer accepted but did not submit (reliability flag). */
  @Column({ default: 0 })
  totalIncomplete: number;

  /** Total times the reviewer declined an assignment. */
  @Column({ default: 0 })
  totalDeclined: number;

  /** Average quality-of-review score (1–5), computed from Rating.qualityScore. */
  @Column({ type: 'float', nullable: true })
  avgQualityScore: number | null;

  /** Average quantity-of-review score (1–5), computed from Rating.quantityScore. */
  @Column({ type: 'float', nullable: true })
  avgQuantityScore: number | null;

  /** Average timeliness score (1–5), computed from Rating.timeScore. */
  @Column({ type: 'float', nullable: true })
  avgTimeScore: number | null;

  /** Last time these stats were recomputed. */
  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
