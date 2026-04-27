import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Topic } from '../entities/Topic';

export class TopicController {
  static async getAllTopics(req: Request, res: Response) {
    const topicRepo = AppDataSource.getRepository(Topic);
    const topics = await topicRepo.find({
      select: {
        id: true,
        name: true,
      },
      order: {
        name: 'ASC',
      },
    });

    return res.status(200).json(topics);
  }
}
