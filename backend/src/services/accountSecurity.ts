import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import type { User } from '../entities/User';

const scrypt = promisify(scryptCallback);

const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_LENGTH = 64;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MS = 10 * 60 * 1000;
const LOCKOUT_DURATION_MS = 10 * 60 * 1000;
const PASSWORD_RESET_TOKEN_BYTES = 32;
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(PASSWORD_SALT_BYTES).toString('hex');
  const derivedKey = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;

  return `${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const [salt, storedKeyHex] = passwordHash.split(':');

  if (!salt || !storedKeyHex) {
    return false;
  }

  const storedKey = Buffer.from(storedKeyHex, 'hex');
  const derivedKey = (await scrypt(password, salt, storedKey.length)) as Buffer;

  if (storedKey.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(storedKey, derivedKey);
}

export function createPasswordResetToken(): string {
  return randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('hex');
}

export function hashPasswordResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isAccountLocked(user: Pick<User, 'lockedUntil'>, now: Date = new Date()): boolean {
  return !!user.lockedUntil && user.lockedUntil.getTime() > now.getTime();
}

export function clearLoginLockout(user: Pick<User, 'failedLogins' | 'failedLoginWindowStartedAt' | 'lockedUntil'>): void {
  user.failedLogins = 0;
  user.failedLoginWindowStartedAt = null;
  user.lockedUntil = null;
}

export function registerFailedLoginAttempt(
  user: Pick<User, 'failedLogins' | 'failedLoginWindowStartedAt' | 'lockedUntil'>,
  now: Date = new Date(),
): void {
  if (
    !user.failedLoginWindowStartedAt ||
    now.getTime() - user.failedLoginWindowStartedAt.getTime() > LOCKOUT_WINDOW_MS
  ) {
    user.failedLoginWindowStartedAt = now;
    user.failedLogins = 1;
  } else {
    user.failedLogins += 1;
  }

  if (user.failedLogins >= LOCKOUT_THRESHOLD) {
    user.lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);
  }
}

export function registerSuccessfulLogin(
  user: Pick<User, 'failedLogins' | 'failedLoginWindowStartedAt' | 'lockedUntil' | 'lastLoginAt'>,
  now: Date = new Date(),
): void {
  clearLoginLockout(user);
  user.lastLoginAt = now;
}

export const accountSecurityPolicy = {
  passwordKeyLength: PASSWORD_KEY_LENGTH,
  passwordSaltBytes: PASSWORD_SALT_BYTES,
  lockoutThreshold: LOCKOUT_THRESHOLD,
  lockoutWindowMs: LOCKOUT_WINDOW_MS,
  lockoutDurationMs: LOCKOUT_DURATION_MS,
  passwordResetTokenTtlMs: PASSWORD_RESET_TOKEN_TTL_MS,
};
