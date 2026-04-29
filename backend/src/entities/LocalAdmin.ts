import { ChildEntity, Column, JoinColumn, OneToOne } from 'typeorm';
import { User, UserRole } from './User';
import type { Lab } from './Lab';

@ChildEntity()
export class LocalAdmin extends User {
  constructor() {
    super();
    this.role = UserRole.LocalAdmin;
  }

  /**
   * Additional notification emails for lab updates.
   * Stored as a simple JSON array of strings.
   */
  @Column({ type: 'simple-json', nullable: true })
  notificationEmails: string[] | null;

  /**
   * The specific lab this admin manages.
   */
  @OneToOne('Lab', 'localAdmin')
  lab: Lab;
}
