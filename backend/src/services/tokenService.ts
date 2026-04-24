import jwt, { JwtPayload } from 'jsonwebtoken';
import type { User } from '../entities/User';

const JWT_EXPIRES_IN = '24h';
const JWT_SECRET = getRequiredJwtSecret();

type AuthTokenPayload = JwtPayload & {
  sub: string;
  email: string;
  role: string;
};

export function generateAuthToken(user: Pick<User, 'id' | 'email' | 'role'>): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: JWT_EXPIRES_IN,
    },
  );
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

    if (!isAuthTokenPayload(payload)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function isAuthTokenPayload(payload: string | JwtPayload): payload is AuthTokenPayload {
  return (
    typeof payload !== 'string' &&
    typeof payload.sub === 'string' &&
    typeof payload.email === 'string' &&
    typeof payload.role === 'string'
  );
}

function getRequiredJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  return secret;
}
