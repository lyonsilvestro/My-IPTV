import { Request, Response } from 'express';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { validateStreamUrl } from './security.ts';
import { logger } from './logger.ts';

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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

    // Forward selected headers
    const forwardHeaders = [
      'content-type',
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

    // Pipe response stream directly
    proxyRes.pipe(res);

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
