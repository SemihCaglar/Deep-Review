import { Request, Response } from 'express';

export class AdminController {
  static async createUser(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async updateUserRole(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async lockUserAccount(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async unlockUserAccount(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async deleteUser(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  
  static async createTopic(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async updateTopic(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async deleteTopic(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  
  static async getSystemLogs(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
}
