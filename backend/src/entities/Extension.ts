import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { Assignment } from './Assignment';

export enum ExtensionStatus {
  Pending = 'Pending',
  Approved = 'Approved',
  Rejected = 'Rejected'
}

@Entity()
export class Extension {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  reason: string;

  @Column({ nullable: true })
  acceptedDate: Date;

  @Column({
    type: 'simple-enum',
    enum: ExtensionStatus,
    default: ExtensionStatus.Pending
  })
  status: ExtensionStatus;

  @OneToOne(() => Assignment, assignment => assignment.extension)
  @JoinColumn()
  assignment: Assignment;
}
