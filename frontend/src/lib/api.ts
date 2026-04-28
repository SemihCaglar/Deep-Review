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

export function signupRequest(name: string, email: string, password: string) {
  return apiRequest<AccountUserResponse>('/account/signup', {
    method: 'POST',
    body: {
      name,
      email,
      password,
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

export type RegisterPaperPayload = {
  title: string;
  abstractText: string;
  targetVenue: string;
  topics: string[];
  authors?: string[];
  overleafLink?: string;
};

export function registerPaperRequest(payload: RegisterPaperPayload) {
  return apiRequest<{ message: string; paper: any }>('/papers', {
    method: 'POST',
    body: payload,
  });
}

export function getPaperByIdRequest(id: string) {
  return apiRequest<any>(`/papers/${id}`);
}

export function getAllPapersRequest() {
  return apiRequest<any[]>('/papers/all');
}

export function updatePaperAbstractRequest(id: string, abstract: string) {
  return apiRequest<any>(`/papers/${id}/abstract`, {
    method: 'PUT',
    body: { abstract },
  });
}

export function updatePaperTopicsRequest(id: string, topics: string[]) {
  return apiRequest<any>(`/papers/${id}/topics-update`, {
    method: 'PUT',
    body: { topics },
  });
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
