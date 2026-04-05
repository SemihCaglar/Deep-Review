import { Request, Response } from 'express';

export class AccountController {
  static async signUp(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async login(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async logout(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async changePassword(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async sendPasswordReset(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async resetPassword(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async updateProfile(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async setInterests(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async setBlackoutPeriods(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async approveSignUp(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async rejectSignUp(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
}
