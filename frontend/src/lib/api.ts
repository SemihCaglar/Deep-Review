import { getToken, type StoredAuthUser } from '@/lib/auth';
import { API_BASE_URL } from '@/lib/config';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export type LoginResponse = {
  message: string;
  token: string;
  user: StoredAuthUser;
};

export type ChangePasswordResponse = {
  message: string;
};

export type ForgotPasswordResponse = {
  message: string;
};

export type ResetPasswordResponse = {
  message: string;
};

export type TopicOption = {
  id: string;
  name: string;
};

export type AccountUserResponse = {
  message: string;
  user: StoredAuthUser;
};

export type PendingSignup = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  approvalStatus: string;
  approvalReviewedAt?: string | null;
  approvalNote?: string | null;
};

export type PendingSignupsResponse = {
  users: PendingSignup[];
};

export type LabMember = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type LabMembersResponse = {
  users: LabMember[];
};

export type Lab = {
  id: string;
  name: string;
  description: string;
};

type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);

  if (!headers.has('Content-Type') && options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(buildUrl(path), {
    ...options,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const payload = await parseResponseBody(response);

  if (!response.ok) {
    throw new ApiError(getErrorMessage(payload, response.statusText), response.status);
  }

  return payload as T;
}

export function loginRequest(email: string, password: string) {
  return apiRequest<LoginResponse>('/account/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function signupRequest(name: string, email: string, password: string, labId?: string) {
  return apiRequest<AccountUserResponse>('/account/signup', {
    method: 'POST',
    body: {
      name,
      email,
      password,
      labId,
    },
  });
}

export function changePasswordRequest(
  currentPassword: string,
  newPassword: string,
  confirmNewPassword: string,
) {
  return apiRequest<ChangePasswordResponse>('/account/change-password', {
    method: 'POST',
    body: {
      currentPassword,
      newPassword,
      confirmNewPassword,
    },
  });
}

export function forgotPasswordRequest(email: string) {
  return apiRequest<ForgotPasswordResponse>('/account/reset-password/request', {
    method: 'POST',
    body: {
      email,
    },
  });
}

export function resetPasswordRequest(token: string, newPassword: string) {
  return apiRequest<ResetPasswordResponse>('/account/reset-password', {
    method: 'POST',
    body: {
      token,
      newPassword,
    },
  });
}

export function getTopicsRequest() {
  return apiRequest<TopicOption[]>('/topics');
}

export function updateInterestsRequest(topicIds: string[], otherInterests: string[] = []) {
  return apiRequest<AccountUserResponse>('/account/interests', {
    method: 'PUT',
    body: {
      topicIds,
      otherInterests,
    },
  });
}

export function updateProfileRequest(name: string, email: string) {
  return apiRequest<AccountUserResponse>('/account/profile', {
    method: 'PUT',
    body: {
      name,
      email,
    },
  });
}

export function getCurrentProfileRequest() {
  return apiRequest<{ user: StoredAuthUser }>('/account/profile');
}

export function getLabMembersRequest() {
  return apiRequest<LabMembersResponse>('/account/lab-members');
}

export function getPendingSignupsRequest() {
  return apiRequest<PendingSignupsResponse>('/account/pending-signups');
}

export function getReviewedSignupsRequest() {
  return apiRequest<PendingSignupsResponse>('/account/reviewed-signups');
}

export function approveSignupRequest(id: string) {
  return apiRequest<AccountUserResponse>(`/account/approve/${id}`, {
    method: 'POST',
  });
}

export function rejectSignupRequest(id: string) {
  return apiRequest<AccountUserResponse>(`/account/reject/${id}`, {
    method: 'POST',
  });
}

export type PaperAuthor = {
  id: string;
  name: string;
  email: string;
};

export type Paper = {
  id: string;
  title: string;
  abstract?: string;
  abstractText?: string;
  creationTime?: string;
  targetVenue?: string;
  status: string;
  overleafLink?: string | null;

  authorOrder?: string[] | null;
  authors?: PaperAuthor[];
  coordinators?: LabMember[];
  topics?: TopicOption[];
  history?: unknown[];
};

export type AuthoredPaper = Paper & {
  creationTime?: string;
  latestRoundNumber?: number | null;
  latestRoundStatus?: string | null;
  latestRoundDeadline?: string | null;
  completedAssignments?: number;
  totalAssignments?: number;
};

export type PaperHistoryDeclineRequest = {
  id: string;
  reason: string;
  status: string;
  requestedAt: string;
};

export type PaperHistoryExtension = {
  id: string;
  reason: string;
  requestedDeadline: string;
  approvedDeadline: string | null;
  requestedAt: string;
  status: string;
};

export type PaperHistoryAssignment = {
  assignmentId: string;
  reviewerId: string | null;
  reviewerName: string | null;
  reviewerEmail: string | null;
  status: string;
  deadline: string | null;
  invitedAt: string;
  acceptedAt: string | null;
  submittedAt: string | null;
  declineReason: string | null;
  declineRequests: PaperHistoryDeclineRequest[];
  extensions: PaperHistoryExtension[];
};

export type PaperHistoryRound = {
  id: string;
  roundNumber: number;
  roundStatus: string;
  deadline: string | null;
  startedAt: string | null;
  completedAt: string | null;
  assignments: PaperHistoryAssignment[];
  artifacts: {
    checklistItems: { id: string; description: string; isChecked: boolean }[];
    aiReviewReports: { id: string; generatedReportUrl?: string; annotatedPdfUrl?: string }[];
  };
};

export type PaperHistory = {
  id: string;
  title: string;
  status: string;
  targetVenue: string;
  overleafLink?: string | null;

  authors: PaperAuthor[];
  rounds: PaperHistoryRound[];
};

export type RegisterPaperPayload = {
  title: string;
  abstractText: string;
  targetVenue: string;
  topics: string[];
  authors: string[]; // Ordered UUIDs of the authors
  overleafLink?: string;

};

export function registerPaperRequest(payload: RegisterPaperPayload) {
  return apiRequest<{ message: string; paper: Paper }>('/papers', {
    method: 'POST',
    body: payload,
  });
}

export function getPaperByIdRequest(id: string) {
  return apiRequest<Paper>(`/papers/${id}`);
}

export function getAllPapersRequest() {
  return apiRequest<Paper[]>('/papers/all');
}

export function getMyWrittenPapersRequest() {
  return apiRequest<AuthoredPaper[]>('/papers/my-written');
}

export function getPaperHistoryRequest(id: string) {
  return apiRequest<PaperHistory>(`/papers/${id}/history`);
}

export function updatePaperAbstractRequest(id: string, abstract: string) {
  return apiRequest<Paper>(`/papers/${id}/abstract`, {
    method: 'PUT',
    body: { abstract },
  });
}

export function updatePaperTopicsRequest(id: string, topics: string[]) {
  return apiRequest<Paper>(`/papers/${id}/topics-update`, {
    method: 'PUT',
    body: { topics },
  });
}

export function updatePaperAuthorsRequest(id: string, authors: string[]) {
  return apiRequest<Paper>(`/papers/${id}/authors`, {
    method: 'PUT',
    body: { authors },
  });
}

export function updatePaperStatusRequest(id: string, status: string) {
  return apiRequest<Paper>(`/papers/${id}/status`, {
    method: 'PUT',
    body: { status },
  });
}

export function getLabsRequest() {
  return apiRequest<Lab[]>('/labs');
}

// ==== ROUND MANAGEMENT TYPES ====

export type AuthorRound = {
  id: string;
  roundNumber: number;
  status: 'Draft' | 'Open' | 'Completed';
  targetVenue: string;
  venueCategory: 'Conference' | 'Journal';
  submissionDeadline: string | null;
  deadline: string | null;
  startedAt: string | null;
  completedAt: string | null;
  proposedReviewers: { id: string; name: string; email: string }[];
};

export type CoordinatedPaper = {
  id: string;
  title: string;
  status: string;
  abstractText: string;
  overleafLink: string | null;

};

export type PendingDeclineRequest = {
  id: string;
  reason: string;
  requestedAt: string;
};

export type PendingExtensionRequest = {
  id: string;
  reason: string;
  requestedDeadline: string;
  requestedAt: string;
};

export type ResolvedDeclineRequest = PendingDeclineRequest & {
  status: 'Approved' | 'Rejected';
};

export type ResolvedExtensionRequest = PendingExtensionRequest & {
  status: 'Approved' | 'Rejected';
  approvedDeadline: string | null;
};

export type RoundAssignment = {
  id: string;
  status: string;
  deadline: string | null;
  invitationSent: boolean;
  reviewer: { id: string; name: string; email: string };
  pendingDeclineRequest: PendingDeclineRequest | null;
  pendingExtensionRequest: PendingExtensionRequest | null;
  reviewSummary: { text: string | null; submittedAt: string } | null;
};

export type RoundWithAssignments = {
  id: string;
  roundNumber: number;
  deadline: string | null;
  status: 'Draft' | 'Open' | 'Completed';
  targetVenue: string;
  venueCategory: 'Conference' | 'Journal';
  submissionDeadline: string | null;
  startedAt: string | null;
  completedAt: string | null;
  assignments: RoundAssignment[];
};

export type MyAssignment = {
  id: string;
  status: string;
  deadline: string | null;
  invitationSent: boolean;
  round: { id: string; roundNumber: number; deadline: string | null; submissionDeadline: string | null; targetVenue: string; venueCategory: string };
  paper: {
    id: string;
    title: string;
    abstractText: string;
    overleafLink: string | null;

    authors: PaperAuthor[];
  };
  pendingDeclineRequest: PendingDeclineRequest | null;
  pendingExtensionRequest: PendingExtensionRequest | null;
  resolvedDeclineRequests: ResolvedDeclineRequest[];
  resolvedExtensionRequests: ResolvedExtensionRequest[];
};

export type SuggestedReviewer = {
  user: { id: string; name: string; email: string; role: string };
  reasons: string[];
};

// ==== ROUND MANAGEMENT API FUNCTIONS ====

export function getMyAssignmentsRequest() {
  return apiRequest<MyAssignment[]>('/assignments/my');
}

export function dismissRequestDecisionsRequest(declineRequestIds: string[], extensionRequestIds: string[]) {
  return apiRequest<{ message: string; dismissedCount: number }>('/assignments/my/request-decisions/dismiss', {
    method: 'POST',
    body: { declineRequestIds, extensionRequestIds },
  });
}

export function respondToInvitationRequest(assignmentId: string, response: 'accept' | 'decline', reason?: string) {
  return apiRequest<{ message: string }>('/responses/invitation', {
    method: 'POST',
    body: { assignmentId, response, ...(reason ? { reason } : {}) },
  });
}

export function requestExtensionRequest(assignmentId: string, reason: string, requestedDeadline: string) {
  return apiRequest<{ message: string; extensionId: string }>('/responses/extension', {
    method: 'POST',
    body: { assignmentId, reason, requestedDeadline },
  });
}

export function requestDeclineForAssignmentRequest(assignmentId: string, declineReason: string) {
  return apiRequest<{ message: string; declineRequestId: string }>(`/responses/${assignmentId}/decline-request`, {
    method: 'POST',
    body: { declineReason },
  });
}

export function completeReviewRequest(assignmentId: string, summary?: string) {
  return apiRequest<{ message: string; id: string; status: string }>('/responses/complete', {
    method: 'POST',
    body: { assignmentId, ...(summary ? { summary } : {}) },
  });
}

export function getMyCoordinatedPapersRequest() {
  return apiRequest<CoordinatedPaper[]>('/papers/my-coordinated');
}

export function updateOverleafLinkRequest(paperId: string, overleafLink: string) {
  return apiRequest<{ message: string; overleafLink: string | null }>(`/papers/${paperId}/overleaf`, {
    method: 'PUT',
    body: { overleafLink },
  });
}

export function updatePaperLinksRequest(paperId: string, overleafLink: string) {
  return apiRequest<{ message: string; overleafLink?: string | null }>(`/papers/${paperId}/overleaf`, {
    method: 'PUT',
    body: { overleafLink },
  });
}


export function getPaperRoundsRequest(paperId: string) {
  return apiRequest<RoundWithAssignments[]>(`/papers/${paperId}/rounds`);
}

export function getSuggestedReviewersRequest(roundId: string) {
  return apiRequest<SuggestedReviewer[]>(`/rounds/${roundId}/suggest`);
}

export function assignReviewersRequest(roundId: string, reviewerIds: string[], deadline?: string) {
  return apiRequest<{ id: string; reviewerId: string; status: string; deadline: string }[]>('/assignments', {
    method: 'POST',
    body: { roundId, reviewerIds, ...(deadline ? { deadline } : {}) },
  });
}

export function sendInvitationsRequest(roundId: string) {
  return apiRequest<{ message: string }>('/assignments/invite', {
    method: 'POST',
    body: { roundId },
  });
}

export function sendRemindersRequest(assignmentIds: string[]) {
  return apiRequest<{ message: string; sent: number; skipped: number }>('/assignments/remind', {
    method: 'POST',
    body: { assignmentIds },
  });
}

export function cancelAssignmentRequest(assignmentId: string) {
  return apiRequest<{ message: string }>(`/assignments/${assignmentId}`, {
    method: 'DELETE',
  });
}

export function updateAssignmentDeadlineRequest(assignmentId: string, deadline: string) {
  return apiRequest<{ id: string; deadline: string }>(`/assignments/${assignmentId}/deadline`, {
    method: 'PUT',
    body: { deadline },
  });
}

export function createRoundRequest(paperId: string, targetVenue: string, venueCategory: string, submissionDeadline?: string, deadline?: string) {
  return apiRequest<{ id: string; status: string }>('/rounds', {
    method: 'POST',
    body: { paperId, targetVenue, venueCategory, ...(submissionDeadline ? { submissionDeadline } : {}), ...(deadline ? { deadline } : {}) },
  });
}

export function startRoundRequest(roundId: string, coordinatorId: string) {
  return apiRequest<{ id: string; status: string }>(`/rounds/${roundId}/start`, {
    method: 'POST',
    body: { coordinatorId },
  });
}

export function editRoundDeadlineRequest(roundId: string, deadline: string) {
  return apiRequest<{ id: string; deadline: string }>(`/rounds/${roundId}/deadline`, {
    method: 'PUT',
    body: { deadline },
  });
}

export function getAuthorRoundsRequest(paperId: string) {
  return apiRequest<AuthorRound[]>(`/papers/${paperId}/author-rounds`);
}

export function getProposedReviewersRequest(roundId: string) {
  return apiRequest<{ id: string; name: string; email: string }[]>(`/rounds/${roundId}/propose`);
}

export function addProposedReviewerRequest(roundId: string, reviewerId: string) {
  return apiRequest<{ id: string; name: string; email: string }[]>(`/rounds/${roundId}/propose`, {
    method: 'POST',
    body: { reviewerId },
  });
}

export function removeProposedReviewerRequest(roundId: string, userId: string) {
  return apiRequest<{ id: string; name: string; email: string }[]>(`/rounds/${roundId}/propose/${userId}`, {
    method: 'DELETE',
  });
}

export type RoundStatusAlert = {
  id: string;
  reviewer: { id: string; name: string; email: string };
  status: string;
  deadline: string | null;
};

export type RoundStatusSummary = {
  id: string;
  roundNumber: number;
  status: string;
  deadline: string | null;
  targetVenue: string;
  venueCategory: string;
  startedAt: string | null;
  completedAt: string | null;
  summary: {
    total: number;
    completed: number;
    completionRate: number;
    statusCounts: Record<string, number>;
    overdueCount: number;
    approachingDeadlineCount: number;
    pendingDeclineRequests: number;
    pendingExtensionRequests: number;
  };
  overdueAssignments: RoundStatusAlert[];
  approachingDeadline: RoundStatusAlert[];
};

export function getRoundStatusRequest(roundId: string) {
  return apiRequest<RoundStatusSummary>(`/rounds/${roundId}/status`);
}

export function approveRoundRequest(roundId: string) {
  return apiRequest<{ message: string; round: { id: string; status: string; startedAt: string }; assigned: number; skipped: number }>(`/rounds/${roundId}/approve`, {
    method: 'POST',
  });
}

export function reassignReviewerRequest(assignmentId: string, newReviewerId: string) {
  return apiRequest<{ id: string; status: string; deadline: string | null; invitationSent: boolean; reviewer: { id: string; name: string; email: string } }>(`/assignments/${assignmentId}/reassign`, {
    method: 'POST',
    body: { newReviewerId },
  });
}

export function processDeclineRequestApi(declineRequestId: string, decision: 'approve' | 'reject') {
  return apiRequest<{ message: string; assignmentStatus: string }>('/responses/process-decline', {
    method: 'POST',
    body: { declineRequestId, decision },
  });
}

export function processExtensionRequestApi(extensionId: string, decision: 'approve' | 'reject', approvedDeadline?: string) {
  return apiRequest<{ message: string; assignmentDeadline: string }>('/responses/process-extension', {
    method: 'POST',
    body: { extensionId, decision, ...(approvedDeadline ? { approvedDeadline } : {}) },
  });
}

// ==== RATING ANALYTICS TYPES & FUNCTIONS ====

export type ReviewerRanking = {
  rank: number;
  userId: string;
  name: string;
  email: string;
  aggregateScore: number | null;
  avgQualityScore: number | null;
  avgQuantityScore: number | null;
  avgTimeScore: number | null;
  totalAssigned: number;
  totalCompleted: number;
  totalIncomplete: number;
  totalDeclined: number;
  ratingCount: number;
};

export type OverallAnalyticsSummary = {
  totalReviewers: number;
  avgAggregateScore: number | null;
  highestScore: number | null;
  lowestScore: number | null;
  totalRatingsGiven: number;
};

export type OverallAnalyticsResponse = {
  rankings: ReviewerRanking[];
  summary: OverallAnalyticsSummary;
};

export type UserAnalyticsResponse = ReviewerRanking & {
  totalReviewers: number;
};

export function getOverallAnalyticsRequest() {
  return apiRequest<OverallAnalyticsResponse>('/ratings/overall');
}

export function getUserAnalyticsRequest(userId: string) {
  return apiRequest<UserAnalyticsResponse>(`/ratings/user/${userId}`);
}

function buildUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string') {
    return payload.message;
  }

  return fallback || 'Request failed';
}
