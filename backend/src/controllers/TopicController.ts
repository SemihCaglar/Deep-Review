import { Request, Response } from 'express';
import { In } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Topic } from '../entities/Topic';
import { Lab } from '../entities/Lab';
import { UserRole, User } from '../entities/User';
import type { AuthenticatedRequest } from '../types/auth';

export class TopicController {
  /**
   * Retrieves all topics associated with a specific lab.
   * @param req - The authenticated request object with labId in params.
   * @param res - The express response object.
   */
  static async getLabTopics(req: AuthenticatedRequest, res: Response) {
    const user = req.user;
    if (user?.frozenAt) {
      return res.status(403).json({ message: 'Frozen accounts cannot access lab topics.' });
    }

    const labId = req.params.labId as string;
    const labRepo = AppDataSource.getRepository(Lab);

    const lab = await labRepo.findOne({
      where: { id: labId },
      relations: { topics: true },
    });

    if (!lab) return res.status(404).json({ message: 'Lab not found' });

    return res.status(200).json(lab.topics);
  }

  /**
   * Retrieves all topics available across all labs the user belongs to.
   * @param req - The authenticated request object.
   * @param res - The express response object.
   */
  static async getAllTopics(req: AuthenticatedRequest, res: Response) {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Authentication required' });

    const userRepo = AppDataSource.getRepository(User);
    const fullUser = await userRepo.findOne({
      where: { id: user.id },
      relations: ['labs', 'labs.topics'],
    });

    if (!fullUser) return res.status(404).json({ message: 'User not found' });

    const topicMap = new Map<string, Topic>();
    for (const lab of fullUser.labs || []) {
      for (const topic of lab.topics || []) {
        topicMap.set(topic.id, topic);
      }
    }

    return res.status(200).json(Array.from(topicMap.values()));
  }

  /**
   * Adds a topic to a lab. Creates the topic if it doesn't exist system-wide.
   * Requires membership or coordinator role in the target lab.
   * @param req - The authenticated request object with labId in params and name in body.
   * @param res - The express response object.
   */
  static async addTopicToLab(req: AuthenticatedRequest, res: Response) {
    const labId = req.params.labId as string;
    const { name } = req.body ?? {};

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'Topic name is required' });
    }

    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    // Permission check: Admin or Member/Coord of THIS lab
    const isAuthorized = await TopicController.checkLabAccess(req.user.id, labId, req.user.role);
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized for this lab' });

    const topicRepo = AppDataSource.getRepository(Topic);
    const labRepo = AppDataSource.getRepository(Lab);

    const lab = await labRepo.findOne({ where: { id: labId }, relations: ['topics'] });
    if (!lab) return res.status(404).json({ message: 'Lab not found' });

    let topic = await topicRepo.findOne({ where: { name: name.trim() } });
    if (!topic) {
      topic = topicRepo.create({ name: name.trim() });
      await topicRepo.save(topic);
    }

    // Link if not already linked
    if (!lab.topics.some(t => t.id === topic!.id)) {
      lab.topics.push(topic);
      await labRepo.save(lab);
    }

    return res.status(200).json(topic);
  }

  /**
   * Removes a topic from a lab.
   * Requires membership or coordinator role in the target lab.
   * @param req - The authenticated request object with labId and topicId in params.
   * @param res - The express response object.
   */
  static async removeTopicFromLab(req: AuthenticatedRequest, res: Response) {
    const labId = req.params.labId as string;
    const topicId = req.params.topicId as string;

    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const isAuthorized = await TopicController.checkLabAccess(req.user.id, labId, req.user.role);
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized for this lab' });

    const labRepo = AppDataSource.getRepository(Lab);
    const lab = await labRepo.findOne({ where: { id: labId }, relations: ['topics'] });
    if (!lab) return res.status(404).json({ message: 'Lab not found' });

    lab.topics = lab.topics.filter(t => t.id !== topicId);
    await labRepo.save(lab);

    return res.status(200).json({ message: 'Topic removed from lab' });
  }

  /**
   * Updates a topic for a specific lab by switching it to a different (possibly new) topic.
   * Requires membership or coordinator role in the target lab.
   * @param req - The authenticated request object with labId and topicId in params and newName in body.
   * @param res - The express response object.
   */
  static async updateTopicInLab(req: AuthenticatedRequest, res: Response) {
    const labId = req.params.labId as string;
    const topicId = req.params.topicId as string;
    const { newName } = req.body ?? {};

    if (!newName || typeof newName !== 'string') {
      return res.status(400).json({ message: 'New topic name is required' });
    }

    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const isAuthorized = await TopicController.checkLabAccess(req.user.id, labId, req.user.role);
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized for this lab' });

    const topicRepo = AppDataSource.getRepository(Topic);
    const labRepo = AppDataSource.getRepository(Lab);

    const lab = await labRepo.findOne({ where: { id: labId }, relations: ['topics'] });
    if (!lab) return res.status(404).json({ message: 'Lab not found' });

    // Verify topic exists in lab
    const currentTopic = lab.topics.find(t => t.id === topicId);
    if (!currentTopic) return res.status(404).json({ message: 'Topic not found in this lab' });

    // FORKING LOGIC:
    // 1. Unlink current topic
    lab.topics = lab.topics.filter(t => t.id !== topicId);

    // 2. Link to new topic (find or create)
    let nextTopic = await topicRepo.findOne({ where: { name: newName.trim() } });
    if (!nextTopic) {
      nextTopic = topicRepo.create({ name: newName.trim() });
      await topicRepo.save(nextTopic);
    }

    if (!lab.topics.some(t => t.id === nextTopic!.id)) {
      lab.topics.push(nextTopic);
    }

    await labRepo.save(lab);

    return res.status(200).json(nextTopic);
  }

  /**
   * Checks if a user has permission to access or modify a lab's data.
   */
  private static async checkLabAccess(userId: string, labId: string, role: string): Promise<boolean> {
    if (role === UserRole.Admin) return true;

    // Check if user is member/coordinator of this lab
    const labRepo = AppDataSource.getRepository(Lab);
    const lab = await labRepo.findOne({
      where: { id: labId },
      relations: ['members', 'coordinator'],
    });

    if (!lab) return false;

    const isMember = lab.members.some(m => m.id === userId);
    const isCoord = lab.coordinator?.id === userId;

    return isMember || isCoord;
  }
}
