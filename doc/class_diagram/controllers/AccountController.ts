export class AccountController {
  signUp(userData: any): void {}
  login(credentials: any): void {}
  logout(userId: string): void {}
  changePassword(userId: string, oldPw: string, newPw: string): void {}
  sendPasswordReset(email: string): void {}
  resetPassword(userId: string, newPw: string): void {}
  updateProfile(userId: string, profileData: any): void {}
  setInterests(userId: string, topicIds: string[]): void {}
  setBlackoutPeriods(userId: string, periods: any[]): void {}

  // Coordinator approval of new accounts
  approveSignUp(coordinatorId: string, userId: string): void {}
  rejectSignUp(coordinatorId: string, userId: string, reason: string): void {}
}
