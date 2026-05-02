import express, { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import { AccountController } from '../controllers/AccountController';
import { AdminController } from '../controllers/AdminController';
import { AssignmentController } from '../controllers/AssignmentController';
import { CoordinatorController } from '../controllers/CoordinatorController';
import { LabCollaborationController } from '../controllers/LabCollaborationController';
import { PaperController } from '../controllers/PaperController';
import { RatingAnalyticsController } from '../controllers/RatingAnalyticsController';
import { ReviewerResponseController } from '../controllers/ReviewerResponseController';
import { RoundController } from '../controllers/RoundController';
import { SearchController } from '../controllers/SearchController';
import { TopicController } from '../controllers/TopicController';
import { SubmissionRuleController } from '../controllers/SubmissionRuleController';
import { authenticateRequest, requireAdmin, requireCoordinator, requireActiveAccount } from '../middleware/auth';

import multer, { FileFilterCallback } from 'multer';

const router = Router();

// Multer: in-memory PDF upload (max 20MB)
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  }
});

// Custom middleware to handle Multer errors and return JSON instead of HTML
const handlePdfUpload = (req: Request, res: Response, next: NextFunction) => {
  pdfUpload.single('pdf')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    } else if (err instanceof Error) {
      return res.status(400).json({ message: err.message });
    } else if (err) {
      return res.status(400).json({ message: 'Upload failed' });
    }
    next();
  });
};

// ==== ACCOUNT ROUTES ====
router.post('/account/signup', AccountController.signUp);
router.post('/account/login', AccountController.login);
router.post('/account/logout', AccountController.logout);
router.post('/account/change-password', authenticateRequest, AccountController.changePassword);
router.post('/account/reset-password/request', AccountController.sendPasswordReset);
router.post('/account/reset-password', AccountController.resetPassword);
router.get('/account/profile', authenticateRequest, AccountController.getProfile);
router.get('/account/lab-members', authenticateRequest, AccountController.getLabMembers);
router.get('/account/pending-signups', authenticateRequest, AccountController.getPendingSignUps);
router.get('/account/reviewed-signups', authenticateRequest, AccountController.getReviewedSignUps);
router.put('/account/profile', authenticateRequest, AccountController.updateProfile);
router.put('/account/interests', authenticateRequest, requireActiveAccount, AccountController.setInterests);
router.put('/account/blackout-periods', authenticateRequest, AccountController.setBlackoutPeriods);
router.post('/account/approve/:id', authenticateRequest, AccountController.approveSignUp);
router.post('/account/reject/:id', authenticateRequest, AccountController.rejectSignUp);
router.post('/account/freeze/:id', authenticateRequest, requireCoordinator, AccountController.freezeMember);
router.post('/account/unfreeze/:id', authenticateRequest, requireCoordinator, AccountController.unfreezeMember);
router.get('/labs', AccountController.getAllLabs);

// ==== ADMIN & MANAGEMENT ROUTES ====
router.get('/admin/users', authenticateRequest, requireAdmin, AdminController.getAllUsers);
router.post('/admin/users', authenticateRequest, requireAdmin, AdminController.createUser);
router.post('/admin/users/:id/lock', authenticateRequest, requireAdmin, AdminController.lockUserAccount);
router.post('/admin/users/:id/unlock', authenticateRequest, requireAdmin, AdminController.unlockUserAccount);
router.delete('/admin/users/:id', authenticateRequest, requireAdmin, AdminController.deleteUser);

router.get('/admin/labs', authenticateRequest, requireAdmin, AdminController.getAllLabs);
router.post('/admin/labs', authenticateRequest, requireAdmin, AdminController.createLab);
router.delete('/admin/labs/:id', authenticateRequest, requireAdmin, AdminController.deleteLab);
router.post('/admin/labs/coordinator', authenticateRequest, requireAdmin, AdminController.assignCoordinator);

router.get('/admin/policies', authenticateRequest, requireAdmin, AdminController.getPolicies);
router.put('/admin/policies/:id', authenticateRequest, requireAdmin, AdminController.updatePolicy);

router.get('/admin/templates', authenticateRequest, requireAdmin, AdminController.getTemplates);
router.put('/admin/templates/:id', authenticateRequest, requireAdmin, AdminController.updateTemplate);

router.get('/admin/logs', authenticateRequest, requireAdmin, AdminController.getSystemLogs);

// ==== LAB-SPECIFIC TOPIC ROUTES ====
router.get('/labs/:labId/topics', authenticateRequest, TopicController.getLabTopics);
router.post('/labs/:labId/topics', authenticateRequest, requireActiveAccount, TopicController.addTopicToLab);
router.put('/labs/:labId/topics/:topicId', authenticateRequest, requireActiveAccount, TopicController.updateTopicInLab);
router.delete('/labs/:labId/topics/:topicId', authenticateRequest, requireActiveAccount, TopicController.removeTopicFromLab);

