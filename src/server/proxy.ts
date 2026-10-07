import { Request, Response } from 'express';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { validateStreamUrl } from './security.ts';
import { logger } from './logger.ts';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Rewrites relative and absolute URLs within an M3U8 manifest so all
 * sub-playlists, media segments, and encryption keys are routed through /api/proxy.
 * This completely avoids CORS and Mixed Content (HTTPS -> HTTP) blocking in browsers.
 */
export function rewriteM3u8Manifest(manifestText: string, baseUrl: string): string {
  const lines = manifestText.split(/\r?\n/);
  const rewritten = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // Handle M3U8 tags that contain URI attributes (e.g. #EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA)
    if (trimmed.startsWith('#')) {
      if (trimmed.includes('URI=')) {
        return trimmed.replace(/URI=["']?([^"',\s]+)["']?/g, (fullMatch, uri) => {
          try {
            const absoluteUri = new URL(uri, baseUrl).toString();
            return `URI="/api/proxy?url=${encodeURIComponent(absoluteUri)}"`;
          } catch {
            return fullMatch;
          }
        });
      }
      return line;
    }

    // Line is a URI to a sub-playlist (.m3u8) or a media segment (.ts, .m4s, etc.)
    try {
      const absoluteUrl = new URL(trimmed, baseUrl).toString();
      return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
    } catch {
      return line;
    }
  });

  return rewritten.join('\n');
}

export async function handleStreamProxy(req: Request, res: Response): Promise<void> {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    res.status(400).json({ error: 'Missing "url" query parameter' });
    return;
  }

  const validation = validateStreamUrl(targetUrl);
  if (!validation.valid || !validation.parsedUrl) {
    res.status(403).json({ error: validation.error || 'Forbidden target URL' });
    return;
  }

  const customReferer = req.query.referer as string;
  const customUserAgent = (req.query.userAgent as string) || DEFAULT_USER_AGENT;

  fetchAndProxy(validation.parsedUrl.toString(), req, res, customUserAgent, customReferer, 0);
}

function fetchAndProxy(
  streamUrl: string,
  req: Request,
  res: Response,
  userAgent: string,
  referer?: string,
  redirectCount = 0
) {
  if (redirectCount > 5) {
    res.status(502).json({ error: 'Too many redirects' });
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(streamUrl);
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  const client = parsed.protocol === 'https:' ? https : http;

  const headers: Record<string, string> = {
    'User-Agent': userAgent,
    'Accept': '*/*'
  };

  if (referer) {
    headers['Referer'] = referer;
  }

  if (req.headers.range) {
    headers['Range'] = req.headers.range;
  }

  const options: http.RequestOptions = {
    method: 'GET',
    headers,
    timeout: 15000
  };

  const proxyReq = client.request(parsed, options, proxyRes => {
    // Handle redirect
    if (
      proxyRes.statusCode &&
      [301, 302, 303, 307, 308].includes(proxyRes.statusCode) &&
      proxyRes.headers.location
    ) {
      const redirectUrl = new URL(proxyRes.headers.location, parsed).toString();
      const val = validateStreamUrl(redirectUrl);
      if (!val.valid) {
        res.status(403).json({ error: 'Redirected to forbidden URL' });
        return;
      }
      logger.info(`Proxy redirecting to: ${redirectUrl}`);
      fetchAndProxy(redirectUrl, req, res, userAgent, referer, redirectCount + 1);
      return;
    }

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    // Forward status code
    res.status(proxyRes.statusCode || 200);

    const rawContentType = (proxyRes.headers['content-type'] || '').toLowerCase();
    const cleanPath = parsed.pathname.toLowerCase();
    const isM3u8ByExt = cleanPath.endsWith('.m3u8') || parsed.search.toLowerCase().includes('.m3u8');
    const isM3u8ByType =
      rawContentType.includes('mpegurl') ||
      rawContentType.includes('application/x-mpegurl') ||
      rawContentType.includes('vnd.apple.mpegurl');

    // Forward selected headers for media chunks or general responses
    const forwardHeaders = [
      'content-length',
      'accept-ranges',
      'content-range',
      'cache-control'
    ];

    forwardHeaders.forEach(h => {
      const val = proxyRes.headers[h];
      if (val) {
        res.setHeader(h, val);
      }
    });

    // Check if this response is an M3U8 playlist
    if (isM3u8ByExt || isM3u8ByType) {
      let bodyData = '';
      proxyRes.setEncoding('utf8');
      proxyRes.on('data', chunk => {
        bodyData += chunk;
      });
      proxyRes.on('end', () => {
        if (bodyData.includes('#EXTM3U') || isM3u8ByExt) {
          const rewritten = rewriteM3u8Manifest(bodyData, streamUrl);
          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.send(rewritten);
        } else {
          // If not starting with #EXTM3U, send as is
          if (rawContentType) {
            res.setHeader('Content-Type', rawContentType);
          }
          res.send(bodyData);
        }
      });
      return;
    }

    // For non-M3U8 responses (e.g. .ts video chunks, binary streams)
    // Inspect first chunk to see if it starts with #EXTM3U (some servers omit content-type and extension)
    let isFirstChunk = true;
    let isManifest = false;
    let manifestBuffer = '';

    proxyRes.on('data', chunk => {
      if (isFirstChunk) {
        isFirstChunk = false;
        const chunkStr = chunk.slice(0, 10).toString('utf8');
        if (chunkStr.startsWith('#EXTM3U')) {
          isManifest = true;
          manifestBuffer += chunk.toString('utf8');
          return;
        }

        // Set proper content type for TS segments if missing
        if (cleanPath.endsWith('.ts') && !rawContentType) {
          res.setHeader('Content-Type', 'video/mp2t');
        } else if (rawContentType) {
          res.setHeader('Content-Type', rawContentType);
        }
      }

      if (isManifest) {
        manifestBuffer += chunk.toString('utf8');
      } else {
        res.write(chunk);
      }
    });

    proxyRes.on('end', () => {
      if (isManifest) {
        const rewritten = rewriteM3u8Manifest(manifestBuffer, streamUrl);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(rewritten);
      } else {
        res.end();
      }
    });

    proxyRes.on('error', err => {
      logger.warn(`Proxy stream error: ${err.message}`);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Stream transfer failed' });
      }
    });
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ error: 'Stream gateway timeout' });
    }
  });

  proxyReq.on('error', err => {
    const isDnsError = err.message.includes('ENOTFOUND');
    const isRefused = err.message.includes('ECONNREFUSED');
    const isTimeout = err.message.includes('ETIMEDOUT');

    let humanMessage = `Không thể kết nối đến máy chủ luồng (${err.message})`;
    if (isDnsError) {
      humanMessage = 'Tên miền máy chủ luồng không tồn tại hoặc đã ngừng hoạt động (DNS ENOTFOUND).';
    } else if (isRefused) {
      humanMessage = 'Máy chủ phát sóng từ chối kết nối (Connection Refused).';
    } else if (isTimeout) {
      humanMessage = 'Kết nối đến luồng phát sóng bị quá thời gian chờ (Timeout).';
    }

    logger.warn(`Proxy upstream unreachable: ${parsed.hostname} - ${err.message}`);
    if (!res.headersSent) {
      res.status(502).json({ error: humanMessage, detail: err.message, host: parsed.hostname });
    }
  });

  req.on('close', () => {
    proxyReq.destroy();
  });

  proxyReq.end();
}
