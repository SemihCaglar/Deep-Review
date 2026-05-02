import { AppDataSource } from '../data-source';
import { Paper, PaperStatus } from '../entities/Paper';
import { Topic } from '../entities/Topic';
import { User, UserRole } from '../entities/User';
import { RegisterPaperDto } from '../dtos/PaperDto';
import { In } from 'typeorm';

import { Coordinator } from '../entities/Coordinator';
import { Lab } from '../entities/Lab';
import { LabCollaborationInvitation, CollaborationInvitationStatus } from '../entities/LabCollaborationInvitation';
import { sendEmail } from './emailService';

export class PaperService {
  static async getPaperById(id: string): Promise<Paper | null> {
    const paperRepo = AppDataSource.getRepository(Paper);
    const paper = await paperRepo.findOne({
      where: { id },
      relations: ['topics', 'authors', 'coordinators', 'labs']
    });

    if (paper) {
      const authorIds = new Set((paper.authors ?? []).map(author => author.id));
      for (const coordinator of paper.coordinators ?? []) {
        if (!authorIds.has(coordinator.id)) {
          paper.authors = [...(paper.authors ?? []), coordinator as unknown as User];
          authorIds.add(coordinator.id);
        }
      }
      const orderedIds = [...(paper.authorOrder ?? [])];
      for (const coordinator of paper.coordinators ?? []) {
        if (!orderedIds.includes(coordinator.id)) {
          orderedIds.push(coordinator.id);
        }
      }
      paper.authorOrder = orderedIds;
    }

    if (paper && paper.authorOrder && paper.authors) {
      // Sort authors based on authorOrder
      const orderMap = new Map(paper.authorOrder.map((id, index) => [id, index]));
      paper.authors.sort((a, b) => {
        const orderA = orderMap.has(a.id) ? orderMap.get(a.id)! : 999;
        const orderB = orderMap.has(b.id) ? orderMap.get(b.id)! : 999;
        return orderA - orderB;
      });
    }
    return paper;
  }

