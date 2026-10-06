import { URL } from 'url';
import { config } from './config.ts';
import { logger } from './logger.ts';

// Check if IP or hostname is private/local to prevent SSRF
export function isPrivateOrLocalAddress(hostname: string): boolean {
  if (config.allowLanAccess) {
    return false;
  }

  const cleanHost = hostname.trim().toLowerCase();

  // Localhost names
  if (cleanHost === 'localhost' || cleanHost.endsWith('.local') || cleanHost.endsWith('.internal')) {
    return true;
  }

  // IPv4 Loopback & Special
  if (
    cleanHost === '0.0.0.0' ||
    cleanHost.startsWith('127.') ||
    cleanHost.startsWith('169.254.') // Link-local
  ) {
    return true;
  }

  // Private IPv4 ranges
  // 10.0.0.0 - 10.255.255.255
  if (cleanHost.startsWith('10.')) {
    return true;
  }

  // 192.168.0.0 - 192.168.255.255
  if (cleanHost.startsWith('192.168.')) {
    return true;
  }

  // 172.16.0.0 - 172.31.255.255
  const match172 = cleanHost.match(/^172\.(\d+)\./);
  if (match172) {
    const secondOctet = parseInt(match172[1], 10);
    if (secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }

  // IPv6 Loopback and Link-local
  if (
    cleanHost === '::1' ||
    cleanHost === '::' ||
    cleanHost.startsWith('fe80:') ||
    cleanHost.startsWith('fc00:') ||
    cleanHost.startsWith('fd00:')
  ) {
    return true;
  }

  return false;
}

export function validateStreamUrl(rawUrl: string): { valid: boolean; error?: string; parsedUrl?: URL } {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'URL is required' };
  }

  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'rtsp:') {
      return { valid: false, error: `Protocol ${parsed.protocol} is not supported. Use http or https.` };
    }

    if (isPrivateOrLocalAddress(parsed.hostname)) {
      logger.warn(`SSRF Blocked request to private host: ${parsed.hostname}`);
      return { valid: false, error: 'Access to private or local network is forbidden.' };
    }

    return { valid: true, parsedUrl: parsed };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `Invalid URL format: ${errorMsg}` };
  }
}

export function sanitizePath(input: string): string {
  // Prevent directory traversal
  return input.replace(/(\.\.[/\\])+/g, '').replace(/[^a-zA-Z0-9_-]/g, '_');
}
