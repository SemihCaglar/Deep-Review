import { Response } from 'express';
import { In } from 'typeorm';
import { AppDataSource } from '../data-source';
import { AuthenticatedRequest } from '../types/auth';
import { LabCollaborationInvitation, CollaborationInvitationStatus } from '../entities/LabCollaborationInvitation';
import { Paper } from '../entities/Paper';
import { Lab } from '../entities/Lab';
import { Coordinator } from '../entities/Coordinator';
import { User, UserRole } from '../entities/User';
import { sendTemplatedEmail } from '../services/emailService';
import { TemplateName } from '../entities/Template';

export class LabCollaborationController {

  /**
   * Sends collaboration invitations to multiple labs for a specific paper.
   * Requires Coordinator or Admin role.
   * 
   * @param req - The authenticated request object containing paper ID in params and labIds array in body.
   * @param res - The express response object.
   * @returns 201 with lists of successfully invited labs and errors, or error status.
   */
  static async sendInvitations(req: AuthenticatedRequest, res: Response) {
    const user = req.user;
    if (!user || (user.role !== UserRole.Coordinator && user.role !== UserRole.Admin)) {
      return res.status(403).json({ message: 'Action requires Coordinator or Admin role' });
    }

    const paperId = String(req.params.id);
    const { labIds } = req.body;
    if (!Array.isArray(labIds) || labIds.length === 0) {
      return res.status(400).json({ message: 'labIds must be a non-empty array' });
    }
    if (!labIds.every((id: unknown) => typeof id === 'string')) {
      return res.status(400).json({ message: 'Each labId must be a string' });
    }

    try {
      const paper = await AppDataSource.getRepository(Paper).findOne({
        where: { id: paperId },
        relations: ['coordinators', 'labs'],
      });
      if (!paper) return res.status(404).json({ message: 'Paper not found' });

      const isCoordinatorOfPaper = paper.coordinators?.some(c => c.id === user.id);
      if (!isCoordinatorOfPaper) {
        return res.status(403).json({ message: 'You are not a coordinator of this paper' });
      }

      const coordinator = await AppDataSource.getRepository(Coordinator).findOne({
        where: { id: user.id },
        relations: ['lab'],
      });
      if (!coordinator?.lab) {
        return res.status(400).json({ message: 'Your account is not associated with a lab' });
      }
      const invitingLab = coordinator.lab;

      const labRepo = AppDataSource.getRepository(Lab);
      const invitationRepo = AppDataSource.getRepository(LabCollaborationInvitation);

      // Pre-fetch all target labs and existing pending invitations in two queries
      const targetLabs = await labRepo.find({
        where: { id: In(labIds) },
        relations: ['coordinator'],
      });
      const labMap = new Map(targetLabs.map(l => [l.id, l]));

      const existingPending = await invitationRepo.find({
        where: {
          paper: { id: paperId },
          invitedLab: { id: In(labIds) },
          status: CollaborationInvitationStatus.Pending,
        },
        relations: ['invitedLab'],
      });
      const pendingLabIds = new Set(existingPending.map(inv => inv.invitedLab.id));

      const results: object[] = [];
      const errors: object[] = [];
      const invitationsToSave: LabCollaborationInvitation[] = [];

      for (const labId of labIds) {
        if (labId === invitingLab.id) {
          errors.push({ labId, reason: 'Cannot invite your own lab' });
          continue;
        }

        const invitedLab = labMap.get(labId);
        if (!invitedLab) {
          errors.push({ labId, reason: 'Lab not found' });
          continue;
        }

        if (paper.labs?.some(l => l.id === labId)) {
          errors.push({ labId, reason: 'Lab is already collaborating on this paper' });
          continue;
        }

        if (pendingLabIds.has(labId)) {
          errors.push({ labId, reason: 'A pending invitation already exists for this lab' });
          continue;
        }

        invitationsToSave.push(invitationRepo.create({
          paper,
          invitingLab,
          invitedLab,
          status: CollaborationInvitationStatus.Pending,
          respondedAt: null,
        }));
      }

      const saved = await invitationRepo.save(invitationsToSave);

      for (const inv of saved) {
        if (inv.invitedLab.coordinator) {
          sendTemplatedEmail(inv.invitedLab.coordinator, TemplateName.COLLABORATION_INVITATION, {
            coordinatorName: inv.invitedLab.coordinator.name,
            invitingLabName: invitingLab.name,
            paperTitle: paper.title,
          }).catch(err => console.error('[LabCollaboration] Failed to send invitation email:', err));
        }
        results.push({
          id: inv.id,
          invitedLabId: inv.invitedLab.id,
          invitedLabName: inv.invitedLab.name,
          status: inv.status,
          createdAt: inv.createdAt,
        });
      }

      return res.status(201).json({ invited: results, errors });
    } catch (e: any) {
      console.error('[LabCollaboration] sendInvitations error:', e);
      return res.status(500).json({ message: 'Failed to send collaboration invitations' });
    }
  }

