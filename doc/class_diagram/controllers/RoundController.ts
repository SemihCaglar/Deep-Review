export class RoundController {
  createReviewRound(paperId: string, coordinatorId: string): string { return ''; }
  editRoundDeadline(roundId: string, coordinatorId: string, newDeadline: Date): void {}
  suggestReviewers(roundId: string, coordinatorId: string): any[] { return []; }
  addProposeReviewer(roundId: string, coordinatorId: string, reviewerId: string): void {}
  getProposeReviewers(roundId: string, coordinatorId: string): any[] { return []; }
  trackReviewStatus(roundId: string): any { return null; }
  alertOverdueReviews(roundId: string): void {}
  closeRound(roundId: string, coordinatorId: string): void {}
  startNextRound(paperId: string, coordinatorId: string): string { return ''; }
  startAIReview(roundId: string, requesterId: string): void {}

  // Checklist management
  addChecklistItem(roundId: string, description: string): string { return ''; }
  removeChecklistItem(roundId: string, itemId: string): void {}
  updateChecklistItem(roundId: string, itemId: string, isChecked: boolean): void {}
}
