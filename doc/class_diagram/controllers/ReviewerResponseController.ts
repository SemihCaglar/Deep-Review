export class ReviewerResponseController {
  respondToInvitation(assignmentId: string, reviewerId: string, isAccept: boolean, reason?: string): void {}
  requestDecline(assignmentId: string, reviewerId: string, reason: string): void {}
  requestDeadlineExtension(assignmentId: string, reviewerId: string, reason: string): void {}

  processDeclineRequest(assignmentId: string, coordinatorId: string, isApproved: boolean): void {}
  processExtensionRequest(assignmentId: string, coordinatorId: string, isApproved: boolean, newDeadline?: Date): void {}

  submitReviewSummary(assignmentId: string, reviewerId: string, summaryText: string): void {}
  markReviewCompleted(assignmentId: string, reviewerId: string): void {}
}