  /**
   * Retrieves all collaboration invitations associated with a specific paper.
   * Requires Coordinator or Admin role.
   * 
   * @param req - The authenticated request object containing paper ID in params.
   * @param res - The express response object.
   * @returns 200 with a list of invitations, or error status.
   */
  static async getInvitationsForPaper(req: AuthenticatedRequest, res: Response) {
    const user = req.user;
    if (!user || (user.role !== UserRole.Coordinator && user.role !== UserRole.Admin)) {
      return res.status(403).json({ message: 'Action requires Coordinator or Admin role' });
    }

    const paperId = String(req.params.id);
    try {
      const paper = await AppDataSource.getRepository(Paper).findOne({
        where: { id: paperId },
        relations: ['coordinators'],
      });
      if (!paper) return res.status(404).json({ message: 'Paper not found' });

      const isCoordinator = paper.coordinators?.some(c => c.id === user.id);
      const isAdmin = user.role === UserRole.Admin;
      if (!isCoordinator && !isAdmin) {
        return res.status(403).json({ message: 'You are not a coordinator or admin of this paper' });
      }

      const invitations = await AppDataSource.getRepository(LabCollaborationInvitation).find({
        where: { paper: { id: paperId } },
        relations: ['invitingLab', 'invitedLab'],
        order: { createdAt: 'DESC' },
      });

      return res.status(200).json(invitations.map(inv => ({
        id: inv.id,
        status: inv.status,
        createdAt: inv.createdAt,
        respondedAt: inv.respondedAt,
        invitingLab: { id: inv.invitingLab.id, name: inv.invitingLab.name },
        invitedLab: { id: inv.invitedLab.id, name: inv.invitedLab.name },
      })));
    } catch (e: any) {
      console.error('[LabCollaboration] getInvitationsForPaper error:', e);
      return res.status(500).json({ message: 'Failed to retrieve collaboration invitations' });
    }
  }

  /**
   * Retrieves all pending collaboration invitations for the current user's lab.
   * Requires Coordinator or Admin role.
   * 
   * @param req - The authenticated request object.
   * @param res - The express response object.
   * @returns 200 with a list of pending invitations, or error status.
   */
  static async getPendingInvitations(req: AuthenticatedRequest, res: Response) {
    const user = req.user;
    if (!user || (user.role !== UserRole.Coordinator && user.role !== UserRole.Admin)) {
      return res.status(403).json({ message: 'Action requires Coordinator or Admin role' });
    }

    try {
      const coordinator = await AppDataSource.getRepository(Coordinator).findOne({
        where: { id: user.id },
        relations: ['lab'],
      });
      if (!coordinator?.lab) return res.status(200).json([]);

      const invitations = await AppDataSource.getRepository(LabCollaborationInvitation).find({
        where: {
          invitedLab: { id: coordinator.lab.id },
          status: CollaborationInvitationStatus.Pending,
        },
        relations: ['paper', 'invitingLab', 'invitedLab'],
        order: { createdAt: 'DESC' },
      });

      return res.status(200).json(invitations.map(inv => ({
        id: inv.id,
        status: inv.status,
        createdAt: inv.createdAt,
        respondedAt: inv.respondedAt,
        paper: { id: inv.paper.id, title: inv.paper.title, status: inv.paper.status },
        invitingLab: { id: inv.invitingLab.id, name: inv.invitingLab.name },
        invitedLab: { id: inv.invitedLab.id, name: inv.invitedLab.name },
      })));
    } catch (e: any) {
      console.error('[LabCollaboration] getPendingInvitations error:', e);
      return res.status(500).json({ message: 'Failed to retrieve pending invitations' });
    }
  }

