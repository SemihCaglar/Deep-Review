export class PaperController {
  registerPaper(authorIds: string[], title: string, abstract: string, targetVenue: string): string { return ''; }
  setTopics(paperId: string, topicIds: string[]): void {}
  uploadManuscript(paperId: string, overleafLink: string): void {}
  linkParentPapers(paperId: string, parentPaperIds: string[]): void {}
  updateAbstract(paperId: string, newAbstract: string): void {}
  updateTopics(paperId: string, newTopicIds: string[]): void {}
  
  getPaperStatus(userId: string, paperId: string): any { return null; }
  getPaperHistory(userId: string, paperId: string): any { return null; }
  getMyWrittenPapers(authorId: string): any[] { return []; }
  getMyReviewedPapers(reviewerId: string): any[] { return []; }
  getMyCurrentReviewedPapers(reviewerId: string): any[] { return []; }
  getAllPapers(coordinatorId: string): any[] { return []; }
  updatePaperStatus(paperId: string, status: string): void {}
}