  /**
   * Registers a new paper and saves it as a Draft.
   */
  static async registerPaper(dto: RegisterPaperDto, creator: User): Promise<Paper> {
    const paperRepo = AppDataSource.getRepository(Paper);
    const userRepo = AppDataSource.getRepository<User>('User');
    const coordinatorRepo = AppDataSource.getRepository(Coordinator);
    const labRepo = AppDataSource.getRepository(Lab);
    const requestedTopicIds = [...new Set(dto.topics ?? [])];

    // Compose the base instance
    const paper = paperRepo.create({
      title: dto.title,
      abstractText: dto.abstractText,
      overleafLink: dto.overleafLink?.trim() || null!,
      status: PaperStatus.Draft,
      creationTime: new Date(),
    });

    // Fetch and assign Parent Papers
    if (dto.parentPaperIds && dto.parentPaperIds.length > 0) {
      paper.parentPapers = await paperRepo.find({ where: { id: In(dto.parentPaperIds) } });
    } else {
      paper.parentPapers = [];
    }

    // Prepare authors and authorOrder
    let authorIds = [...new Set(dto.authors || [])];

    // Automatically add creator to authors if not present
    if (!authorIds.includes(creator.id)) {
      // Add creator as first author if not specified
      authorIds = [creator.id, ...authorIds];
    }

    paper.authorOrder = authorIds;

    // Connect Coordinator
    // Check if creator is a Coordinator
    const coordinator = await coordinatorRepo.findOne({ where: { id: creator.id } });
    let coordinatorLab: Lab | null = null;
    if (coordinator) {
      paper.coordinators = [coordinator];
      // Automatically map this paper to the Coordinator's Lab
      const mappedLab = await labRepo.findOne({ where: { coordinator: { id: coordinator.id } } });
      if (mappedLab) {
        paper.labs = [mappedLab];
        coordinatorLab = mappedLab;
      } else {
        paper.labs = [];
      }
    } else {
      // If not a coordinator, we might want to find a coordinator for this user's lab
      paper.coordinators = [];
      paper.labs = [];

      // Try to find lab from creator
      const creatorWithLabs = await userRepo.findOne({ where: { id: creator.id }, relations: ['labs'] });
      if (creatorWithLabs && creatorWithLabs.labs && creatorWithLabs.labs.length > 0) {
        paper.labs = creatorWithLabs.labs;
        // Also add labs' coordinators
        const labsWithCoordinators = await labRepo.find({
          where: { id: In(creatorWithLabs.labs.map(l => l.id)) },
          relations: ['coordinator']
        });
        paper.coordinators = labsWithCoordinators.map(l => l.coordinator).filter(c => !!c);
      }
    }

    // Fetch and assign the authors. Paper coordinators are allowed as required authors.
    if (authorIds.length > 0) {
      const foundAuthors = await userRepo.find({ where: { id: In(authorIds) } });
      if (foundAuthors.length !== new Set(authorIds).size) {
        throw new Error('One or more invalid author IDs provided.');
      }

      const paperCoordinatorIds = new Set((paper.coordinators ?? []).map(c => c.id));
      const restricted = foundAuthors.find(
        u => u.role === UserRole.Admin || (u.role === UserRole.Coordinator && !paperCoordinatorIds.has(u.id))
      );
      if (restricted) {
        throw new Error(`User "${restricted.name}" has the role ${restricted.role} and cannot be assigned as an author.`);
      }
      paper.authors = foundAuthors;
    } else {
      paper.authors = [];
    }

    if (requestedTopicIds.length > 0) {
      const paperLabIds = (paper.labs ?? []).map(lab => lab.id);
      if (paperLabIds.length === 0) {
        throw new Error('Topics can only be selected from the creator lab.');
      }

      const labsWithTopics = await labRepo.find({
        where: { id: In(paperLabIds) },
        relations: ['topics'],
      });
      const topicsById = new Map<string, Topic>();
      for (const lab of labsWithTopics) {
        for (const topic of lab.topics ?? []) {
          topicsById.set(topic.id, topic);
        }
      }

      const selectedTopics = requestedTopicIds.map(topicId => topicsById.get(topicId));
      if (selectedTopics.some(topic => !topic)) {
        throw new Error('One or more topic IDs are not available for this lab.');
      }

      paper.topics = selectedTopics as Topic[];
    } else {
      paper.topics = [];
    }

    // Ensure all coordinators are added as authors
    const authorIdsSet = new Set(paper.authors.map(a => a.id));
    for (const c of paper.coordinators) {
      if (!authorIdsSet.has(c.id)) {
        paper.authors.push(c as unknown as User);
        authorIdsSet.add(c.id);
        paper.authorOrder.push(c.id);
      }
    }

    // Save and return
    const savedPaper = await paperRepo.save(paper);

    // Send collaboration invitations if requested
    if (dto.collaboratingLabIds && dto.collaboratingLabIds.length > 0 && coordinator && coordinatorLab) {
      const invitationRepo = AppDataSource.getRepository(LabCollaborationInvitation);
      const targetLabIds = dto.collaboratingLabIds.filter(id => id !== coordinatorLab!.id);
      const invitedLabs = await labRepo.find({ where: { id: In(targetLabIds) }, relations: ['coordinator'] });

      const invitations = invitedLabs.map(invitedLab =>
        invitationRepo.create({
          paper: savedPaper,
          invitingLab: coordinatorLab!,
          invitedLab,
          status: CollaborationInvitationStatus.Pending,
          respondedAt: null,
        })
      );
      await invitationRepo.save(invitations);

      for (const invitedLab of invitedLabs) {
        if (invitedLab.coordinator) {
          sendEmail(
            invitedLab.coordinator,
            `Collaboration invitation: ${savedPaper.title}`,
            `You have been invited by the coordinator of "${coordinatorLab!.name}" to collaborate on the paper "${savedPaper.title}".\n\nPlease log in to the system to accept or reject this invitation.`,
          ).catch(err => console.error('[PaperService] Failed to send invitation email:', err));
        }
      }
    }

    const fullyHydrated = await this.getPaperById(savedPaper.id);
    return fullyHydrated!;
  }

  static async updateAbstract(paperId: string, newAbstract: string): Promise<Paper> {
    const paperRepo = AppDataSource.getRepository(Paper);
    const paper = await paperRepo.findOne({ where: { id: paperId } });
    if (!paper) throw new Error('Paper not found');

    paper.abstractText = newAbstract;
    await paperRepo.save(paper);

    const updatedPaper = await this.getPaperById(paperId);
    if (!updatedPaper) throw new Error('Paper not found');
    return updatedPaper;
  }