  /**
   * Accepts a collaboration invitation.
   * Adds the invited lab and its coordinator to the paper's collaborators and authors.
   * Requires the user to be the coordinator of the invited lab.
   * 
   * @param req - The authenticated request object containing invitation ID in params.
   * @param res - The express response object.
   * @returns 200 on success, or error status.
   */
  static async acceptInvitation(req: AuthenticatedRequest, res: Response) {
    const user = req.user;
    if (!user || (user.role !== UserRole.Coordinator && user.role !== UserRole.Admin)) {
      return res.status(403).json({ message: 'Action requires Coordinator or Admin role' });
    }

    const invitationId = String(req.params.id);
    try {
      let emailTarget: any = null;
      let resultId: string;
      let resultStatus: CollaborationInvitationStatus;

      await AppDataSource.transaction(async (manager) => {
        const invitationRepo = manager.getRepository(LabCollaborationInvitation);
        const invitation = await invitationRepo.findOne({
          where: { id: invitationId },
          relations: ['paper', 'invitingLab', 'invitingLab.coordinator', 'invitedLab', 'invitedLab.coordinator'],
        });

        if (!invitation) throw Object.assign(new Error('Invitation not found'), { statusCode: 404 });
        if (invitation.invitedLab?.coordinator?.id !== user.id) {
          throw Object.assign(new Error('You are not the coordinator of the invited lab'), { statusCode: 403 });
        }
        if (invitation.status !== CollaborationInvitationStatus.Pending) {
          throw Object.assign(new Error(`Invitation is already ${invitation.status}`), { statusCode: 400 });
        }

        invitation.status = CollaborationInvitationStatus.Accepted;
        invitation.respondedAt = new Date();
        await invitationRepo.save(invitation);

        const paperRepo = manager.getRepository(Paper);
        const paper = await paperRepo.findOne({
          where: { id: invitation.paper.id },
          relations: ['labs', 'coordinators', 'authors'],
        });
        if (paper) {
          if (!paper.labs?.some(l => l.id === invitation.invitedLab.id)) {
            paper.labs = [...(paper.labs ?? []), invitation.invitedLab];
          }
          if (!paper.coordinators?.some(c => c.id === user.id)) {
            const invitedCoordinator = await manager.getRepository(Coordinator).findOne({ where: { id: user.id } });
            if (invitedCoordinator) {
              paper.coordinators = [...(paper.coordinators ?? []), invitedCoordinator];
            }
          }
          const invitedCoordinator = await manager.getRepository(Coordinator).findOne({ where: { id: user.id } });
          if (invitedCoordinator && !paper.authors?.some(author => author.id === invitedCoordinator.id)) {
            paper.authors = [...(paper.authors ?? []), invitedCoordinator as unknown as User];
          }
          if (invitedCoordinator && !paper.authorOrder?.includes(invitedCoordinator.id)) {
            paper.authorOrder = [...(paper.authorOrder ?? []), invitedCoordinator.id];
          }
          await paperRepo.save(paper);
        }

        if (invitation.invitingLab?.coordinator) {
          emailTarget = {
            coordinator: invitation.invitingLab.coordinator,
            paperTitle: invitation.paper.title,
            invitedLabName: invitation.invitedLab.name,
          };
        }

        resultId = invitation.id;
        resultStatus = invitation.status;
      });

      if (emailTarget) {
        const { coordinator: targetCoordinator, paperTitle, invitedLabName } = emailTarget;
        sendTemplatedEmail(targetCoordinator, TemplateName.COLLABORATION_ACCEPTED, {
          coordinatorName: targetCoordinator.name,
          acceptingLabName: invitedLabName,
          paperTitle,
        }).catch(err => console.error('[LabCollaboration] Failed to send acceptance email:', err));
      }

      return res.status(200).json({ message: 'Invitation accepted', id: resultId!, status: resultStatus! });
    } catch (e: any) {
      const statusCode = e.statusCode ?? 500;
      const message = statusCode === 500 ? 'Failed to accept the invitation' : e.message;
      if (statusCode === 500) console.error('[LabCollaboration] acceptInvitation error:', e);
      return res.status(statusCode).json({ message });
    }
  }

