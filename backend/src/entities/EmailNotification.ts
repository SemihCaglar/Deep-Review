import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { User } from './User';

export enum EmailStatus {
  Pending = 'Pending',
  Sent = 'Sent',
  Failed = 'Failed'
}

@Entity()
export class EmailNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  subject: string;

  @Column('text')
  body: string;

  @Column({ nullable: true })
  sentAt: Date;

  @Column({
    type: 'simple-enum',
    enum: EmailStatus,
    default: EmailStatus.Pending
  })
  status: EmailStatus;

  @ManyToOne(() => User, user => user.notifications)
  recipient: User;
}
