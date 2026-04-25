import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
<<<<<<< HEAD
  Unique,
  ManyToOne,
  JoinColumn,
=======
  ManyToOne,
>>>>>>> issue-41
} from 'typeorm';
import type { Lab } from './Lab';

/**
 * Enum of all valid template names in the system.
 * Template bodies may contain placeholder variables — see README.md
 * for the full list of supported placeholders (e.g. {{userName}}).
 */
export enum TemplateName {
  REVIEW_INVITATION   = 'REVIEW_INVITATION',
  REVIEW_REMINDER     = 'REVIEW_REMINDER',
  DEADLINE_REMINDER   = 'DEADLINE_REMINDER',
  REVIEW_OVERDUE      = 'REVIEW_OVERDUE',
  DECLINE_REQUEST     = 'DECLINE_REQUEST',
  EXTENSION_REQUEST   = 'EXTENSION_REQUEST',
  DECLINE_APPROVED    = 'DECLINE_APPROVED',
  DECLINE_REJECTED    = 'DECLINE_REJECTED',
  EXTENSION_APPROVED  = 'EXTENSION_APPROVED',
  EXTENSION_REJECTED  = 'EXTENSION_REJECTED',
  ACCOUNT_APPROVED    = 'ACCOUNT_APPROVED',
  ACCOUNT_REJECTED    = 'ACCOUNT_REJECTED',
  PASSWORD_RESET      = 'PASSWORD_RESET',
}

@Entity()
<<<<<<< HEAD
@Unique(['name', 'lab'])
=======
>>>>>>> issue-41
export class Template {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * The template identifier. Use the TemplateName enum.
   */
  @Column({
    type: 'simple-enum',
    enum: TemplateName,
<<<<<<< HEAD
=======
    unique: true,
>>>>>>> issue-41
  })
  name: TemplateName;

  /**
   * The email subject line. May include placeholders (e.g., {{paperTitle}}).
   */
  @Column()
  subject: string;

  /**
   * The email body. May contain placeholders — see README.md for the
   * full reference table of supported variables.
   * Example: "Dear {{userName}}, you have been invited to review {{paperTitle}}."
   */
  @Column({ type: 'text' })
  body: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;

<<<<<<< HEAD
  @ManyToOne('Lab', { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn()
  lab: Lab | null;
=======
  /**
   * The lab this template belongs to.
   */
  @ManyToOne('Lab', 'templates', { nullable: false, onDelete: 'CASCADE' })
  lab: Lab;
>>>>>>> issue-41
}
