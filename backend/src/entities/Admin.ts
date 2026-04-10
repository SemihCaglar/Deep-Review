import { ChildEntity } from 'typeorm';
import { User, UserRole } from './User';

@ChildEntity()
export class Admin extends User {
  constructor() {
    super();
    this.role = UserRole.Admin;
  }
}
