const DEFAULT_API_BASE_URL = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3001/api`
  : 'http://localhost:3001/api';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, '') || DEFAULT_API_BASE_URL;
