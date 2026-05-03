import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import type { User } from './User';
import type { Lab } from './Lab';

/**
 * Enum of critical actions that are tracked in the audit log.
 */
export enum AuditAction {
  // Authentication
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_COMPLETE = 'PASSWORD_RESET_COMPLETE',

  // User management
  SIGNUP = 'SIGNUP',
  CREATE_USER = 'CREATE_USER',
  UPDATE_USER_ROLE = 'UPDATE_USER_ROLE',
  APPROVE_USER = 'APPROVE_USER',
  REJECT_USER = 'REJECT_USER',
  DELETE_USER = 'DELETE_USER',
  LOCK_USER = 'LOCK_USER',

  // Paper management
  CREATE_PAPER = 'CREATE_PAPER',
  UPDATE_PAPER = 'UPDATE_PAPER',
  DELETE_PAPER = 'DELETE_PAPER',

  // Round management
  CREATE_ROUND = 'CREATE_ROUND',
  UPDATE_ROUND = 'UPDATE_ROUND',
  CLOSE_ROUND = 'CLOSE_ROUND',
  START_NEXT_ROUND = 'START_NEXT_ROUND',

  // Reviewer assignment
  ASSIGN_REVIEWER = 'ASSIGN_REVIEWER',
  REASSIGN_REVIEWER = 'REASSIGN_REVIEWER',
  APPROVE_DECLINE = 'APPROVE_DECLINE',
  REJECT_DECLINE = 'REJECT_DECLINE',
  APPROVE_EXTENSION = 'APPROVE_EXTENSION',
  REJECT_EXTENSION = 'REJECT_EXTENSION',

  // System configuration
  UPDATE_POLICY = 'UPDATE_POLICY',
  UPDATE_TEMPLATE = 'UPDATE_TEMPLATE',
  UPDATE_TOPIC = 'UPDATE_TOPIC',
}

@Entity()
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * The type of action performed. Use the AuditAction enum.
   */
  @Column({
    type: 'simple-enum',
    enum: AuditAction,
  })
  action: AuditAction;

  /**
   * The name of the entity that was affected (e.g., 'User', 'Paper', 'Round').
   */
  @Column({ type: 'text', nullable: true })
  entityType: string | null;

  /**
   * The UUID of the specific entity that was affected.
   */
  @Column({ type: 'text', nullable: true })
  entityId: string | null;

  /**
   * A JSON-serialized object capturing relevant context, such as before/after
   * values. Parse with JSON.parse() when reading.
   * Example: '{ "oldRole": "LabMember", "newRole": "Coordinator" }'
   */
  @Column({ type: 'text', nullable: true })
  details: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  /**
   * The user who performed this action.
   */
  @ManyToOne('User', { nullable: true, onDelete: 'SET NULL' })
  actor: User | null;

  /**
   * The lab associated with this action, if any.
   */
  @ManyToOne('Lab', { nullable: true, onDelete: 'CASCADE' })
  lab: Lab | null;
}
