import { ChildEntity, OneToMany, OneToOne } from 'typeorm';
import { User, UserRole } from './User';
import type { Paper } from './Paper';
import type { Lab } from './Lab';

@ChildEntity()
export class Coordinator extends User {
  constructor() {
    super();
    this.role = UserRole.Coordinator;
  }

  @OneToMany('Paper', 'coordinator')
  coordinatedPapers: Paper[];

  @OneToOne('Lab', 'coordinator')
  lab: Lab;
}
