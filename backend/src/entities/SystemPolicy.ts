import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Enum of all configurable system policy keys.
 * Values are stored as text strings; the service layer is responsible
 * for casting them to the correct data type (number, boolean, etc.)
 */
export enum PolicyKey {
  // Authentication / security
  MAX_FAILED_LOGINS        = 'MAX_FAILED_LOGINS',         // integer, e.g. "5"
  FAILED_LOGIN_WINDOW_MINS = 'FAILED_LOGIN_WINDOW_MINS',  // integer, e.g. "10"
  ACCOUNT_LOCK_MINS        = 'ACCOUNT_LOCK_MINS',         // integer, e.g. "10"
  PASSWORD_RESET_TOKEN_EXP_MINS = 'PASSWORD_RESET_TOKEN_EXP_MINS', // integer, e.g. "15"

  // Review process
  DEFAULT_DEADLINE_DAYS    = 'DEFAULT_DEADLINE_DAYS',     // integer, e.g. "14"
  MIN_REVIEWERS_PER_ROUND  = 'MIN_REVIEWERS_PER_ROUND',   // integer, e.g. "2"
  MAX_ACTIVE_ASSIGNMENTS   = 'MAX_ACTIVE_ASSIGNMENTS',    // integer, e.g. "5"
  ENABLE_AI_REVIEW         = 'ENABLE_AI_REVIEW',          // boolean, e.g. "true"

  // Email
  EMAIL_RETRY_COUNT        = 'EMAIL_RETRY_COUNT',         // integer, e.g. "3"
  EMAIL_RETRY_BACKOFF_SECS = 'EMAIL_RETRY_BACKOFF_SECS',  // integer, e.g. "30"
  EMAIL_SUBMISSION_TIMEOUT_SECS = 'EMAIL_SUBMISSION_TIMEOUT_SECS', // integer, e.g. "30"
}

@Entity()
export class SystemPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * The policy key. Use the PolicyKey enum to identify the setting.
   */
  @Column({
    type: 'simple-enum',
    enum: PolicyKey,
    unique: true,
  })
  key: PolicyKey;

  /**
   * The policy value, stored as a string regardless of the underlying data type.
   * The service layer must cast this to the appropriate type based on the key.
   * Examples:
   *   MAX_FAILED_LOGINS → parseInt(value)
   *   ENABLE_AI_REVIEW  → value === 'true'
   */
  @Column({ type: 'text' })
  value: string;

  /**
   * A human-readable description of what this policy controls,
   * shown in the Admin Dashboard.
   */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
