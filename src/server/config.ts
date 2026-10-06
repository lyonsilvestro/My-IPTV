import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const TRANSCODE_DIR = path.resolve(process.cwd(), 'transcode_cache');
if (!fs.existsSync(TRANSCODE_DIR)) {
  fs.mkdirSync(TRANSCODE_DIR, { recursive: true });
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  dataDir: DATA_DIR,
  transcodeDir: TRANSCODE_DIR,
  dbPath: process.env.DATABASE_PATH || path.join(DATA_DIR, 'iptv.db'),
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  sessionSecret: process.env.SESSION_SECRET || 'iptv-default-secret-salt-2026',
  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
  maxTranscodeSessions: parseInt(process.env.MAX_TRANSCODE_SESSIONS || '5', 10),
  playlistRefreshInterval: parseInt(process.env.PLAYLIST_REFRESH_INTERVAL || '21600', 10), // 6 hours
  allowLanAccess: process.env.ALLOW_LAN_ACCESS === 'true',
  legacyBaseUrl: process.env.LEGACY_BASE_URL || ''
};
