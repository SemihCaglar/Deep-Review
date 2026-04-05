export class AssignmentController {
  assignReviewers(roundId: string, coordinatorId: string, reviewerIds: string[], paperId: string): void {}
  sendInvitations(assignmentIds: string[]): void {}
  sendReminders(assignmentIds: string[]): void {}
  cancelAssignment(assignmentId: string, coordinatorId: string): void {}
  updateAssignmentDeadline(assignmentId: string, coordinatorId: string, newDeadline: Date): void {}
}
