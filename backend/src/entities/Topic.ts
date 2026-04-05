import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Topic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;
}
