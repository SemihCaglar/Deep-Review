import { AppDataSource } from '../data-source';
import { Paper, PaperStatus } from '../entities/Paper';
import { Topic } from '../entities/Topic';
import { User } from '../entities/User';
import { RegisterPaperDto } from '../dtos/PaperDto';
import { In } from 'typeorm';

import { Coordinator } from '../entities/Coordinator';
import { Lab } from '../entities/Lab';

export class PaperService {
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
      targetVenue: dto.targetVenue,
      overleafLink: dto.overleafLink,
      status: PaperStatus.Draft,
      creationTime: new Date(),
    });

    // Fetch and assign Topics
    if (dto.topics && dto.topics.length > 0) {
      paper.topics = await topicRepo.find({ where: { id: In(dto.topics) } });
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
      paper.authors = await userRepo.find({ where: { id: In(dto.authors) } });
    } else {
      paper.authors = [];
    }

    // Connect Coordinator
    const coordinatorRepo = AppDataSource.getRepository(Coordinator);
    const labRepo = AppDataSource.getRepository(Lab);
    
    // We assume the creator is a Coordinator (enforced by frontend/role checks)
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
        paper.coordinators = [];
        paper.labs = [];
    }

    // Save and return
    return await paperRepo.save(paper);
  }
}