  static async updateTopics(paperId: string, topicIds: string[]): Promise<Paper> {
    const paperRepo = AppDataSource.getRepository(Paper);

    const paper = await paperRepo.findOne({ where: { id: paperId }, relations: ['topics', 'labs', 'labs.topics'] });
    if (!paper) throw new Error('Paper not found');

    const requestedTopicIds = [...new Set(topicIds ?? [])];
    if (requestedTopicIds.length > 0) {
      const topicsById = new Map<string, Topic>();
      for (const lab of paper.labs ?? []) {
        for (const topic of lab.topics ?? []) {
          topicsById.set(topic.id, topic);
        }
      }

      const selectedTopics = requestedTopicIds.map(topicId => topicsById.get(topicId));
      if (selectedTopics.some(topic => !topic)) {
        throw new Error('One or more topic IDs are not available for this paper lab.');
      }

      paper.topics = selectedTopics as Topic[];
    } else {
      paper.topics = [];
    }

    await paperRepo.save(paper);

    const updatedPaper = await this.getPaperById(paperId);
    if (!updatedPaper) throw new Error('Paper not found');
    return updatedPaper;
  }

  static async updateAuthors(paperId: string, authorIds: string[], requester?: User): Promise<Paper> {
    const paperRepo = AppDataSource.getRepository(Paper);
    const userRepo = AppDataSource.getRepository<User>('User');

    const paper = await paperRepo.findOne({
      where: { id: paperId },
      relations: ['authors', 'coordinators', 'labs', 'labs.members', 'labs.coordinator'],
    });
    if (!paper) throw new Error('Paper not found');

    const coordinatorIds = (paper.coordinators ?? []).map(coordinator => coordinator.id);
    const normalizedAuthorIds = [...new Set([...(authorIds ?? []), ...coordinatorIds])];
    const normalizedAuthorIdSet = new Set(normalizedAuthorIds);
    const requesterLabMemberIds = new Set<string>();

    if (requester) {
      for (const lab of paper.labs ?? []) {
        const isRequesterCoordinator = lab.coordinator?.id === requester.id;
        const isRequesterMember = lab.members?.some(member => member.id === requester.id) ?? false;
        if (isRequesterCoordinator || isRequesterMember) {
          for (const member of lab.members ?? []) {
            requesterLabMemberIds.add(member.id);
          }
          if (lab.coordinator) {
            requesterLabMemberIds.add(lab.coordinator.id);
          }
        }
      }
    }

    const removedProtectedAuthor = (paper.authors ?? []).find(author => {
      if (normalizedAuthorIdSet.has(author.id)) return false;
      if (coordinatorIds.includes(author.id) || author.role === UserRole.Coordinator) return true;
      return requester ? !requesterLabMemberIds.has(author.id) : false;
    });
    if (removedProtectedAuthor) {
      throw new Error(`User "${removedProtectedAuthor.name}" cannot be removed from this paper's authors.`);
    }

    paper.authorOrder = normalizedAuthorIds;
    if (normalizedAuthorIds.length > 0) {
      const foundAuthors = await userRepo.find({ where: { id: In(normalizedAuthorIds) } });
      if (foundAuthors.length !== normalizedAuthorIds.length) {
        throw new Error('One or more invalid author IDs provided.');
      }
      const coordinatorIdSet = new Set(coordinatorIds);
      const restricted = foundAuthors.find(
        u => u.role === UserRole.Admin || (u.role === UserRole.Coordinator && !coordinatorIdSet.has(u.id))
      );
      if (restricted) {
        throw new Error(`User "${restricted.name}" has the role ${restricted.role} and cannot be assigned as an author.`);
      }
      const addedUnavailableAuthor = foundAuthors.find(author => {
        if ((paper.authors ?? []).some(existingAuthor => existingAuthor.id === author.id)) return false;
        if (coordinatorIdSet.has(author.id)) return false;
        return requester ? !requesterLabMemberIds.has(author.id) : false;
      });
      if (addedUnavailableAuthor) {
        throw new Error(`User "${addedUnavailableAuthor.name}" cannot be assigned as an author from this lab.`);
      }
      paper.authors = foundAuthors;
    } else {
      paper.authors = [];
    }

    await paperRepo.save(paper);

    // TypeORM automatically updates the join table when paper.authors is reassigned.

    const updatedPaper = await this.getPaperById(paperId);
    if (!updatedPaper) throw new Error('Paper not found');
    return updatedPaper;
  }
}
