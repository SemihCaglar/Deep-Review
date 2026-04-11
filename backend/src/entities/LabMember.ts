import { ChildEntity } from 'typeorm';
import { User, UserRole } from './User';

@ChildEntity()
export class LabMember extends User {
  constructor() {
    super();
    this.role = UserRole.LabMember;
  }
}
