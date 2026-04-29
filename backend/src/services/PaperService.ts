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
    return await paperRepo.findOne({ 
      where: { id }, 
      relations: ['topics', 'authors', 'coordinators', 'labs'] 
    });
  }

  /**
   * Registers a new paper and saves it as a Draft.
   */
  static async registerPaper(dto: RegisterPaperDto, creator: User): Promise<Paper> {
    const paperRepo = AppDataSource.getRepository(Paper);
    const topicRepo = AppDataSource.getRepository(Topic);
    const userRepo = AppDataSource.getRepository<User>('User'); // Need string literal because TableInheritance

    // Compose the base instance
    const paper = paperRepo.create({
      title: dto.title,
      abstractText: dto.abstractText,
      overleafLink: dto.overleafLink,
      status: PaperStatus.Draft,
      creationTime: new Date(),
    });

    // Fetch and assign Topics
    if (dto.topics && dto.topics.length > 0) {
      const foundTopics = await topicRepo.find({ where: { id: In(dto.topics) } });
      if (foundTopics.length !== dto.topics.length) {
          throw new Error('One or more topics are invalid');
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

    // Fetch and assign the authors
    if (dto.authors && dto.authors.length > 0) {
      const foundAuthors = await userRepo.find({ where: { id: In(dto.authors) } });
      if (foundAuthors.length !== dto.authors.length) {
          throw new Error('One or more authors are invalid');
      }
      paper.authors = foundAuthors;
    } else {
      paper.authors = [];
    }

    // Connect Coordinator
    const coordinatorRepo = AppDataSource.getRepository(Coordinator);
    const labRepo = AppDataSource.getRepository(Lab);
    
    let mappedLab: Lab | null = null;
    const coordinator = await coordinatorRepo.findOne({ where: { id: creator.id } });
    if (coordinator) {
        paper.coordinators = [coordinator];
        mappedLab = await labRepo.findOne({ where: { coordinator: { id: coordinator.id } } });
        if (mappedLab) {
            paper.labs = [mappedLab];
        } else {
            paper.labs = [];
        }
    } else {
        paper.coordinators = [];
        paper.labs = [];
    }

    // Save and return
    const savedPaper = await paperRepo.save(paper);

    // Persist ManyToMany relations from the owning sides
    if (paper.authors && paper.authors.length > 0) {
        await AppDataSource.createQueryBuilder()
            .relation(User, 'writtenPapers')
            .of(paper.authors)
            .add(savedPaper);
    }
    if (mappedLab) {
        await AppDataSource.createQueryBuilder()
            .relation(Lab, 'papers')
            .of(mappedLab)
            .add(savedPaper);
    }

    return savedPaper;
  }

  static async updateAbstract(paperId: string, newAbstract: string): Promise<Paper> {
    const paperRepo = AppDataSource.getRepository(Paper);
    const paper = await paperRepo.findOne({ where: { id: paperId } });
    if (!paper) throw new Error('Paper not found');

    paper.abstractText = newAbstract;
    return await paperRepo.save(paper);
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
}
