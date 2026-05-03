import { Request, Response } from 'express';
import { In } from 'typeorm';
import { AppDataSource } from '../data-source';
import { LabMember } from '../entities/LabMember';
import { PasswordResetToken } from '../entities/PasswordResetToken';
import { Topic } from '../entities/Topic';
import { ApprovalStatus, User, UserRole } from '../entities/User';
import { Lab } from '../entities/Lab';
import { Coordinator } from '../entities/Coordinator';
import { Assignment, AssignmentStatus } from '../entities/Assignment';
import {
  clearLoginLockout,
  createPasswordResetToken,
  hashPasswordResetToken,
  hashPassword,
  isAccountLocked,
  registerFailedLoginAttempt,
  registerSuccessfulLogin,
  verifyPassword,
} from '../services/accountSecurity';
import { sendTemplatedEmail } from '../services/emailService';
import { TemplateName } from '../entities/Template';
import { logAudit } from '../services/auditService';
import { AuditAction } from '../entities/AuditLog';
import { getPolicyNumber } from '../services/policyService';
import { PolicyKey } from '../entities/SystemPolicy';
import { generateAuthToken } from '../services/tokenService';
import type { AuthenticatedRequest } from '../types/auth';

export class AccountController {
  /**
   * Handles user signup requests.
   * Creates a new user with 'Pending' status.
   * @param req - The request object containing name, email, password, and labId.
   * @param res - The express response object.
   */
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

    if (!labId) {
      return res.status(400).json({ message: 'please select a lab for signup' });
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
    const requestedLab = await labRepo.findOne({ where: { id: labId } });
    if (!requestedLab) {
      return res.status(400).json({ message: 'The selected lab is invalid or no longer exists' });
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

    logAudit(AuditAction.SIGNUP, {
      entityType: 'User',
      entityId: savedMember.id,
      details: `New signup request from ${savedMember.email} for lab ${requestedLab.name}`,
    }).catch(console.error);

    return res.status(201).json({
      message: 'Signup submitted and pending approval',
      user: AccountController.serializeAccount(savedMember),
    });
  }
  /**
   * Handles user login.
   * Verifies credentials, checks for account lockout, and generates an auth token.
   * @param req - The request object containing email and password.
   * @param res - The express response object.
   */
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
      const [lockoutThreshold, lockoutWindowMins, lockoutDurationMins] = await Promise.all([
        getPolicyNumber(PolicyKey.MAX_FAILED_LOGINS, 5),
        getPolicyNumber(PolicyKey.FAILED_LOGIN_WINDOW_MINS, 10),
        getPolicyNumber(PolicyKey.ACCOUNT_LOCK_MINS, 10),
      ]);
      registerFailedLoginAttempt(user, {
        lockoutThreshold,
        lockoutWindowMs: lockoutWindowMins * 60 * 1000,
        lockoutDurationMs: lockoutDurationMins * 60 * 1000,
      });
      await userRepo.save(user);

      logAudit(AuditAction.LOGIN_FAILED, {
        entityType: 'User',
        entityId: user.id,
        details: `Failed login attempt for ${user.email} (attempt ${user.failedLogins})`,
      }).catch(console.error);

      if (isAccountLocked(user)) {
        logAudit(AuditAction.LOCK_USER, {
          entityType: 'User',
          entityId: user.id,
          details: `Account auto-locked after ${user.failedLogins} failed login attempts`,
        }).catch(console.error);
        return res.status(423).json({ message: 'Account has been locked due to too many failed login attempts' });
      }

      if (user.failedLogins === lockoutThreshold - 1) {
        return res.status(401).json({ message: 'Invalid credentials. Warning: 1 more failed attempt will lock your account' });
      }

      return AccountController.authenticationFailed(res);
    }

    registerSuccessfulLogin(user);
    const savedUser = await userRepo.save(user);

    logAudit(AuditAction.LOGIN_SUCCESS, {
      actor: savedUser,
      entityType: 'User',
      entityId: savedUser.id,
    }).catch(console.error);