// ==== ASSIGNMENT ROUTES ====
router.get('/assignments/my', authenticateRequest, AssignmentController.getMyAssignments);
router.post('/assignments/my/request-decisions/dismiss', authenticateRequest, AssignmentController.dismissRequestDecisions);
router.post('/assignments', authenticateRequest, requireActiveAccount, AssignmentController.assignReviewers);
router.post('/assignments/invite', authenticateRequest, AssignmentController.sendInvitations);
router.post('/assignments/remind', authenticateRequest, AssignmentController.sendReminders);
router.delete('/assignments/:id', authenticateRequest, AssignmentController.cancelAssignment);
router.put('/assignments/:id/deadline', authenticateRequest, AssignmentController.updateAssignmentDeadline);
router.post('/assignments/:id/reassign', authenticateRequest, AssignmentController.reassignReviewer);
router.patch('/assignments/:id/process-decline', authenticateRequest, CoordinatorController.processDeclineRequest);
router.patch('/assignments/:id/process-extension', authenticateRequest, CoordinatorController.processExtensionRequest);

// ==== PAPER ROUTES ====
router.get('/papers/my-coordinated', authenticateRequest, PaperController.getMyCoordinatedPapers);
router.get('/papers/my-written', authenticateRequest, PaperController.getMyWrittenPapers);
router.get('/papers/my-reviewed', authenticateRequest, PaperController.getMyReviewedPapers);
router.get('/papers/my-current-reviewed', authenticateRequest, PaperController.getMyCurrentReviewedPapers);
router.get('/papers/all', authenticateRequest, PaperController.getAllPapers);
router.post('/papers', authenticateRequest, requireActiveAccount, PaperController.registerPaper);

router.get('/papers/:id', authenticateRequest, PaperController.getPaperById);
router.put('/papers/:id/overleaf', authenticateRequest, PaperController.updateOverleafLink);

router.get('/papers/:id/status', authenticateRequest, PaperController.getPaperStatus);
router.get('/papers/:id/history', authenticateRequest, PaperController.getPaperHistory);
router.put('/papers/:id/topics', authenticateRequest, PaperController.setTopics);
router.put('/papers/:id/topics-update', authenticateRequest, PaperController.updateTopics);
router.put('/papers/:id/abstract', authenticateRequest, PaperController.updateAbstract);
router.put('/papers/:id/authors', authenticateRequest, PaperController.updateAuthors);
router.put('/papers/:id/status', authenticateRequest, PaperController.updatePaperStatus);
router.post('/papers/:id/manuscript', authenticateRequest, PaperController.uploadManuscript);
router.post('/papers/:id/parents', authenticateRequest, PaperController.linkParentPapers);

// ==== COLLABORATION ROUTES ====
router.get('/collaboration-invitations/pending', authenticateRequest, LabCollaborationController.getPendingInvitations);
router.patch('/collaboration-invitations/:id/accept', authenticateRequest, LabCollaborationController.acceptInvitation);
router.patch('/collaboration-invitations/:id/reject', authenticateRequest, LabCollaborationController.rejectInvitation);
router.patch('/collaboration-invitations/:id/cancel', authenticateRequest, LabCollaborationController.cancelInvitation);
router.post('/papers/:id/collaboration-invitations', authenticateRequest, LabCollaborationController.sendInvitations);
router.get('/papers/:id/collaboration-invitations', authenticateRequest, LabCollaborationController.getInvitationsForPaper);

// ==== RATING ANALYTICS ROUTES ====
router.post('/ratings', authenticateRequest, RatingAnalyticsController.rateReviewer);
router.get('/ratings/overall', authenticateRequest, requireCoordinator, RatingAnalyticsController.getOverallAnalytics);
router.get('/ratings/user/:id', authenticateRequest, requireCoordinator, RatingAnalyticsController.getUserAnalytics);

// ==== REVIEWER RESPONSE ROUTES ====
router.patch('/responses/:id/accept', authenticateRequest, ReviewerResponseController.acceptInvitation);
router.post('/responses/:id/decline-request', authenticateRequest, requireActiveAccount, ReviewerResponseController.requestDeclineForAssignment);
router.post('/responses/:id/extension-request', authenticateRequest, requireActiveAccount, ReviewerResponseController.requestExtensionForAssignment);
// Legacy aliases for coordinator processing. Prefer the PATCH /assignments/:id/process-* routes above.
router.post('/responses/:id/process-decline', authenticateRequest, ReviewerResponseController.processDeclineRequest);
router.post('/responses/:id/process-extension', authenticateRequest, ReviewerResponseController.processExtensionRequest);
router.post('/responses/invitation', authenticateRequest, requireActiveAccount, ReviewerResponseController.respondToInvitation);
router.post('/responses/extension', authenticateRequest, requireActiveAccount, ReviewerResponseController.requestDeadlineExtension);
// Legacy aliases for clients that still submit assignmentId/responseId in the body.
router.post('/responses/process-decline', authenticateRequest, ReviewerResponseController.processDeclineRequest);
router.post('/responses/process-extension', authenticateRequest, ReviewerResponseController.processExtensionRequest);
router.post('/responses/summary', authenticateRequest, requireActiveAccount, ReviewerResponseController.submitReviewSummary);
router.post('/responses/complete', authenticateRequest, requireActiveAccount, ReviewerResponseController.completeReview);

