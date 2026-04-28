import { NextFunction, Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { ApprovalStatus, User, UserRole } from '../entities/User';
import { isAccountLocked } from '../services/accountSecurity';
import { verifyAuthToken } from '../services/tokenService';
import type { AuthenticatedRequest } from '../types/auth';

export async function authenticateRequest(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const authorizationHeader = req.header('authorization');

  if (!authorizationHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const token = authorizationHeader.slice('Bearer '.length).trim();
  const payload = verifyAuthToken(token);

  if (!payload) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  const userRepo = AppDataSource.getRepository<User>('User');
  const user = await userRepo.findOne({ where: { id: payload.sub } });

  if (!user) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  if (user.approvalStatus !== ApprovalStatus.Approved) {
    return res.status(403).json({ message: 'Account is not approved' });
  }

  if (isAccountLocked(user)) {
    return res.status(423).json({ message: 'Account is temporarily locked' });
  }

  req.user = user;

  return next();
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  if (!req.user || (req.user.role !== UserRole.GlobalAdmin && req.user.role !== UserRole.LocalAdmin)) {
    return res.status(403).json({ message: 'Admin access required' });
  }

  return next();
}