    return res.status(200).json({
      message: 'Login successful',
      token: generateAuthToken(savedUser),
      user: AccountController.serializeAccount(savedUser),
    });
  }
  /**
   * Handles user logout.
   * @param req - The request object.
   * @param res - The express response object.
   */
  static async logout(req: Request, res: Response) {
    return res.status(200).json({ message: 'Logout successful' });
  }
  /**
   * Changes the password of the currently authenticated user.
   * @param req - The authenticated request object.
   * @param res - The express response object.
   */
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
  /**
   * Retrieves all available labs.
   * @param req - The request object.
   * @param res - The express response object.
   */
  static async getAllLabs(req: Request, res: Response) {
    const labRepo = AppDataSource.getRepository(Lab);
    const labs = await labRepo.find({ select: ['id', 'name', 'description'] });
    return res.status(200).json(labs);
  }
  /**
   * Initiates a password reset process by sending an email with a reset link.
   * @param req - The request object containing the user's email.
   * @param res - The express response object.
   */
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
          const tokenTtlMins = await getPolicyNumber(PolicyKey.PASSWORD_RESET_TOKEN_EXP_MINS, 60);
          const token = tokenRepo.create({
            tokenHash: hashPasswordResetToken(rawResetToken),
            expiresAt: new Date(Date.now() + tokenTtlMins * 60 * 1000),
            usedAt: null,
            user,
          });
          savedToken = await tokenRepo.save(token);
          await sendTemplatedEmail(user, TemplateName.PASSWORD_RESET, {
            userName: user.name,
            resetLink,
          });
          logAudit(AuditAction.PASSWORD_RESET_REQUEST, {
            entityType: 'User',
            entityId: user.id,
            details: `Password reset requested for ${user.email}`,
          }).catch(console.error);
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
  /**
   * Resets a user's password using a valid reset token.
   * @param req - The request object containing the token and newPassword.
   * @param res - The express response object.
   */
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

    logAudit(AuditAction.PASSWORD_RESET_COMPLETE, {
      entityType: 'User',
      entityId: resetToken.user.id,
      details: `Password reset completed for ${resetToken.user.email}`,
    }).catch(console.error);

    return res.status(200).json({ message: 'Password reset successful' });
  }
  /**
   * Retrieves the profile details of the currently authenticated user.
   * @param req - The authenticated request object.
   * @param res - The express response object.
   */
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
  /**
   * Retrieves signups that are pending approval for the labs visible to the requester.
   * Requires Coordinator role.
   * @param req - The authenticated request object.
   * @param res - The express response object.
   */
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
  /**
   * Retrieves signups that have already been reviewed (Approved/Rejected).
   * Requires Coordinator role.
   * @param req - The authenticated request object.
   * @param res - The express response object.
   */
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
  /**
   * Retrieves all approved members of the labs visible to the requester.
   * @param req - The authenticated request object.
   * @param res - The express response object.
   */
  static async getLabMembers(req: AuthenticatedRequest, res: Response) {
    const authenticatedUser = req.user;

    if (!authenticatedUser) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const visibleLabIds = await AccountController.getVisibleLabIds(authenticatedUser);
    if (visibleLabIds.length === 0) {
      return res.status(200).json({ users: [], frozenUsers: [] });
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
    const visibleLabs = await AppDataSource.getRepository(Lab).find({
      where: { id: In(visibleLabIds) },
      relations: ['coordinator'],
    });
    const usersById = new Map<string, User>();
    for (const user of approvedUsers) {
      usersById.set(user.id, user);
    }
    for (const lab of visibleLabs) {
      if (lab.coordinator?.approvalStatus === ApprovalStatus.Approved) {
        usersById.set(lab.coordinator.id, lab.coordinator as unknown as User);
      }
    }
    const visibleUsers = [...usersById.values()].sort((a, b) => a.name.localeCompare(b.name));

    const serializeUser = (user: User) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      currentPosition: user.currentPosition ?? null,
      frozenAt: user.frozenAt ?? null,
    });

    return res.status(200).json({
      users: visibleUsers.filter(u => !u.frozenAt).map(serializeUser),
      frozenUsers: visibleUsers.filter(u => !!u.frozenAt).map(serializeUser),
    });
  }
  /**
   * Updates the profile information of the currently authenticated user.
   * @param req - The authenticated request object.
   * @param res - The express response object.
   */
  static async updateProfile(req: AuthenticatedRequest, res: Response) {
    const { name, email } = req.body ?? {};
    const rawCurrentPosition = req.body?.currentPosition;
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

    if (
      rawCurrentPosition !== undefined &&
      rawCurrentPosition !== null &&
      typeof rawCurrentPosition !== 'string'
    ) {
      return res.status(400).json({ message: 'currentPosition must be a string' });
    }

    if (typeof rawCurrentPosition === 'string' && rawCurrentPosition.trim().length > 255) {
      return res.status(400).json({ message: 'currentPosition must be 255 characters or fewer' });
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
    if (typeof rawCurrentPosition === 'string') {
      user.currentPosition = rawCurrentPosition.trim() || null;
    }

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
  /**
   * Updates the research interests (topics) of the currently authenticated user.
   * @param req - The authenticated request object.
   * @param res - The express response object.
   */
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
  /**
   * Placeholder for setting blackout periods.
   */
  static async setBlackoutPeriods(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  /**
   * Approves a pending user signup.
   * Requires Coordinator role and lab ownership.
   * @param req - The authenticated request object.
   * @param res - The express response object.
   */
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

    sendTemplatedEmail(
      savedMember as unknown as import('../entities/User').User,
      TemplateName.ACCOUNT_APPROVED,
      {
        userName: savedMember.name,
        note: note ? `\n\nNote from coordinator: ${note}` : '',
      },
    ).catch(console.error);

    logAudit(AuditAction.APPROVE_USER, {
      actor: req.user ?? undefined,
      entityType: 'User',
      entityId: savedMember.id,
      details: `Approved signup for ${savedMember.email}`,
    }).catch(console.error);

    return res.status(200).json({
      message: 'Signup approved',
      user: AccountController.serializeAccount(savedMember),
    });
  }
  /**
   * Rejects a pending user signup.
   * Requires Coordinator role and lab ownership.
   * @param req - The authenticated request object.
   * @param res - The express response object.
   */
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

    sendTemplatedEmail(
      savedMember as unknown as import('../entities/User').User,
      TemplateName.ACCOUNT_REJECTED,
      {
        userName: savedMember.name,
        note: note ? `\n\nReason: ${note}` : '',
      },
    ).catch(console.error);

    logAudit(AuditAction.REJECT_USER, {
      actor: req.user ?? undefined,
      entityType: 'User',
      entityId: savedMember.id,
      details: `Rejected signup for ${savedMember.email}${note ? `: ${note}` : ''}`,
    }).catch(console.error);

    return res.status(200).json({
      message: 'Signup rejected',
      user: AccountController.serializeAccount(savedMember),
    });
  }

  /**
   * Freezes a lab member's account.
   * Cancels active assignments and prevents further review activities.
   * @param req - The authenticated request object.
   * @param res - The express response object.
   */
  static async freezeMember(req: AuthenticatedRequest, res: Response) {
    const authenticatedUser = req.user;

    if (!authenticatedUser) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!AccountController.isCoordinatorOrAdmin(authenticatedUser)) {
      return res.status(403).json({ message: 'Coordinator access is required' });
    }

    const id = AccountController.parseRouteId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'Valid user id is required' });
    }

    const userRepo = AppDataSource.getRepository<User>('User');
    const member = await userRepo.findOne({ where: { id }, relations: ['labs'] });

    if (!member) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (member.role !== UserRole.LabMember) {
      return res.status(400).json({ message: 'Only lab members can be frozen' });
    }

    if (!(await AccountController.canReviewSignup(authenticatedUser, member as any))) {
      return res.status(403).json({ message: 'You can only freeze members of your own lab' });
    }

    if (member.frozenAt) {
      return res.status(409).json({ message: 'Account is already frozen' });
    }

    // Auto-cancel any open/invited/accepted assignments
    const assignmentRepo = AppDataSource.getRepository(Assignment);
    const activeAssignments = await assignmentRepo.find({
      where: {
        reviewer: { id: member.id },
        status: In([AssignmentStatus.Invited, AssignmentStatus.Accepted]),
      },
    });

    for (const assignment of activeAssignments) {
      assignment.status = AssignmentStatus.Declined;
      assignment.declineReason = 'Account frozen by coordinator';
    }

    if (activeAssignments.length > 0) {
      await assignmentRepo.save(activeAssignments);
    }

    member.frozenAt = new Date();
    await userRepo.save(member);

    return res.status(200).json({
      message: `Account frozen. ${activeAssignments.length} assignment(s) cancelled.`,
      cancelledAssignments: activeAssignments.length,
    });
  }

  /**
   * Unfreezes a frozen lab member's account.
   * @param req - The authenticated request object.
   * @param res - The express response object.
   */
  static async unfreezeMember(req: AuthenticatedRequest, res: Response) {
    const authenticatedUser = req.user;

    if (!authenticatedUser) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!AccountController.isCoordinatorOrAdmin(authenticatedUser)) {
      return res.status(403).json({ message: 'Coordinator access is required' });
    }

    const id = AccountController.parseRouteId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'Valid user id is required' });
    }

    const userRepo = AppDataSource.getRepository<User>('User');
    const member = await userRepo.findOne({ where: { id }, relations: ['labs'] });

    if (!member) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!(await AccountController.canReviewSignup(authenticatedUser, member as any))) {
      return res.status(403).json({ message: 'You can only unfreeze members of your own lab' });
    }

    if (!member.frozenAt) {
      return res.status(409).json({ message: 'Account is not frozen' });
    }

    member.frozenAt = null;
    await userRepo.save(member);

    return res.status(200).json({ message: 'Account unfrozen successfully' });
  }

  /**
   * Sanitizes and parses an approval/rejection note.
   */
  private static parseApprovalNote(note: unknown): string | null {
    if (typeof note !== 'string') {
      return null;
    }

    const trimmedNote = note.trim();
    return trimmedNote ? trimmedNote : null;
  }

  /**
   * Sanitizes and parses a route parameter ID.
   */
  private static parseRouteId(id: unknown): string | null {
    if (typeof id !== 'string') {
      return null;
    }

    const trimmedId = id.trim();
    return trimmedId ? trimmedId : null;
  }

  /**
   * Checks if a user has Coordinator role.
   */
  private static isCoordinatorOrAdmin(user: User) {
    return user.role === UserRole.Coordinator;
  }

  /**
   * Retrieves the IDs of all labs visible to a specific user (coordinator).
   */
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

  /**
   * Checks if a coordinator has permission to review/freeze/unfreeze a specific member.
   */
  private static async canReviewSignup(reviewer: User, member: User): Promise<boolean> {
    const visibleLabIds = await AccountController.getVisibleLabIds(reviewer);
    
    // Case 1: Check requestedLab (for pending signups)
    if (member.requestedLab && visibleLabIds.includes(member.requestedLab.id)) {
      return true;
    }

    // Case 2: Check labs (for already approved members)
    const memberLabIds = (member.labs || []).map(l => l.id);
    if (memberLabIds.some(id => visibleLabIds.includes(id))) {
      return true;
    }

    return false;
  }

  /**
   * Formats a user entity for API response.
   */
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
      frozenAt: member.frozenAt ?? null,
      currentPosition: member.currentPosition ?? null,
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

  /**
   * Standardized response for authentication failure.
   */
  private static authenticationFailed(res: Response) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  /**
   * Standardized response for password reset request.
   */
  private static passwordResetRequestAccepted(res: Response) {
    return res.status(200).json({
      message: 'If an account exists for that email, a password reset link will be sent',
    });
  }

  /**
   * Checks if an error is a database unique constraint violation.
   */
  private static isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Error && error.message.includes('UNIQUE constraint failed');
  }
}