  /**
   * Rejects a collaboration invitation.
   * Requires the user to be the coordinator of the invited lab.
   * 
   * @param req - The authenticated request object containing invitation ID in params.
   * @param res - The express response object.
   * @returns 200 on success, or error status.
   */
  static async rejectInvitation(req: AuthenticatedRequest, res: Response) {
    const user = req.user;
    if (!user || (user.role !== UserRole.Coordinator && user.role !== UserRole.Admin)) {
      return res.status(403).json({ message: 'Action requires Coordinator or Admin role' });
    }

    const invitationId = String(req.params.id);
    try {
      const invitationRepo = AppDataSource.getRepository(LabCollaborationInvitation);
      const invitation = await invitationRepo.findOne({
        where: { id: invitationId },
        relations: ['paper', 'invitingLab', 'invitingLab.coordinator', 'invitedLab', 'invitedLab.coordinator'],
      });

      if (!invitation) return res.status(404).json({ message: 'Invitation not found' });
      if (invitation.invitedLab?.coordinator?.id !== user.id) {
        return res.status(403).json({ message: 'You are not the coordinator of the invited lab' });
      }
      if (invitation.status !== CollaborationInvitationStatus.Pending) {
        return res.status(400).json({ message: `Invitation is already ${invitation.status}` });
      }

      invitation.status = CollaborationInvitationStatus.Rejected;
      invitation.respondedAt = new Date();
      await invitationRepo.save(invitation);

      if (invitation.invitingLab?.coordinator) {
        sendTemplatedEmail(invitation.invitingLab.coordinator, TemplateName.COLLABORATION_REJECTED, {
          coordinatorName: invitation.invitingLab.coordinator.name,
          decliningLabName: invitation.invitedLab.name,
          paperTitle: invitation.paper.title,
        }).catch(err => console.error('[LabCollaboration] Failed to send rejection email:', err));
      }

      return res.status(200).json({ message: 'Invitation rejected', id: invitation.id, status: invitation.status });
    } catch (e: any) {
      console.error('[LabCollaboration] rejectInvitation error:', e);
      return res.status(500).json({ message: 'Failed to reject the invitation' });
    }
  }

  /**
   * Cancels a pending collaboration invitation.
   * Can be performed by the inviting lab coordinator, a paper coordinator, or an admin.
   * 
   * @param req - The authenticated request object containing invitation ID in params.
   * @param res - The express response object.
   * @returns 200 on success, or error status.
   */
  static async cancelInvitation(req: AuthenticatedRequest, res: Response) {
    const user = req.user;
    if (!user || (user.role !== UserRole.Coordinator && user.role !== UserRole.Admin)) {
      return res.status(403).json({ message: 'Action requires Coordinator or Admin role' });
    }

    const invitationId = String(req.params.id);
    try {
      const coordinator = await AppDataSource.getRepository(Coordinator).findOne({
        where: { id: user.id },
        relations: ['lab'],
      });

      const invitationRepo = AppDataSource.getRepository(LabCollaborationInvitation);
      const invitation = await invitationRepo.findOne({
        where: { id: invitationId },
        relations: ['paper', 'paper.coordinators', 'invitingLab', 'invitedLab'],
      });

      if (!invitation) return res.status(404).json({ message: 'Invitation not found' });
      if (invitation.status !== CollaborationInvitationStatus.Pending) {
        return res.status(400).json({ message: `Invitation is already ${invitation.status}` });
      }

      const isInvitingLabCoord = coordinator?.lab?.id === invitation.invitingLab?.id;
      const isPaperCoord = invitation.paper?.coordinators?.some(c => c.id === user.id);
      const isAdmin = user.role === UserRole.Admin;
      if (!isInvitingLabCoord && !isPaperCoord && !isAdmin) {
        return res.status(403).json({ message: 'You do not have permission to cancel this invitation' });
      }

      invitation.status = CollaborationInvitationStatus.Cancelled;
      invitation.respondedAt = new Date();
      await invitationRepo.save(invitation);

      return res.status(200).json({ message: 'Invitation cancelled', id: invitation.id, status: invitation.status });
    } catch (e: any) {
      console.error('[LabCollaboration] cancelInvitation error:', e);
      return res.status(500).json({ message: 'Failed to cancel the invitation' });
    }
  }
}
