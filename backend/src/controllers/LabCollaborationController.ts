import { Response } from 'express';
import { AppDataSource } from '../data-source';
import { AuthenticatedRequest } from '../types/auth';
import { LabCollaborationInvitation, CollaborationInvitationStatus } from '../entities/LabCollaborationInvitation';
import { Paper } from '../entities/Paper';
import { Lab } from '../entities/Lab';
import { Coordinator } from '../entities/Coordinator';
import { UserRole } from '../entities/User';
import { sendEmail } from '../services/emailService';

export class LabCollaborationController {

  // POST /papers/:id/collaboration-invitations   body: { labIds: string[] }
  static async sendInvitations(req: AuthenticatedRequest, res: Response) {
    const user = req.user;
    if (!user || user.role !== UserRole.Coordinator) {
      return res.status(403).json({ message: 'Only coordinators can send collaboration invitations' });
    }

    const paperId = String(req.params.id);
    const { labIds } = req.body;
    if (!Array.isArray(labIds) || labIds.length === 0) {
      return res.status(400).json({ message: 'labIds must be a non-empty array' });
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

      const results: object[] = [];
      const errors: object[] = [];

      for (const labId of labIds) {
        if (labId === invitingLab.id) {
          errors.push({ labId, reason: 'Cannot invite your own lab' });
          continue;
        }

        const invitedLab = await labRepo.findOne({
          where: { id: labId },
          relations: ['coordinator'],
        });
        if (!invitedLab) {
          errors.push({ labId, reason: 'Lab not found' });
          continue;
        }

        const alreadyLinked = paper.labs?.some(l => l.id === labId);
        if (alreadyLinked) {
          errors.push({ labId, reason: 'Lab is already collaborating on this paper' });
          continue;
        }

        const existing = await invitationRepo.findOne({
          where: {
            paper: { id: paperId },
            invitedLab: { id: labId },
            status: CollaborationInvitationStatus.Pending,
          },
        });
        if (existing) {
          errors.push({ labId, reason: 'A pending invitation already exists for this lab' });
          continue;
        }

        const invitation = invitationRepo.create({
          paper,
          invitingLab,
          invitedLab,
          status: CollaborationInvitationStatus.Pending,
          respondedAt: null,
        });
        const saved = await invitationRepo.save(invitation);

        if (invitedLab.coordinator) {
          sendEmail(
            invitedLab.coordinator,
            `Collaboration invitation: ${paper.title}`,
            `You have been invited by the coordinator of "${invitingLab.name}" to collaborate on the paper "${paper.title}".\n\nPlease log in to the system to accept or reject this invitation.`,
          ).catch(err => console.error('[LabCollaboration] Failed to send invitation email:', err));
        }

        results.push({
          id: saved.id,
          invitedLabId: invitedLab.id,
          invitedLabName: invitedLab.name,
          status: saved.status,
          createdAt: saved.createdAt,
        });
      }

      return res.status(201).json({ invited: results, errors });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  }

  // GET /papers/:id/collaboration-invitations
  static async getInvitationsForPaper(req: AuthenticatedRequest, res: Response) {
    const user = req.user;
    if (!user || user.role !== UserRole.Coordinator) {
      return res.status(403).json({ message: 'Only coordinators can view collaboration invitations' });
    }

    const paperId = String(req.params.id);
    try {
      const paper = await AppDataSource.getRepository(Paper).findOne({
        where: { id: paperId },
        relations: ['coordinators'],
      });
      if (!paper) return res.status(404).json({ message: 'Paper not found' });

      const isCoordinator = paper.coordinators?.some(c => c.id === user.id);
      if (!isCoordinator) {
        return res.status(403).json({ message: 'You are not a coordinator of this paper' });
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
      return res.status(500).json({ error: e.message });
    }
  }

  // GET /collaboration-invitations/pending
  static async getPendingInvitations(req: AuthenticatedRequest, res: Response) {
    const user = req.user;
    if (!user || user.role !== UserRole.Coordinator) {
      return res.status(403).json({ message: 'Only coordinators can view collaboration invitations' });
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
        paper: { id: inv.paper.id, title: inv.paper.title, status: inv.paper.status },
        invitingLab: { id: inv.invitingLab.id, name: inv.invitingLab.name },
        invitedLab: { id: inv.invitedLab.id, name: inv.invitedLab.name },
      })));
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  }

  // PATCH /collaboration-invitations/:id/accept
  static async acceptInvitation(req: AuthenticatedRequest, res: Response) {
    const user = req.user;
    if (!user || user.role !== UserRole.Coordinator) {
      return res.status(403).json({ message: 'Only coordinators can accept invitations' });
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

      invitation.status = CollaborationInvitationStatus.Accepted;
      invitation.respondedAt = new Date();
      await invitationRepo.save(invitation);

      // Link lab + coordinator to paper
      const paperRepo = AppDataSource.getRepository(Paper);
      const paper = await paperRepo.findOne({
        where: { id: invitation.paper.id },
        relations: ['labs', 'coordinators'],
      });
      if (paper) {
        if (!paper.labs?.some(l => l.id === invitation.invitedLab.id)) {
          paper.labs = [...(paper.labs ?? []), invitation.invitedLab];
        }
        if (!paper.coordinators?.some(c => c.id === user.id)) {
          const invitedCoordinator = await AppDataSource.getRepository(Coordinator).findOne({ where: { id: user.id } });
          if (invitedCoordinator) {
            paper.coordinators = [...(paper.coordinators ?? []), invitedCoordinator];
          }
        }
        await paperRepo.save(paper);
      }

      if (invitation.invitingLab?.coordinator) {
        sendEmail(
          invitation.invitingLab.coordinator,
          `Collaboration accepted: ${invitation.paper.title}`,
          `The coordinator of "${invitation.invitedLab.name}" has accepted your collaboration invitation for the paper "${invitation.paper.title}".`,
        ).catch(err => console.error('[LabCollaboration] Failed to send acceptance email:', err));
      }

      return res.status(200).json({ message: 'Invitation accepted', id: invitation.id, status: invitation.status });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  }

  // PATCH /collaboration-invitations/:id/reject
  static async rejectInvitation(req: AuthenticatedRequest, res: Response) {
    const user = req.user;
    if (!user || user.role !== UserRole.Coordinator) {
      return res.status(403).json({ message: 'Only coordinators can reject invitations' });
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
        sendEmail(
          invitation.invitingLab.coordinator,
          `Collaboration declined: ${invitation.paper.title}`,
          `The coordinator of "${invitation.invitedLab.name}" has declined your collaboration invitation for the paper "${invitation.paper.title}".`,
        ).catch(err => console.error('[LabCollaboration] Failed to send rejection email:', err));
      }

      return res.status(200).json({ message: 'Invitation rejected', id: invitation.id, status: invitation.status });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  }

  // PATCH /collaboration-invitations/:id/cancel
  static async cancelInvitation(req: AuthenticatedRequest, res: Response) {
    const user = req.user;
    if (!user || user.role !== UserRole.Coordinator) {
      return res.status(403).json({ message: 'Only coordinators can cancel invitations' });
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
      if (!isInvitingLabCoord && !isPaperCoord) {
        return res.status(403).json({ message: 'You can only cancel invitations you sent' });
      }

      invitation.status = CollaborationInvitationStatus.Cancelled;
      invitation.respondedAt = new Date();
      await invitationRepo.save(invitation);

      return res.status(200).json({ message: 'Invitation cancelled', id: invitation.id, status: invitation.status });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  }
}
