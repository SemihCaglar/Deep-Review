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
