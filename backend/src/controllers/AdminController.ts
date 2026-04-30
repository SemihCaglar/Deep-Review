import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { User, UserRole, ApprovalStatus } from '../entities/User';
import { LabMember } from '../entities/LabMember';
import { Coordinator } from '../entities/Coordinator';
import { Admin } from '../entities/GlobalAdmin';
import { Lab } from '../entities/Lab';
import { AuditLog, AuditAction } from '../entities/AuditLog';
import { SystemPolicy } from '../entities/SystemPolicy';
import { Template } from '../entities/Template';
import { hashPassword } from '../services/accountSecurity';
import type { AuthenticatedRequest } from '../types/auth';

export class AdminController {
  // ==== USER MANAGEMENT ====

  static async getAllUsers(req: AuthenticatedRequest, res: Response) {
    const userRepo = AppDataSource.getRepository<User>('User');
    const users = await userRepo.find({ order: { createdAt: 'DESC' } });
    return res.status(200).json(users);
  }

  static async createUser(req: AuthenticatedRequest, res: Response) {
    const { name, email, password, role } = req.body ?? {};

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'name, email, password, and role are required' });
    }

    const userRepo = AppDataSource.getRepository<User>('User');
    const existing = await userRepo.findOne({ where: { email: email.trim().toLowerCase() } });
    if (existing) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    let user: User;
    if (role === UserRole.Coordinator) {
      user = new Coordinator();
    } else if (role === UserRole.Admin) {
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

    await AdminController.logAction(req, AuditAction.CREATE_USER, 'User', user.id, `Created ${role} user`);

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
    const user = await userRepo.findOne({ where: { id } });

    if (!user) return res.status(404).json({ message: 'User not found' });

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
    const { name, description } = req.body ?? {};
    if (!name) return res.status(400).json({ message: 'Lab name is required' });

    const labRepo = AppDataSource.getRepository(Lab);
    const lab = labRepo.create({ name, description });
    await labRepo.save(lab);

    await AdminController.logAction(req, AuditAction.UPDATE_POLICY, 'Lab', lab.id, `Created lab: ${name}`);

    return res.status(201).json(lab);
  }

  static async deleteLab(req: AuthenticatedRequest, res: Response) {
    const id = req.params.id as string;
    const labRepo = AppDataSource.getRepository(Lab);
    const lab = await labRepo.findOne({ where: { id } });

    if (!lab) return res.status(404).json({ message: 'Lab not found' });

    await labRepo.remove(lab);

    await AdminController.logAction(req, AuditAction.UPDATE_POLICY, 'Lab', id, `Deleted lab: ${lab.name}`);

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

    await AdminController.logAction(req, AuditAction.UPDATE_POLICY, 'Template', id, `Updated template ${template.name}`);

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
    const logRepo = AppDataSource.getRepository(AuditLog);
    const log = logRepo.create({
      action,
      entityType,
      entityId,
      details,
      actor: req.user,
      createdAt: new Date(),
    });
    await logRepo.save(log);
  }
}
