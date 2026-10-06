// Base URL for backend API calls
// If VITE_BACKEND_URL is set (e.g. when frontend is deployed on Vercel and backend is on Render),
// it prepends the backend origin. Otherwise, it defaults to relative paths ('/api/...').
export const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/+$/, '');

export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_URL}${cleanPath}`;
}
