import { Request, Response } from 'express';
import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source';
import { User, UserRole, ApprovalStatus } from '../entities/User';
import { LabMember } from '../entities/LabMember';
import { Coordinator } from '../entities/Coordinator';
import { Admin } from '../entities/GlobalAdmin';
import { Lab } from '../entities/Lab';
import { AuditLog, AuditAction } from '../entities/AuditLog';
import { SystemPolicy } from '../entities/SystemPolicy';
import { Template, TemplateName } from '../entities/Template';
import { LabCollaborationInvitation } from '../entities/LabCollaborationInvitation';
import { ReviewerResponse } from '../entities/ReviewerResponse';
import { EmailNotification } from '../entities/EmailNotification';
import { hashPassword } from '../services/accountSecurity';
import type { AuthenticatedRequest } from '../types/auth';
import * as crypto from 'crypto';
import { sendTemplatedEmail } from '../services/emailService';
import { logAudit } from '../services/auditService';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return EMAIL_PATTERN.test(email.trim());
}

export class AdminController {
  // ==== USER MANAGEMENT ====

  static async getAllUsers(req: AuthenticatedRequest, res: Response) {
    await AppDataSource.transaction(async manager => {
      await AdminController.deleteOrphanCoordinators(manager);
    });

    const userRepo = AppDataSource.getRepository<User>('User');
    const users = await userRepo.find({ order: { createdAt: 'DESC' } });
    return res.status(200).json(users);
  }

  static async createUser(req: AuthenticatedRequest, res: Response) {
    let { name, email, password, role, labId } = req.body ?? {};

    if (!name || !email || !role) {
      return res.status(400).json({ message: 'name, email, and role are required' });
    }

    if (role === UserRole.Coordinator) {
      return res.status(400).json({ message: 'Coordinators can only be created alongside a Lab in the create lab workflow' });
    }

    if (!password) {
      return res.status(400).json({ message: 'password is required for this role' });
    }

    if (!labId) {
      return res.status(400).json({ message: 'Lab cannot be null' });
    }

    const labRepo = AppDataSource.getRepository(Lab);
    const lab = await labRepo.findOne({ where: { id: labId }, relations: ['members'] });
    if (!lab) {
      return res.status(404).json({ message: 'Lab not found' });
    }

    const userRepo = AppDataSource.getRepository<User>('User');
    const existing = await userRepo.findOne({ where: { email: email.trim().toLowerCase() } });
    if (existing) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    let user: User;
    if (role === UserRole.Admin) {
      user = new Admin();
    } else {
      user = new LabMember();
    }

    user.name = name.trim();
    user.email = email.trim().toLowerCase();
    user.passwordHash = await hashPassword(password);
    user.approvalStatus = ApprovalStatus.Approved;
    user.approvalReviewedAt = new Date();

    await userRepo.save(user);

    lab.members.push(user);
    await labRepo.save(lab);

    await AdminController.logAction(req, AuditAction.CREATE_USER, 'User', user.id, `Created ${role} user in lab ${lab.name}`);

    return res.status(201).json(user);
  }

  static async lockUserAccount(req: AuthenticatedRequest, res: Response) {
    const id = req.params.id as string;
    const userRepo = AppDataSource.getRepository<User>('User');
    const user = await userRepo.findOne({ where: { id } });

    if (!user) return res.status(404).json({ message: 'User not found' });

    user.lockedUntil = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);
    await userRepo.save(user);

    await AdminController.logAction(req, AuditAction.LOCK_USER, 'User', user.id);

