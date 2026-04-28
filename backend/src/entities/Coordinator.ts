import { ChildEntity, ManyToMany, OneToOne } from 'typeorm';
import { User, UserRole } from './User';
import type { Paper } from './Paper';
import type { Lab } from './Lab';

@ChildEntity()
export class Coordinator extends User {
  constructor() {
    super();
    this.role = UserRole.Coordinator;
  }

  @ManyToMany('Paper', 'coordinators')
  coordinatedPapers: Paper[];

  @OneToOne('Lab', 'coordinator')
  lab: Lab;
}
