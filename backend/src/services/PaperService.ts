import { AppDataSource } from '../data-source';
import { Paper, PaperStatus } from '../entities/Paper';
import { Topic } from '../entities/Topic';
import { User } from '../entities/User';
import { RegisterPaperDto } from '../dtos/PaperDto';
import { In } from 'typeorm';

export class PaperService {
  /**
   * Registers a new paper and saves it as a Draft.
   * Note: The `authorId` will be provided by the JWT middleware once implemented.
   */
  static async registerPaper(dto: RegisterPaperDto, authorId?: string): Promise<Paper> {
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

    // Fetch and assign the author if an authorId is known
    if (authorId) {
      const author = await userRepo.findOneBy({ id: authorId });
      if (author) {
        paper.authors = [author];
      }
    } else {
      paper.authors = [];
    }

    // Save and return
    return await paperRepo.save(paper);
  }
}
