import { User } from './User';

export class Admin extends User {
  constructor(id: string, name: string, email: string) {
    super(id, name, email);
  }
}
