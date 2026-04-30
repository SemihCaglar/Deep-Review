const TOKEN_KEY = 'bilsen_auth_token';
const USER_KEY = 'bilsen_auth_user';

export type StoredTopic = {
  id: string;
  name: string;
};

export type StoredAuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  approvalStatus: string;
  approvalReviewedAt: string | null;
  approvalNote: string | null;
  createdAt: string;
  updatedAt: string;
  interests?: StoredTopic[];
  otherInterests?: string[];
  labs?: { id: string; name: string }[];
};

function canUseStorage() {
  return typeof window !== 'undefined';
}

export function getToken(): string | null {
  if (!canUseStorage()) {
    return null;
  }

  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(TOKEN_KEY);
}

export function getStoredUser(): StoredAuthUser | null {
  if (!canUseStorage()) {
    return null;
  }

  const rawUser = window.localStorage.getItem(USER_KEY);

  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as StoredAuthUser;
  } catch {
    return null;
  }
}

export function setStoredUser(user: StoredAuthUser) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function mapStoredUserToLegacyUser(user: StoredAuthUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isCoordinator: user.role === 'Coordinator',
    isAdmin: user.role === 'Admin',
    labs: user.labs || [],
  };
}
