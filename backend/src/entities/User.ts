import { Entity, PrimaryGeneratedColumn, Column, TableInheritance, OneToMany } from 'typeorm';
import { EmailNotification } from './EmailNotification';

@Entity()
@TableInheritance({ column: { type: 'varchar', name: 'type' } })
export abstract class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column('simple-array', { nullable: true })
  role: string[];

  @Column({ default: 0 })
  failedLogins: number;

  @Column({ nullable: true })
  lockedUntil: Date;

  @OneToMany(() => EmailNotification, notification => notification.recipient)
  notifications: EmailNotification[];
}
