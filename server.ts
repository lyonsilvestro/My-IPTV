import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import apiRouter from './src/server/routes/api.ts';
import legacyRouter from './src/server/routes/legacy.ts';
import { getDb, dbService } from './src/server/db.ts';
import { logger } from './src/server/logger.ts';
import { config } from './src/server/config.ts';
import { parseM3U } from './src/server/parser.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();

  // Basic Middleware
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Initialize SQLite database
  await getDb();
  logger.info('Database initialized successfully.');

  // Pre-seed a legal, open public test playlist if empty or outdated
  const demoM3U = `#EXTM3U
#EXTINF:-1 tvg-id="NASA-TV" tvg-name="NASA TV" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/e/e5/NASA_logo.svg" group-title="Science & Tech",NASA TV Public Live
https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8
#EXTINF:-1 tvg-id="Akamai-Live" tvg-name="Akamai 24/7 Live" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/8/8b/Akamai_Technologies_logo.svg" group-title="General",Akamai 24/7 Live Stream
https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8
#EXTINF:-1 tvg-id="DW-English" tvg-name="Deutsche Welle" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/7/75/Deutsche_Welle_logo.svg" group-title="News",DW English Live
https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8
#EXTINF:-1 tvg-id="Mux-Test" tvg-name="Mux Animation" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/c/c5/Big_buck_bunny_poster_big.jpg" group-title="Movies",Big Buck Bunny Multi-Bitrate HLS
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
#EXTINF:-1 tvg-id="Apple-BipBop" tvg-name="Apple BipBop" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg" group-title="General",Apple BipBop 4x3 Test Stream
https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8
`;

  const playlists = await dbService.getAllPlaylists();
  const plId = 'pl-default-demo';
  const existingDefault = playlists.find(p => p.id === plId);

  // If empty or default demo playlist has old URLs, refresh it
  if (playlists.length === 0 || existingDefault) {
    const channels = parseM3U(demoM3U, plId);
    await dbService.savePlaylist({
      id: plId,
      name: 'Sample Public Free-To-Air Streams',
      type: 'upload',
      channelCount: channels.length,
      isActive: true,
      lastUpdated: new Date().toISOString(),
      createdAt: existingDefault ? existingDefault.createdAt : new Date().toISOString()
    });
    await dbService.deleteChannelsByPlaylist(plId);
    await dbService.insertChannelsBatch(channels);
    logger.info(`Initialized sample playlist with ${channels.length} verified live streams.`);
  }

  // Auto-detect Nokia E72 / Symbian / Opera Mini / WAP browsers and redirect root path to /legacy
  app.use((req, res, next) => {
    if (req.path === '/' || req.path === '/index.html') {
      const ua = (req.headers['user-agent'] || '').toLowerCase();
      const isOperaMini = Boolean(req.headers['x-operamini-features'] || req.headers['x-operamini-phone']);
      const isLegacy =
        isOperaMini ||
        ua.includes('opera mini') ||
        ua.includes('symbian') ||
        ua.includes('series60') ||
        ua.includes('s60') ||
        ua.includes('nokia') ||
        ua.includes('midp') ||
        ua.includes('j2me') ||
        ua.includes('ucbrowser') ||
        ua.includes('ucweb') ||
        ua.includes('netfront');

      if (isLegacy) {
        logger.info(`Detected legacy device [${req.headers['user-agent']}], auto-redirecting to /legacy`);
        return res.redirect('/legacy');
      }
    }
    next();
  });

  // Mount backend API and Legacy Router
  app.use('/api', apiRouter);
  app.use('/legacy', legacyRouter);

  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    // Development mode: Mount Vite middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
    logger.info('Vite dev middleware mounted.');
  } else {
    // Production mode: Serve built dist files
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/legacy')) {
          return next();
        }
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
      logger.info(`Serving production static assets from ${distPath}`);
    }
  }

  // Fallback 404 for unhandled API and Legacy routes
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
  });

  const PORT = config.port;
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`IPTV Web Server running at http://0.0.0.0:${PORT}`);
    logger.info(`Nokia E72 / Legacy Mode URL: http://0.0.0.0:${PORT}/legacy`);
  });
}

startServer().catch(err => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
