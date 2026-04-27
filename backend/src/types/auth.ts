import type { Request } from 'express';
import type { User } from '../entities/User';

export type AuthenticatedRequest = Request & {
  user?: User;
};
