import { Request, Response } from 'express';
import { In } from 'typeorm';
import { AppDataSource } from '../data-source';
import { LabMember } from '../entities/LabMember';
import { PasswordResetToken } from '../entities/PasswordResetToken';
import { Topic } from '../entities/Topic';
import { ApprovalStatus, User, UserRole } from '../entities/User';
import { Lab } from '../entities/Lab';
import { Coordinator } from '../entities/Coordinator';
import {
  accountSecurityPolicy,
  clearLoginLockout,
  createPasswordResetToken,
  hashPasswordResetToken,
  hashPassword,
  isAccountLocked,
  registerFailedLoginAttempt,
  registerSuccessfulLogin,
  verifyPassword,
} from '../services/accountSecurity';
import { sendEmail } from '../services/emailService';
import { generateAuthToken } from '../services/tokenService';
import type { AuthenticatedRequest } from '../types/auth';

export class AccountController {
  static async signUp(req: Request, res: Response) {
    const { name, email, password, labId } = req.body ?? {};

    if (
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !name.trim() ||
      !email.trim() ||
      !password ||
      typeof labId !== 'string' ||
      !labId.trim()
    ) {
      return res.status(400).json({ message: 'name, email, password, and labId are required' });
    }

    const memberRepo = AppDataSource.getRepository(LabMember);
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await memberRepo.findOne({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(409).json({ message: 'Email is already in use' });
    }

    const labRepo = AppDataSource.getRepository(Lab);
    const requestedLab = await labRepo.findOne({ where: { id: labId.trim() } });

    if (!requestedLab) {
      return res.status(400).json({ message: 'Selected lab was not found' });
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
      otherInterests: [],
      requestedLab,
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
    const { email, password } = req.body ?? {};

    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }

    const userRepo = AppDataSource.getRepository<User>('User');
    const normalizedEmail = email.trim().toLowerCase();
    const user = await userRepo.findOne({ 
      where: { email: normalizedEmail },
      relations: ['labs', 'lab'] as any
    });

    if (!user) {
      return AccountController.authenticationFailed(res);
    }

    if (user.approvalStatus !== ApprovalStatus.Approved) {
      return res.status(403).json({ message: 'Account is not approved' });
    }

    if (isAccountLocked(user)) {
      return res.status(423).json({ message: 'Account is temporarily locked' });
    }

    const passwordMatches = await verifyPassword(password, user.passwordHash);

    if (!passwordMatches) {
      registerFailedLoginAttempt(user);
      await userRepo.save(user);

      if (isAccountLocked(user)) {
        return res.status(423).json({ message: 'Account is temporarily locked' });
      }

      return AccountController.authenticationFailed(res);
    }

    registerSuccessfulLogin(user);
    const savedUser = await userRepo.save(user);

    return res.status(200).json({
      message: 'Login successful',
      token: generateAuthToken(savedUser),
      user: AccountController.serializeAccount(savedUser),
    });
  }
  static async logout(req: Request, res: Response) {
    return res.status(200).json({ message: 'Logout successful' });
  }
  static async changePassword(req: AuthenticatedRequest, res: Response) {
    const authenticatedUser = req.user;
    const { currentPassword, newPassword, confirmNewPassword } = req.body ?? {};

    if (!authenticatedUser) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (
      typeof currentPassword !== 'string' ||
      typeof newPassword !== 'string' ||
      typeof confirmNewPassword !== 'string' ||
      !currentPassword ||
      !newPassword ||
      !confirmNewPassword
    ) {
      return res
        .status(400)
        .json({ message: 'currentPassword, newPassword, and confirmNewPassword are required' });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ message: 'New passwords do not match' });
    }

    const userRepo = AppDataSource.getRepository<User>('User');
    const user = await userRepo.findOne({ where: { id: authenticatedUser.id } });

    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const currentPasswordMatches = await verifyPassword(currentPassword, user.passwordHash);

    if (!currentPasswordMatches) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const newPasswordMatchesCurrent = await verifyPassword(newPassword, user.passwordHash);

