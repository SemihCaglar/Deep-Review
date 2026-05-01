import { AppDataSource } from '../data-source';
import { Paper, PaperStatus } from '../entities/Paper';
import { Topic } from '../entities/Topic';
import { User } from '../entities/User';
import { RegisterPaperDto } from '../dtos/PaperDto';
import { In } from 'typeorm';

import { Coordinator } from '../entities/Coordinator';
import { Lab } from '../entities/Lab';

export class PaperService {
  static async getPaperById(id: string): Promise<Paper | null> {
    const paperRepo = AppDataSource.getRepository(Paper);
    const paper = await paperRepo.findOne({
      where: { id },
      relations: ['topics', 'authors', 'coordinators', 'labs']
    });

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
    const topicRepo = AppDataSource.getRepository(Topic);
    const userRepo = AppDataSource.getRepository<User>('User');

    // Compose the base instance
    const paper = paperRepo.create({
      title: dto.title,
      abstractText: dto.abstractText,
      overleafLink: dto.overleafLink?.trim() || null!,
      githubLink: dto.githubLink?.trim() || null,
      status: PaperStatus.Draft,
      creationTime: new Date(),
    });

    // Fetch and assign Topics
    if (dto.topics && dto.topics.length > 0) {
      const foundTopics = await topicRepo.find({ where: { id: In(dto.topics) } });
      if (foundTopics.length !== dto.topics.length) {
        throw new Error('One or more invalid topic IDs provided.');
      }
      paper.topics = foundTopics;
    } else {
      paper.topics = [];
    }

    // Fetch and assign Parent Papers
    if (dto.parentPaperIds && dto.parentPaperIds.length > 0) {
      paper.parentPapers = await paperRepo.find({ where: { id: In(dto.parentPaperIds) } });
    } else {
      paper.parentPapers = [];
    }

    // Prepare authors and authorOrder
    let authorIds = dto.authors || [];

    // Automatically add creator to authors if not present
    if (!authorIds.includes(creator.id)) {
      // Add creator as first author if not specified
      authorIds = [creator.id, ...authorIds];
    }

    paper.authorOrder = authorIds;

    // Fetch and assign the authors
    if (authorIds.length > 0) {
      const foundAuthors = await userRepo.find({ where: { id: In(authorIds) } });
      if (foundAuthors.length !== new Set(authorIds).size) {
        throw new Error('One or more invalid author IDs provided.');
      }
      paper.authors = foundAuthors;
    } else {
      paper.authors = [];
    }

    // Connect Coordinator
    const coordinatorRepo = AppDataSource.getRepository(Coordinator);
    const labRepo = AppDataSource.getRepository(Lab);
    // Check if creator is a Coordinator
    const coordinator = await coordinatorRepo.findOne({ where: { id: creator.id } });
    if (coordinator) {
      paper.coordinators = [coordinator];
      // Automatically map this paper to the Coordinator's Lab
      const mappedLab = await labRepo.findOne({ where: { coordinator: { id: coordinator.id } } });
      if (mappedLab) {
        paper.labs = [mappedLab];
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

    // TypeORM appears to automatically persist these relations on save.
    // If we manually insert them with QueryBuilder, it causes a UNIQUE constraint error.


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
    const topicRepo = AppDataSource.getRepository(Topic);

    const paper = await paperRepo.findOne({ where: { id: paperId }, relations: ['topics'] });
    if (!paper) throw new Error('Paper not found');

    if (topicIds && topicIds.length > 0) {
      paper.topics = await topicRepo.find({ where: { id: In(topicIds) } });
    } else {
      paper.topics = [];
    }

    await paperRepo.save(paper);

    const updatedPaper = await this.getPaperById(paperId);
    if (!updatedPaper) throw new Error('Paper not found');
    return updatedPaper;
  }

  static async updateAuthors(paperId: string, authorIds: string[]): Promise<Paper> {
    const paperRepo = AppDataSource.getRepository(Paper);
    const userRepo = AppDataSource.getRepository<User>('User');

    const paper = await paperRepo.findOne({ where: { id: paperId }, relations: ['authors'] });
    if (!paper) throw new Error('Paper not found');

    const oldAuthors = paper.authors || [];

    paper.authorOrder = authorIds;
    if (authorIds && authorIds.length > 0) {
      const foundAuthors = await userRepo.find({ where: { id: In(authorIds) } });
      if (foundAuthors.length !== new Set(authorIds).size) {
        throw new Error('One or more invalid author IDs provided.');
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
