import { Router } from 'express';
import { AccountController } from '../controllers/AccountController';
import { AdminController } from '../controllers/AdminController';
import { AIReviewController } from '../controllers/AIReviewController';
import { AssignmentController } from '../controllers/AssignmentController';
import { PaperController } from '../controllers/PaperController';
import { RatingAnalyticsController } from '../controllers/RatingAnalyticsController';
import { ReviewerResponseController } from '../controllers/ReviewerResponseController';
import { RoundController } from '../controllers/RoundController';
import { SearchController } from '../controllers/SearchController';
import { TopicController } from '../controllers/TopicController';
import { authenticateRequest } from '../middleware/auth';

const router = Router();

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
router.put('/account/interests', authenticateRequest, AccountController.setInterests);
router.put('/account/blackout-periods', authenticateRequest, AccountController.setBlackoutPeriods);
router.post('/account/approve/:id', authenticateRequest, AccountController.approveSignUp);
router.post('/account/reject/:id', authenticateRequest, AccountController.rejectSignUp);

// ==== ADMIN ROUTES ====
router.post('/admin/users', AdminController.createUser);
router.put('/admin/users/:id/role', AdminController.updateUserRole);
router.post('/admin/users/:id/lock', AdminController.lockUserAccount);
router.post('/admin/users/:id/unlock', AdminController.unlockUserAccount);
router.delete('/admin/users/:id', AdminController.deleteUser);
router.post('/admin/topics', AdminController.createTopic);
router.put('/admin/topics/:id', AdminController.updateTopic);
router.delete('/admin/topics/:id', AdminController.deleteTopic);
router.get('/admin/logs', AdminController.getSystemLogs);

// ==== AI REVIEW ROUTES ====
router.post('/ai/review', AIReviewController.runAIReview);
router.get('/ai/report', AIReviewController.generateReviewReport);
router.get('/ai/pdf', AIReviewController.generateAnnotatedPDF);
router.get('/ai/scan', AIReviewController.performPCRelatedWorkScan);
router.get('/ai/checklist', AIReviewController.getChecklist);
router.post('/ai/validate', AIReviewController.validateAIOutput);

// ==== ASSIGNMENT ROUTES ====
router.post('/assignments', AssignmentController.assignReviewers);
router.post('/assignments/invite', AssignmentController.sendInvitations);
router.post('/assignments/remind', AssignmentController.sendReminders);
router.delete('/assignments/:id', AssignmentController.cancelAssignment);
router.put('/assignments/:id/deadline', AssignmentController.updateAssignmentDeadline);

// ==== PAPER ROUTES ====
router.post('/papers', PaperController.registerPaper);
router.put('/papers/:id/topics', PaperController.setTopics);
router.post('/papers/:id/manuscript', PaperController.uploadManuscript);
router.post('/papers/:id/parents', PaperController.linkParentPapers);
router.put('/papers/:id/abstract', PaperController.updateAbstract);
router.put('/papers/:id/topics-update', PaperController.updateTopics);
router.get('/papers/:id/status', PaperController.getPaperStatus);
router.get('/papers/:id/history', PaperController.getPaperHistory);
router.get('/papers/my-written', PaperController.getMyWrittenPapers);
router.get('/papers/my-reviewed', PaperController.getMyReviewedPapers);
router.get('/papers/my-current-reviewed', PaperController.getMyCurrentReviewedPapers);
router.get('/papers/all', PaperController.getAllPapers);
router.put('/papers/:id/status', PaperController.updatePaperStatus);

// ==== RATING ANALYTICS ROUTES ====
router.post('/ratings', RatingAnalyticsController.rateReviewer);
router.get('/ratings/overall', RatingAnalyticsController.getOverallAnalytics);
router.get('/ratings/user/:id', RatingAnalyticsController.getUserAnalytics);

// ==== REVIEWER RESPONSE ROUTES ====
router.post('/responses/invitation', ReviewerResponseController.respondToInvitation);
router.post('/responses/decline', ReviewerResponseController.requestDecline);
router.post('/responses/extension', ReviewerResponseController.requestDeadlineExtension);
router.post('/responses/process-decline', ReviewerResponseController.processDeclineRequest);
router.post('/responses/process-extension', ReviewerResponseController.processExtensionRequest);
router.post('/responses/summary', ReviewerResponseController.submitReviewSummary);
router.post('/responses/complete', ReviewerResponseController.markReviewCompleted);

// ==== ROUND ROUTES ====
router.post('/rounds', RoundController.createReviewRound);
router.put('/rounds/:id/deadline', RoundController.editRoundDeadline);
router.get('/rounds/:id/suggest', RoundController.suggestReviewers);
router.post('/rounds/:id/propose', RoundController.addProposeReviewer);
router.get('/rounds/:id/propose', RoundController.getProposeReviewers);
router.get('/rounds/:id/status', RoundController.trackReviewStatus);
router.post('/rounds/:id/alerts', RoundController.alertOverdueReviews);
router.post('/rounds/:id/close', RoundController.closeRound);
router.post('/rounds/next', RoundController.startNextRound);
router.post('/rounds/:id/ai', RoundController.startAIReview);
router.post('/rounds/:id/checklist', RoundController.addChecklistItem);
router.delete('/rounds/:id/checklist/:itemId', RoundController.removeChecklistItem);
router.put('/rounds/:id/checklist/:itemId', RoundController.updateChecklistItem);

// ==== SEARCH ROUTES ====
router.get('/topics', TopicController.getAllTopics);
router.get('/search/papers/title', SearchController.searchPapersByTitle);
router.get('/search/papers/status', SearchController.searchPapersByStatus);
router.get('/search/papers/venue', SearchController.searchPapersByVenue);
router.get('/search/papers/author/:id', SearchController.searchPapersByAuthor);
router.get('/search/papers/topic/:id', SearchController.searchPapersByTopic);
router.get('/search/papers/date', SearchController.searchPapersByDateRange);
router.get('/search/papers/closed', SearchController.searchPapersByClosed);
router.get('/search/papers/archived', SearchController.searchPapersByArchived);
router.get('/search/reviews/paper/:id', SearchController.searchReviewsByPaper);
router.get('/search/reviews/author/:id', SearchController.searchReviewsByAuthor);
router.get('/search/reviews/reviewer/:id', SearchController.searchReviewsByReviewer);
router.get('/search/reviews/status', SearchController.searchReviewsByStatus);
router.get('/search/reviews/deadline', SearchController.searchReviewsByDeadline);
router.get('/search/members/name', SearchController.searchLabMembersByName);
router.get('/search/members/topic/:id', SearchController.searchLabMembersByTopic);
router.get('/search/members/workload', SearchController.searchLabMembersByWorkload);

export default router;
