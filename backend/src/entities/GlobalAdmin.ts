import { ChildEntity } from 'typeorm';
import { User, UserRole } from './User';

@ChildEntity()
export class GlobalAdmin extends User {
  constructor() {
    super();
    this.role = UserRole.GlobalAdmin;
  }
}