    return res.status(200).json({ message: 'User account locked' });
  }

  static async unlockUserAccount(req: AuthenticatedRequest, res: Response) {
    const id = req.params.id as string;
    const userRepo = AppDataSource.getRepository<User>('User');
    const user = await userRepo.findOne({ where: { id } });

    if (!user) return res.status(404).json({ message: 'User not found' });

    user.lockedUntil = null;
    user.failedLogins = 0;
    await userRepo.save(user);

    await AdminController.logAction(req, AuditAction.LOCK_USER, 'User', user.id, 'Unlocked');

    return res.status(200).json({ message: 'User account unlocked' });
  }

  static async deleteUser(req: AuthenticatedRequest, res: Response) {
    const id = req.params.id as string;
    const userRepo = AppDataSource.getRepository<User>('User');
    const user = await userRepo.findOne({ where: { id }, relations: ['labs'] });

    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.labs && user.labs.length > 0) {
      return res.status(400).json({ message: 'Lab members cannot be deleted. Only users who have not yet joined a lab can be removed.' });
    }

    await userRepo.remove(user);

    await AdminController.logAction(req, AuditAction.DELETE_USER, 'User', id);

    return res.status(200).json({ message: 'User deleted' });
  }

  // ==== LAB MANAGEMENT ====

  static async getAllLabs(req: AuthenticatedRequest, res: Response) {
    const labRepo = AppDataSource.getRepository(Lab);
    const labs = await labRepo.find({ relations: ['coordinator'] });
    return res.status(200).json(labs);
  }

  static async createLab(req: AuthenticatedRequest, res: Response) {
    const { name, description, coordinatorName, coordinatorEmail } = req.body ?? {};
    
    if (!name || !name.trim()) return res.status(400).json({ message: 'Lab name is required' });
    if (!coordinatorName || !coordinatorName.trim()) return res.status(400).json({ message: 'Coordinator name is required' });
    if (!coordinatorEmail || !coordinatorEmail.trim()) return res.status(400).json({ message: 'Coordinator email is required' });

    const normalizedCoordinatorEmail = normalizeEmail(coordinatorEmail);
    if (!isValidEmail(normalizedCoordinatorEmail)) {
      return res.status(400).json({ message: 'Coordinator email must be a valid email address' });
    }

    await AppDataSource.transaction(async manager => {
      await AdminController.deleteOrphanCoordinators(manager);
    });

    const userRepo = AppDataSource.getRepository<User>('User');
    const existing = await userRepo.findOne({ where: { email: normalizedCoordinatorEmail } });
    if (existing) {
      return res.status(409).json({ message: 'Coordinator email already in use' });
    }

    // Auto-generate password for Coordinator
    const password = crypto.randomBytes(8).toString('hex');

    const coordinator = new Coordinator();
    coordinator.name = coordinatorName.trim();
    coordinator.email = normalizedCoordinatorEmail;
    coordinator.passwordHash = await hashPassword(password);
    coordinator.approvalStatus = ApprovalStatus.Approved;
    coordinator.approvalReviewedAt = new Date();

    await userRepo.save(coordinator);

    const labRepo = AppDataSource.getRepository(Lab);
    const lab = labRepo.create({ 
      name, 
      description,
      coordinator,
      members: [coordinator]
    });
    await labRepo.save(lab);

    await AdminController.logAction(req, AuditAction.UPDATE_POLICY, 'Lab', lab.id, `Created lab: ${name} with coordinator ${coordinator.email}`);

    const loginUrl = process.env.FRONTEND_URL || 'http://10.202.199.70:3000';
    await sendTemplatedEmail(coordinator, TemplateName.COORDINATOR_CREATED, {
      userName: coordinator.name,
      email: coordinator.email,
      password,
      loginUrl,
    });

    return res.status(201).json(lab);
  }

  static async deleteLab(req: AuthenticatedRequest, res: Response) {
    const id = req.params.id as string;
    const labRepo = AppDataSource.getRepository(Lab);
    const lab = await labRepo.findOne({ where: { id }, relations: ['coordinator'] });

    if (!lab) return res.status(404).json({ message: 'Lab not found' });

    const labName = lab.name;

    await AppDataSource.transaction(async manager => {
      const labInTransaction = await manager.getRepository(Lab).findOne({
        where: { id },
        relations: ['coordinator', 'members', 'papers', 'topics'],
      });

      if (!labInTransaction) return;

      const coordinator = labInTransaction.coordinator;

      await manager
        .createQueryBuilder()
        .update(User)
        .set({ requestedLab: null })
        .where('requestedLabId = :id', { id })
        .execute();

      await manager
        .createQueryBuilder()
        .update(ReviewerResponse)
        .set({ lab: null })
        .where('labId = :id', { id })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(LabCollaborationInvitation)
        .where('invitingLabId = :id OR invitedLabId = :id', { id })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(Template)
        .where('labId = :id', { id })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(SystemPolicy)
        .where('labId = :id', { id })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(AuditLog)
        .where('labId = :id', { id })
        .execute();

      await manager.query('DELETE FROM lab_members_user WHERE labId = ?', [id]);
      await manager.query('DELETE FROM lab_papers_paper WHERE labId = ?', [id]);
      await manager.query('DELETE FROM lab_topics_topic WHERE labId = ?', [id]);

      labInTransaction.members = [];
      labInTransaction.papers = [];
      labInTransaction.topics = [];
      labInTransaction.coordinator = null as any;
      await manager.getRepository(Lab).save(labInTransaction);
      await manager.getRepository(Lab).remove(labInTransaction);

      if (coordinator) {
        await AdminController.deleteCoordinatorAccount(manager, coordinator.id);
      }
    });

    await AdminController.logAction(req, AuditAction.UPDATE_POLICY, 'Lab', id, `Deleted lab: ${labName}`);

    return res.status(200).json({ message: 'Lab deleted' });
  }

  static async assignCoordinator(req: AuthenticatedRequest, res: Response) {
    const { labId, coordinatorId } = req.body ?? {};
    const labRepo = AppDataSource.getRepository(Lab);
    const coordRepo = AppDataSource.getRepository(Coordinator);

    const lab = await labRepo.findOne({ where: { id: labId }, relations: ['coordinator'] });
    const coord = await coordRepo.findOne({ where: { id: coordinatorId }, relations: ['lab'] });

    if (!lab || !coord) return res.status(404).json({ message: 'Lab or Coordinator not found' });

    if (coord.lab && coord.lab.id !== lab.id) {
      return res.status(409).json({ message: 'Coordinator is already assigned to another lab' });
    }

    lab.coordinator = coord;
    await labRepo.save(lab);

    await AdminController.logAction(req, AuditAction.ASSIGN_REVIEWER, 'Lab', lab.id, `Assigned coordinator ${coord.name}`);

    return res.status(200).json(lab);
  }

  // ==== POLICIES & TEMPLATES ====

  static async getPolicies(req: AuthenticatedRequest, res: Response) {
    const policyRepo = AppDataSource.getRepository(SystemPolicy);
    const policies = await policyRepo.createQueryBuilder('policy')
      .leftJoinAndSelect('policy.lab', 'lab')
      .getMany();
    return res.status(200).json(policies);
  }

  static async updatePolicy(req: AuthenticatedRequest, res: Response) {
    const id = req.params.id as string;
    const { value } = req.body ?? {};
    const policyRepo = AppDataSource.getRepository(SystemPolicy);
    const policy = await policyRepo.findOne({ where: { id }, relations: ['lab'] });

    if (!policy) return res.status(404).json({ message: 'Policy not found' });

    policy.value = value;
    await policyRepo.save(policy);

    await AdminController.logAction(req, AuditAction.UPDATE_POLICY, 'SystemPolicy', id, `Updated policy ${policy.key} to ${value}`);

    return res.status(200).json(policy);
  }

  static async getTemplates(req: AuthenticatedRequest, res: Response) {
    const templateRepo = AppDataSource.getRepository(Template);
    const templates = await templateRepo.createQueryBuilder('template')
      .leftJoinAndSelect('template.lab', 'lab')
      .getMany();
    return res.status(200).json(templates);
  }

  static async updateTemplate(req: AuthenticatedRequest, res: Response) {
    const id = req.params.id as string;
    const { subject, body } = req.body ?? {};
    const templateRepo = AppDataSource.getRepository(Template);
    const template = await templateRepo.findOne({ where: { id }, relations: ['lab'] });

    if (!template) return res.status(404).json({ message: 'Template not found' });

    if (subject !== undefined) template.subject = subject;
    if (body !== undefined) template.body = body;

    await templateRepo.save(template);

    await AdminController.logAction(req, AuditAction.UPDATE_TEMPLATE, 'Template', id, `Updated template ${template.name}`);

    return res.status(200).json(template);
  }

  // ==== AUDIT LOGS ====

  static async getSystemLogs(req: AuthenticatedRequest, res: Response) {
    const logRepo = AppDataSource.getRepository(AuditLog);
    const logs = await logRepo.createQueryBuilder('log')
      .leftJoinAndSelect('log.actor', 'actor')
      .leftJoinAndSelect('log.lab', 'lab')
      .orderBy('log.createdAt', 'DESC')
      .take(200)
      .getMany();
    return res.status(200).json(logs);
  }

  // ==== UTILS ====

  private static async logAction(req: AuthenticatedRequest, action: AuditAction, entityType: string, entityId: string, details?: string) {
    await logAudit(action, { actor: req.user, entityType, entityId, details });
  }

  private static async deleteOrphanCoordinators(manager: EntityManager) {
    const orphanCoordinators = await manager
      .getRepository(Coordinator)
      .createQueryBuilder('coordinator')
      .leftJoin('coordinator.lab', 'lab')
      .where('lab.id IS NULL')
      .getMany();

    for (const coordinator of orphanCoordinators) {
      await AdminController.deleteCoordinatorAccount(manager, coordinator.id);
    }
  }

  private static async deleteCoordinatorAccount(manager: EntityManager, coordinatorId: string) {
    const coordinator = await manager.getRepository(Coordinator).findOne({
      where: { id: coordinatorId },
      relations: ['labs', 'writtenPapers', 'interests', 'coordinatedPapers'],
    });

    if (coordinator) {
      coordinator.labs = [];
      coordinator.writtenPapers = [];
      coordinator.interests = [];
      coordinator.coordinatedPapers = [];
      await manager.getRepository(Coordinator).save(coordinator);
    }

    await manager
      .createQueryBuilder()
      .delete()
      .from(EmailNotification)
      .where('recipientId = :coordinatorId', { coordinatorId })
      .execute();

    await manager.query('DELETE FROM lab_members_user WHERE userId = ?', [coordinatorId]);
    await manager.query('DELETE FROM paper_coordinators_user WHERE userId = ?', [coordinatorId]);
    await manager.query('DELETE FROM user_written_papers_paper WHERE userId = ?', [coordinatorId]);
    await manager.query('DELETE FROM user_interests_topic WHERE userId = ?', [coordinatorId]);

    await manager
      .createQueryBuilder()
      .update(AuditLog)
      .set({ actor: null })
      .where('actorId = :coordinatorId', { coordinatorId })
      .execute();

    await manager.getRepository(User).delete(coordinatorId);
  }
}