// ==== ROUND ROUTES ====
router.get('/papers/:id/rounds', authenticateRequest, RoundController.getRoundsWithAssignments);
router.get('/papers/:id/author-rounds', authenticateRequest, RoundController.getAuthorRounds);
router.post('/rounds', authenticateRequest, RoundController.createReviewRound);
router.post('/rounds/:id/start', authenticateRequest, RoundController.startRound);
router.post('/rounds/:id/approve', authenticateRequest, RoundController.approveRound);
router.put('/rounds/:id/deadline', authenticateRequest, RoundController.editRoundDeadline);
router.put('/rounds/:id/details', authenticateRequest, RoundController.updateRoundDetails);
router.get('/rounds/:id/suggest', authenticateRequest, RoundController.suggestReviewers);
router.post('/rounds/:id/propose', authenticateRequest, requireActiveAccount, RoundController.addProposeReviewer);
router.delete('/rounds/:id/propose/:userId', authenticateRequest, RoundController.removeProposedReviewer);
router.get('/rounds/:id/propose', authenticateRequest, RoundController.getProposeReviewers);
router.get('/rounds/:id/status', authenticateRequest, RoundController.trackReviewStatus);
router.post('/rounds/:id/close', RoundController.closeRound);
router.post('/rounds/next', authenticateRequest, RoundController.createReviewRound);
router.post('/rounds/:id/ai', authenticateRequest, handlePdfUpload, RoundController.startAIReview);
router.post('/rounds/:id/ai-review', authenticateRequest, handlePdfUpload, RoundController.startAIReviewEndpoint);
router.post('/rounds/:id/ai-checklist', authenticateRequest, handlePdfUpload, RoundController.startAIChecklist);
router.get('/rounds/:id/venue-rules', authenticateRequest, RoundController.getVenueRules);
router.post('/rounds/:id/compliance', authenticateRequest, handlePdfUpload, RoundController.runComplianceCheck);
// Compliance check is now part of ai-review-with-compliance endpoint
router.post('/rounds/:id/ai-review-with-compliance', authenticateRequest, handlePdfUpload, RoundController.runAIReviewWithCompliance);
router.post('/rounds/:id/checklist', RoundController.addChecklistItem);
router.delete('/rounds/:id/checklist/:itemId', RoundController.removeChecklistItem);
router.put('/rounds/:id/checklist/:itemId', RoundController.updateChecklistItem);
router.post('/rounds/:id/confirm-checklist', authenticateRequest, RoundController.confirmChecklistSelection);

// ==== SEARCH ROUTES ====
router.get('/topics', TopicController.getAllTopics);
router.get('/search/papers/title', SearchController.searchPapersByTitle);
router.get('/search/papers/status', SearchController.searchPapersByStatus);
router.get('/search/papers/venue', SearchController.searchPapersByVenue);
router.get('/search/papers/author/:id', SearchController.searchPapersByAuthor);
router.get('/search/papers/topic/:id', SearchController.searchPapersByTopic);
router.get('/search/papers/date', SearchController.searchPapersByDateRange);
router.get('/search/papers/completed', SearchController.searchPapersByCompleted);
router.get('/search/papers/archived', SearchController.searchPapersByArchived);
router.get('/search/reviews/paper/:id', SearchController.searchReviewsByPaper);
router.get('/search/reviews/author/:id', SearchController.searchReviewsByAuthor);
router.get('/search/reviews/reviewer/:id', SearchController.searchReviewsByReviewer);
router.get('/search/reviews/status', SearchController.searchReviewsByStatus);
router.get('/search/reviews/deadline', SearchController.searchReviewsByDeadline);
router.get('/search/members/name', SearchController.searchLabMembersByName);
router.get('/search/members/topic/:id', SearchController.searchLabMembersByTopic);
router.get('/search/members/workload', SearchController.searchLabMembersByWorkload);

// ==== SUBMISSION RULES ROUTES ====
router.post('/submission-rules/extract', authenticateRequest, SubmissionRuleController.extractRules);
router.get('/submission-rules', authenticateRequest, SubmissionRuleController.getRules);
router.get('/submission-rules/all', authenticateRequest, SubmissionRuleController.getAllRules);
router.delete('/submission-rules', authenticateRequest, SubmissionRuleController.deleteRules);

export default router;
