export const PROFILE_MODAL_PARAM = 'profileModal';

type SearchParamsLike = {
  get: (name: string) => string | null;
};

export function getProfileReturnHref(searchParams: SearchParamsLike) {
  return openProfileModalHref(sanitizeReturnTo(searchParams.get('returnTo')));
}

export function openProfileModalHref(targetPath: string) {
  const sanitizedTarget = sanitizeReturnTo(targetPath);
  const hashIndex = sanitizedTarget.indexOf('#');
  const pathAndQuery = hashIndex >= 0 ? sanitizedTarget.slice(0, hashIndex) : sanitizedTarget;
  const hash = hashIndex >= 0 ? sanitizedTarget.slice(hashIndex) : '';
  const separator = pathAndQuery.includes('?') ? '&' : '?';

  return `${pathAndQuery}${separator}${PROFILE_MODAL_PARAM}=1${hash}`;
}

export function sanitizeReturnTo(returnTo: string | null) {
  if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) {
    return '/dashboard';
  }

  if (returnTo.startsWith('/profile')) {
    return '/dashboard';
  }

  return returnTo;
}
