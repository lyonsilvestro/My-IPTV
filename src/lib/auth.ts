// Admin Authentication Helper for Client
const TOKEN_KEY = 'iptv_admin_token';
const USERNAME_KEY = 'iptv_admin_username';

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAdminSession(token: string, username = 'admin') {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearAdminSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

export function isAdminLoggedIn(): boolean {
  return Boolean(getAdminToken());
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAdminToken();
  if (token) {
    return {
      'x-admin-token': token,
      'Authorization': `Bearer ${token}`
    };
  }
  return {};
}