    if (newPasswordMatchesCurrent) {
      return res.status(400).json({ message: 'New password must be different from current password' });
    }

    user.passwordHash = await hashPassword(newPassword);
    clearLoginLockout(user);

    await userRepo.save(user);

    return res.status(200).json({ message: 'Password changed successfully' });
  }
  static async getAllLabs(req: Request, res: Response) {
    const labRepo = AppDataSource.getRepository(Lab);
    const labs = await labRepo.find({ select: ['id', 'name', 'description'] });
    return res.status(200).json(labs);
  }
  static async sendPasswordReset(req: Request, res: Response) {
    const { email } = req.body ?? {};

    if (typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ message: 'email is required' });
    }

    const userRepo = AppDataSource.getRepository<User>('User');
    const tokenRepo = AppDataSource.getRepository(PasswordResetToken);
    const normalizedEmail = email.trim().toLowerCase();
    const user = await userRepo.findOne({ where: { email: normalizedEmail } });

    if (user) {
      const frontendBaseUrl = process.env.FRONTEND_BASE_URL?.replace(/\/$/, '');
      const emailDeliveryConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

      if (!frontendBaseUrl) {
        console.error('[password-reset] FRONTEND_BASE_URL is not configured; reset email was not sent.');
      } else if (!emailDeliveryConfigured) {
        console.error('[password-reset] SMTP is not configured; reset email was not sent.');
      } else {
        let savedToken: PasswordResetToken | null = null;

        try {
          const rawResetToken = createPasswordResetToken();
          const resetLink = `${frontendBaseUrl}/reset-password?token=${rawResetToken}`;
          const token = tokenRepo.create({
            tokenHash: hashPasswordResetToken(rawResetToken),
            expiresAt: new Date(Date.now() + accountSecurityPolicy.passwordResetTokenTtlMs),
            usedAt: null,
            user,
          });
          const subject = 'Reset your BILSEN password';
          const body =
            `Hello ${user.name},\n\n` +
            `We received a request to reset your BILSEN password.\n\n` +
            `Reset your password using this link:\n${resetLink}\n\n` +
            `If you did not request this change, you can safely ignore this email.`;

          savedToken = await tokenRepo.save(token);
          await sendEmail(user, subject, body);
        } catch (error) {
          console.error('[password-reset] Failed to prepare or send reset email.', error);

          if (savedToken) {
            try {
              await tokenRepo.remove(savedToken);
            } catch (cleanupError) {
              console.error('[password-reset] Failed to remove unsent reset token.', cleanupError);
            }
          }
        }
      }
    }

    return AccountController.passwordResetRequestAccepted(res);
  }
  static async resetPassword(req: Request, res: Response) {
    const { token, newPassword } = req.body ?? {};

    if (typeof token !== 'string' || typeof newPassword !== 'string' || !token.trim() || !newPassword) {
      return res.status(400).json({ message: 'token and newPassword are required' });
    }

    const tokenRepo = AppDataSource.getRepository(PasswordResetToken);
    const userRepo = AppDataSource.getRepository<User>('User');
    const resetToken = await tokenRepo.findOne({
      where: { tokenHash: hashPasswordResetToken(token.trim()) },
      relations: { user: true },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt.getTime() <= Date.now()) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    resetToken.user.passwordHash = await hashPassword(newPassword);
    resetToken.usedAt = new Date();

    await userRepo.save(resetToken.user);
    await tokenRepo.save(resetToken);

    return res.status(200).json({ message: 'Password reset successful' });
  }
  static async getProfile(req: AuthenticatedRequest, res: Response) {
    const authenticatedUser = req.user;

    if (!authenticatedUser) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userRepo = AppDataSource.getRepository<User>('User');
    const user = await userRepo.findOne({
      where: { id: authenticatedUser.id },
      relations: ['interests', 'labs', 'lab'] as any,
    });

    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    return res.status(200).json({
      user: AccountController.serializeAccount(user, { includeInterests: true }),
    });
  }
  static async getPendingSignUps(req: AuthenticatedRequest, res: Response) {
    const authenticatedUser = req.user;

    if (!authenticatedUser) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!AccountController.isCoordinatorOrAdmin(authenticatedUser)) {
      return res.status(403).json({ message: 'Coordinator access is required' });
    }

    const visibleLabIds = await AccountController.getVisibleLabIds(authenticatedUser);
    if (visibleLabIds.length === 0) {
      return res.status(200).json({ users: [] });
    }

    const userRepo = AppDataSource.getRepository<User>('User');
    const pendingUsers = await userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.requestedLab', 'requestedLab')
      .where('user.approvalStatus = :status', { status: ApprovalStatus.Pending })
      .andWhere('requestedLab.id IN (:...labIds)', { labIds: visibleLabIds })
      .orderBy('user.createdAt', 'ASC')
      .getMany();

    return res.status(200).json({
      users: pendingUsers.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        approvalStatus: user.approvalStatus,
        requestedLab: user.requestedLab ? { id: user.requestedLab.id, name: user.requestedLab.name } : null,
      })),
    });
  }
  static async getReviewedSignUps(req: AuthenticatedRequest, res: Response) {
    const authenticatedUser = req.user;

    if (!authenticatedUser) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!AccountController.isCoordinatorOrAdmin(authenticatedUser)) {
      return res.status(403).json({ message: 'Coordinator access is required' });
    }

    const visibleLabIds = await AccountController.getVisibleLabIds(authenticatedUser);
    if (visibleLabIds.length === 0) {
      return res.status(200).json({ users: [] });
    }

    const userRepo = AppDataSource.getRepository<User>('User');
    const reviewedUsers = await userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.requestedLab', 'requestedLab')
      .where('user.role = :role', { role: UserRole.LabMember })
      .andWhere('user.approvalStatus IN (:...statuses)', {
        statuses: [ApprovalStatus.Approved, ApprovalStatus.Rejected],
      })
      .andWhere('requestedLab.id IN (:...labIds)', { labIds: visibleLabIds })
      .orderBy('user.approvalReviewedAt', 'DESC')
      .getMany();

    return res.status(200).json({
      users: reviewedUsers.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        approvalStatus: user.approvalStatus,
        approvalReviewedAt: user.approvalReviewedAt,
        approvalNote: user.approvalNote,
        requestedLab: user.requestedLab ? { id: user.requestedLab.id, name: user.requestedLab.name } : null,
      })),
    });
  }
  static async getLabMembers(req: AuthenticatedRequest, res: Response) {
    const authenticatedUser = req.user;

    if (!authenticatedUser) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const visibleLabIds = await AccountController.getVisibleLabIds(authenticatedUser);
    if (visibleLabIds.length === 0) {
      return res.status(200).json({ users: [] });
    }

    const userRepo = AppDataSource.getRepository<User>('User');
    const approvedUsers = await userRepo
      .createQueryBuilder('user')
      .innerJoin('user.labs', 'lab')
      .where('user.approvalStatus = :status', { status: ApprovalStatus.Approved })
      .andWhere('user.role != :adminRole', { adminRole: UserRole.Admin })
      .andWhere('lab.id IN (:...labIds)', { labIds: visibleLabIds })
      .orderBy('user.name', 'ASC')
      .getMany();

    return res.status(200).json({
      users: approvedUsers.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      })),
    });
  }
  static async updateProfile(req: AuthenticatedRequest, res: Response) {
    const { name, email } = req.body ?? {};
    const authenticatedUser = req.user;

    if (!authenticatedUser) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'name is required' });
    }

    if (typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ message: 'email is required' });
    }

    const userRepo = AppDataSource.getRepository<User>('User');
    const normalizedEmail = email.trim().toLowerCase();
    const user = await userRepo.findOne({ where: { id: authenticatedUser.id } });

    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (normalizedEmail !== user.email) {
      const existingUser = await userRepo.findOne({ where: { email: normalizedEmail } });

      if (existingUser && existingUser.id !== user.id) {
        return res.status(409).json({ message: 'Email is already in use' });
      }
    }

    user.name = name.trim();
    user.email = normalizedEmail;

    try {
      const savedUser = await userRepo.save(user);

      return res.status(200).json({
        message: 'Profile updated successfully',
        user: AccountController.serializeAccount(savedUser),
      });
    } catch (error) {
      if (AccountController.isUniqueConstraintError(error)) {
        return res.status(409).json({ message: 'Email is already in use' });
      }

      throw error;
    }
  }
  static async setInterests(req: AuthenticatedRequest, res: Response) {
    const { topicIds, otherInterests } = req.body ?? {};
    const authenticatedUser = req.user;

    if (!authenticatedUser) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!Array.isArray(topicIds) || !topicIds.every(topicId => typeof topicId === 'string' && topicId.trim())) {
      return res.status(400).json({ message: 'topicIds must be an array of strings' });
    }

    if (
      otherInterests !== undefined &&
      !Array.isArray(otherInterests)
    ) {
      return res.status(400).json({ message: 'otherInterests must be an array of strings' });
    }

    const normalizedTopicIds = [...new Set(topicIds.map(topicId => topicId.trim()))];
    const normalizedOtherInterests = Array.isArray(otherInterests)
      ? [...new Set(
          otherInterests.map(otherInterest =>
            typeof otherInterest === 'string' ? otherInterest.trim() : '',
          ),
        )].filter(Boolean)
      : [];

    if (
      Array.isArray(otherInterests) &&
      otherInterests.some(otherInterest => typeof otherInterest !== 'string' || !otherInterest.trim())
    ) {
      return res.status(400).json({ message: 'otherInterests must be an array of strings' });
    }

    const userRepo = AppDataSource.getRepository<User>('User');
    const topicRepo = AppDataSource.getRepository(Topic);
    const user = await userRepo.findOne({
      where: { id: authenticatedUser.id },
      relations: { interests: true },
    });

    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const topics = normalizedTopicIds.length
      ? await topicRepo.find({
          where: { id: In(normalizedTopicIds) },
        })
      : [];

    if (topics.length !== normalizedTopicIds.length) {
      return res.status(400).json({ message: 'One or more topicIds are invalid' });
    }

    const hasOtherTopic = topics.some(topic => topic.name === 'Other');

    if (hasOtherTopic && normalizedOtherInterests.length === 0) {
      return res.status(400).json({ message: 'otherInterests is required when Other is selected' });
    }

    user.interests = topics;
    user.otherInterests = hasOtherTopic ? normalizedOtherInterests : [];

    const savedUser = await userRepo.save(user);

    return res.status(200).json({
      message: 'Interests updated successfully',
      user: AccountController.serializeAccount(savedUser, { includeInterests: true }),
    });
  }
  static async setBlackoutPeriods(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async approveSignUp(req: AuthenticatedRequest, res: Response) {
    const authenticatedUser = req.user;

    if (!authenticatedUser) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!AccountController.isCoordinatorOrAdmin(authenticatedUser)) {
      return res.status(403).json({ message: 'Coordinator access is required' });
    }

    const id = AccountController.parseRouteId(req.params.id);

    if (!id) {
      return res.status(400).json({ message: 'Valid signup id is required' });
    }

    const memberRepo = AppDataSource.getRepository(LabMember);
    const member = await memberRepo.findOne({ where: { id }, relations: ['requestedLab'] });

    if (!member) {
      return res.status(404).json({ message: 'Pending signup not found' });
    }

    if (member.approvalStatus !== ApprovalStatus.Pending) {
      return res.status(409).json({ message: 'Only pending signups can be approved' });
    }

    if (!(await AccountController.canReviewSignup(authenticatedUser, member))) {
      return res.status(403).json({ message: 'You can only approve signups for your lab' });
    }

    const note = AccountController.parseApprovalNote(req.body?.note);

    member.approvalStatus = ApprovalStatus.Approved;
    member.approvalReviewedAt = new Date();
    member.approvalNote = note;

    await memberRepo.save(member);

    if (member.requestedLab) {
      const labRepo = AppDataSource.getRepository(Lab);
      const lab = await labRepo.findOne({
        where: { id: member.requestedLab.id },
        relations: ['members'],
      });

      if (!lab) {
        return res.status(400).json({ message: 'Requested lab was not found' });
      }

      lab.members = lab.members ?? [];
      if (!lab.members.some(existingMember => existingMember.id === member.id)) {
        lab.members.push(member);
        await labRepo.save(lab);
      }
    }

    const savedMember = await memberRepo.findOne({
      where: { id: member.id },
      relations: ['labs', 'requestedLab'],
    }) ?? member;

    return res.status(200).json({
      message: 'Signup approved',
      user: AccountController.serializeAccount(savedMember),
    });
  }
  static async rejectSignUp(req: AuthenticatedRequest, res: Response) {
    const authenticatedUser = req.user;

    if (!authenticatedUser) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!AccountController.isCoordinatorOrAdmin(authenticatedUser)) {
      return res.status(403).json({ message: 'Coordinator access is required' });
    }

    const id = AccountController.parseRouteId(req.params.id);

    if (!id) {
      return res.status(400).json({ message: 'Valid signup id is required' });
    }

    const memberRepo = AppDataSource.getRepository(LabMember);
    const member = await memberRepo.findOne({ where: { id }, relations: ['requestedLab'] });

    if (!member) {
      return res.status(404).json({ message: 'Pending signup not found' });
    }

    if (member.approvalStatus !== ApprovalStatus.Pending) {
      return res.status(409).json({ message: 'Only pending signups can be rejected' });
    }

    if (!(await AccountController.canReviewSignup(authenticatedUser, member))) {
      return res.status(403).json({ message: 'You can only reject signups for your lab' });
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

  private static parseRouteId(id: unknown): string | null {
    if (typeof id !== 'string') {
      return null;
    }

    const trimmedId = id.trim();
    return trimmedId ? trimmedId : null;
  }

  private static isCoordinatorOrAdmin(user: User) {
    return user.role === UserRole.Coordinator;
  }

  private static async getVisibleLabIds(user: User): Promise<string[]> {
    if (user.role === UserRole.Coordinator) {
      const coordinator = await AppDataSource.getRepository(Coordinator).findOne({
        where: { id: user.id },
        relations: ['lab', 'labs'],
      });
      const ids = [
        coordinator?.lab?.id,
        ...(coordinator?.labs ?? []).map(lab => lab.id),
      ].filter((id): id is string => Boolean(id));

      return [...new Set(ids)];
    }

    const fullUser = await AppDataSource.getRepository<User>('User').findOne({
      where: { id: user.id },
      relations: ['labs'],
    });

    return [...new Set((fullUser?.labs ?? []).map(lab => lab.id))];
  }

  private static async canReviewSignup(reviewer: User, member: LabMember): Promise<boolean> {
    const visibleLabIds = await AccountController.getVisibleLabIds(reviewer);
    return Boolean(member.requestedLab && visibleLabIds.includes(member.requestedLab.id));
  }

  private static serializeAccount(member: User, options: { includeInterests?: boolean } = {}) {
    const labs = [...(member.labs || [])];
    
    // If it's a coordinator, we should also include their managed lab if not already there
    if (member.role === UserRole.Coordinator && (member as any).lab) {
      const coordinatedLab = (member as any).lab;
      if (!labs.find(l => l.id === coordinatedLab.id)) {
        labs.push(coordinatedLab);
      }
    }
    const account = {
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      approvalStatus: member.approvalStatus,
      approvalReviewedAt: member.approvalReviewedAt,
      approvalNote: member.approvalNote,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
      otherInterests: member.otherInterests ?? [],
      labs: labs.map(l => ({ id: l.id, name: l.name })),
    };

    if (options.includeInterests) {
      return {
        ...account,
        interests: (member.interests ?? []).map(topic => ({
          id: topic.id,
          name: topic.name,
        })),
      };
    }

    return account;
  }

  private static authenticationFailed(res: Response) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  private static passwordResetRequestAccepted(res: Response) {
    return res.status(200).json({
      message: 'If an account exists for that email, a password reset link will be sent',
    });
  }

  private static isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Error && error.message.includes('UNIQUE constraint failed');
  }
}
