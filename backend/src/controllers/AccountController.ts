import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { LabMember } from '../entities/LabMember';
import { ApprovalStatus } from '../entities/User';
import { hashPassword } from '../services/accountSecurity';

export class AccountController {
  static async signUp(req: Request, res: Response) {
    const { name, email, password } = req.body ?? {};

    if (
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !name.trim() ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({ message: 'name, email, and password are required' });
    }

    const memberRepo = AppDataSource.getRepository(LabMember);
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await memberRepo.findOne({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(409).json({ message: 'Email is already in use' });
    }

    const member = memberRepo.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: await hashPassword(password),
      approvalStatus: ApprovalStatus.Pending,
      approvalReviewedAt: null,
      approvalNote: null,
      failedLogins: 0,
      failedLoginWindowStartedAt: null,
      lockedUntil: null,
      lastLoginAt: null,
    });

    let savedMember: LabMember;

    try {
      savedMember = await memberRepo.save(member);
    } catch (error) {
      if (AccountController.isUniqueConstraintError(error)) {
        return res.status(409).json({ message: 'Email is already in use' });
      }

      throw error;
    }

    return res.status(201).json({
      message: 'Signup submitted and pending approval',
      user: AccountController.serializeAccount(savedMember),
    });
  }
  static async login(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async logout(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async changePassword(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async sendPasswordReset(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async resetPassword(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async updateProfile(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async setInterests(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async setBlackoutPeriods(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async approveSignUp(req: Request, res: Response) {
    const memberRepo = AppDataSource.getRepository(LabMember);
    const member = await memberRepo.findOne({ where: { id: req.params.id } });

    if (!member) {
      return res.status(404).json({ message: 'Pending signup not found' });
    }

    if (member.approvalStatus !== ApprovalStatus.Pending) {
      return res.status(409).json({ message: 'Only pending signups can be approved' });
    }

    const note = AccountController.parseApprovalNote(req.body?.note);

    member.approvalStatus = ApprovalStatus.Approved;
    member.approvalReviewedAt = new Date();
    member.approvalNote = note;

    const savedMember = await memberRepo.save(member);

    return res.status(200).json({
      message: 'Signup approved',
      user: AccountController.serializeAccount(savedMember),
    });
  }
  static async rejectSignUp(req: Request, res: Response) {
    const memberRepo = AppDataSource.getRepository(LabMember);
    const member = await memberRepo.findOne({ where: { id: req.params.id } });

    if (!member) {
      return res.status(404).json({ message: 'Pending signup not found' });
    }

    if (member.approvalStatus !== ApprovalStatus.Pending) {
      return res.status(409).json({ message: 'Only pending signups can be rejected' });
    }

    const note = AccountController.parseApprovalNote(req.body?.note);

    member.approvalStatus = ApprovalStatus.Rejected;
    member.approvalReviewedAt = new Date();
    member.approvalNote = note;

    const savedMember = await memberRepo.save(member);

    return res.status(200).json({
      message: 'Signup rejected',
      user: AccountController.serializeAccount(savedMember),
    });
  }

  private static parseApprovalNote(note: unknown): string | null {
    if (typeof note !== 'string') {
      return null;
    }

    const trimmedNote = note.trim();
    return trimmedNote ? trimmedNote : null;
  }

  private static serializeAccount(member: LabMember) {
    return {
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      approvalStatus: member.approvalStatus,
      approvalReviewedAt: member.approvalReviewedAt,
      approvalNote: member.approvalNote,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
    };
  }

  private static isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Error && error.message.includes('UNIQUE constraint failed');
  }
}
