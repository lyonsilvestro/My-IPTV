import { Router, Request, Response } from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { dbService } from '../db.ts';
import { parseM3U } from '../parser.ts';
import { handleStreamProxy } from '../proxy.ts';
import { transcodeManager, PROFILES } from '../transcoder.ts';
import { fetchAndParseXmltv, parseXmltvString } from '../epg.ts';
import { logger } from '../logger.ts';
import { config } from '../config.ts';
import { sanitizePath, validateStreamUrl } from '../security.ts';
import { Playlist, TranscodeProfile } from '../../types/iptv.ts';

const router = Router();
const upload = multer({
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max playlist
});

// Admin authentication state
const validAdminTokens = new Set<string>();

export function requireAdminAuth(req: Request, res: Response, next: () => void) {
  const authHeader = req.headers['authorization'] || req.headers['x-admin-token'];
  let token = '';
  if (typeof authHeader === 'string') {
    token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
  }

  if (!token || !validAdminTokens.has(token)) {
    res.status(403).json({
      error: 'Quyền bị từ chối: Chỉ Quản trị viên (Admin) mới có quyền thêm, xóa hoặc cập nhật danh sách kênh hệ thống.'
    });
    return;
  }
  next();
}

// Health check endpoint
router.get('/health', async (req: Request, res: Response) => {
  let dbOk = false;
  try {
    await dbService.getStats();
    dbOk = true;
  } catch {
    dbOk = false;
  }

  res.json({
    status: 'ok',
    ffmpeg: true,
    database: dbOk,
    timestamp: new Date().toISOString()
  });
});

// Transcode Profiles metadata
router.get('/profiles', (req: Request, res: Response) => {
  res.json(Object.values(PROFILES));
});

// Channels API
router.get('/channels', async (req: Request, res: Response) => {
  try {
    const group = req.query.group as string;
    const search = req.query.search as string;
    const onlyFavorites = req.query.favorites === 'true';
    const limit = parseInt((req.query.limit as string) || '500', 10);
    const offset = parseInt((req.query.offset as string) || '0', 10);

    const result = await dbService.getChannels({
      group,
      search,
      onlyFavorites,
      limit,
      offset
    });

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Error fetching channels', { error: message });
    res.status(500).json({ error: message });
  }
});

router.get('/channels/:id', async (req: Request, res: Response) => {
  try {
    const channel = await dbService.getChannelById(req.params.id);
    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }
    res.json(channel);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

router.post('/channels/:id/favorite', async (req: Request, res: Response) => {
  try {
    const isFav = await dbService.toggleFavorite(req.params.id);
    res.json({ channelId: req.params.id, isFavorite: isFav });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

router.post('/channels/:id/history', async (req: Request, res: Response) => {
  try {
    await dbService.addHistory(req.params.id);
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

router.get('/history', async (req: Request, res: Response) => {
  try {
    const history = await dbService.getRecentHistory(30);
    res.json(history);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

router.get('/groups', async (req: Request, res: Response) => {
  try {
    const groups = await dbService.getGroups();
    res.json(groups);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// Playlists API
router.get('/playlists', async (req: Request, res: Response) => {
  try {
    const playlists = await dbService.getAllPlaylists();
    res.json(playlists);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// Add playlist via URL or JSON body
router.post('/playlists', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { name, url, content } = req.body;
    if (!name || (!url && !content)) {
      res.status(400).json({ error: 'Tên playlist và URL hoặc nội dung M3U là bắt buộc.' });
      return;
    }

    let m3uText = content || '';

    if (url) {
      const val = validateStreamUrl(url);
      if (!val.valid) {
        res.status(400).json({ error: `URL playlist không hợp lệ: ${val.error}` });
        return;
      }

      logger.info(`Fetching remote M3U playlist from: ${url}`);
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 IPTV-Playlist-Importer/1.0' }
      });
      if (!resp.ok) {
        res.status(400).json({ error: `Không thể tải playlist: HTTP ${resp.status} ${resp.statusText}` });
        return;
      }
      m3uText = await resp.text();
    }

    const playlistId = `pl-${Date.now()}`;
    const channels = parseM3U(m3uText, playlistId);

    if (channels.length === 0) {
      res.status(400).json({ error: 'Không tìm thấy kênh hợp lệ trong playlist. Hãy đảm bảo file có cú pháp #EXTINF và URL kênh.' });
      return;
    }

    const now = new Date().toISOString();
    const playlist: Playlist = {
      id: playlistId,
      name: name.trim(),
      url: url || undefined,
      type: url ? 'url' : 'upload',
      channelCount: channels.length,
      isActive: true,
      lastUpdated: now,
      createdAt: now
    };

    await dbService.savePlaylist(playlist);
    await dbService.insertChannelsBatch(channels);

    logger.info(`Imported playlist "${name}" with ${channels.length} channels.`);
    res.json({ playlist, channelCount: channels.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Error importing playlist', { error: message });
    res.status(500).json({ error: message });
  }
});

// Upload M3U file
router.post('/playlists/upload', requireAdminAuth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const name = req.body.name || file?.originalname || 'Uploaded Playlist';
    if (!file) {
      res.status(400).json({ error: 'Vui lòng chọn file .m3u hoặc .m3u8 để tải lên.' });
      return;
    }

    const m3uText = file.buffer.toString('utf8');
    const playlistId = `pl-${Date.now()}`;
    const channels = parseM3U(m3uText, playlistId);

    if (channels.length === 0) {
      res.status(400).json({ error: 'Không tìm thấy kênh hợp lệ trong file M3U tải lên.' });
      return;
    }

    const now = new Date().toISOString();
    const playlist: Playlist = {
      id: playlistId,
      name: name.trim(),
      type: 'upload',
      channelCount: channels.length,
      isActive: true,
      lastUpdated: now,
      createdAt: now
    };

    await dbService.savePlaylist(playlist);
    await dbService.insertChannelsBatch(channels);

    logger.info(`Uploaded playlist "${name}" with ${channels.length} channels.`);
    res.json({ playlist, channelCount: channels.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Error uploading playlist', { error: message });
    res.status(500).json({ error: message });
  }
});

// Refresh playlist from URL
router.post('/playlists/:id/refresh', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const playlist = await dbService.getPlaylist(req.params.id);
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    if (!playlist.url) {
      res.status(400).json({ error: 'Playlist này được upload trực tiếp, không có URL để cập nhật.' });
      return;
    }

    const val = validateStreamUrl(playlist.url);
    if (!val.valid) {
      res.status(400).json({ error: `URL playlist không hợp lệ: ${val.error}` });
      return;
    }

    logger.info(`Refreshing playlist: ${playlist.name}`);
    const resp = await fetch(playlist.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 IPTV-Playlist-Importer/1.0' }
    });
    if (!resp.ok) {
      res.status(400).json({ error: `Không thể tải lại: HTTP ${resp.status}` });
      return;
    }

    const m3uText = await resp.text();
    const channels = parseM3U(m3uText, playlist.id);

    await dbService.deleteChannelsByPlaylist(playlist.id);
    await dbService.insertChannelsBatch(channels);

    playlist.channelCount = channels.length;
    playlist.lastUpdated = new Date().toISOString();
    await dbService.savePlaylist(playlist);

    logger.info(`Refreshed playlist "${playlist.name}": ${channels.length} channels updated.`);
    res.json({ playlist, channelCount: channels.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Error refreshing playlist', { error: message });
    res.status(500).json({ error: message });
  }
});

// Toggle playlist active state
router.post('/playlists/:id/toggle', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const playlist = await dbService.getPlaylist(req.params.id);
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    const newActive = !playlist.isActive;
    await dbService.togglePlaylistActive(playlist.id, newActive);
    res.json({ id: playlist.id, isActive: newActive });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// Delete playlist
router.delete('/playlists/:id', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    await dbService.deletePlaylist(req.params.id);
    logger.info(`Deleted playlist: ${req.params.id}`);
    res.json({ success: true, deletedId: req.params.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// EPG API
router.post('/epg/fetch', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ error: 'Vui lòng cung cấp XMLTV URL.' });
      return;
    }

    await dbService.setSetting('epg_url', url);
    const count = await fetchAndParseXmltv(url);
    res.json({ success: true, count, url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Error updating EPG', { error: message });
    res.status(500).json({ error: message });
  }
});

router.post('/epg/upload', requireAdminAuth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Vui lòng chọn file XMLTV.' });
      return;
    }
    const xmlText = file.buffer.toString('utf8');
    const count = await parseXmltvString(xmlText);
    res.json({ success: true, count });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Error uploading XMLTV', { error: message });
    res.status(500).json({ error: message });
  }
});

// Stream Proxy API
router.get('/proxy', handleStreamProxy);

// Transcoding API
router.post('/transcode/start', async (req: Request, res: Response) => {
  try {
    const { channelId, profile } = req.body;
    if (!channelId) {
      res.status(400).json({ error: 'Missing channelId' });
      return;
    }

    const selectedProfile: TranscodeProfile = profile || 'mobile';
    if (!PROFILES[selectedProfile]) {
      res.status(400).json({ error: `Invalid profile: ${selectedProfile}` });
      return;
    }

    const { isNew, hlsUrl, tsStreamUrl } = await transcodeManager.startOrGetSession(channelId, selectedProfile);

    res.json({
      status: 'ready',
      channelId,
      profile: selectedProfile,
      hlsUrl,
      tsStreamUrl,
      isNew
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Error starting transcode', { error: message });
    res.status(500).json({ error: message });
  }
});

router.post('/transcode/stop', (req: Request, res: Response) => {
  const { channelId, profile } = req.body;
  if (!channelId || !profile) {
    res.status(400).json({ error: 'Missing channelId or profile' });
    return;
  }
  const stopped = transcodeManager.stopSession(channelId, profile);
  res.json({ success: stopped });
});

router.get('/transcode/sessions', (req: Request, res: Response) => {
  const sessions = transcodeManager.getActiveSessions();
  res.json(sessions);
});

router.post('/transcode/sessions/:id/stop', (req: Request, res: Response) => {
  const [channelId, profile] = req.params.id.split(':');
  if (!channelId || !profile) {
    res.status(400).json({ error: 'Invalid session ID' });
    return;
  }
  const stopped = transcodeManager.stopSession(channelId, profile as TranscodeProfile);
  res.json({ success: stopped });
});

// Serve HLS files generated by FFmpeg
router.get('/transcode/hls/:channelId/:profile/:file', (req: Request, res: Response) => {
  const { channelId, profile, file } = req.params;
  const cleanChan = sanitizePath(channelId);
  const cleanProfile = sanitizePath(profile) as TranscodeProfile;
  const cleanFile = sanitizePath(file);

  const filePath = path.join(config.transcodeDir, `${cleanChan}_${cleanProfile}`, cleanFile);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'HLS segment or manifest not ready yet' });
    return;
  }

  // Update session activity
  transcodeManager.touchSession(channelId, cleanProfile);

  res.setHeader('Access-Control-Allow-Origin', '*');
  if (cleanFile.endsWith('.m3u8')) {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache');
  } else if (cleanFile.endsWith('.ts')) {
    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

// Live Continuous MPEG-TS Stream for Nokia E72 / CorePlayer / VLC
router.get('/transcode/live/:channelId/:profile.ts', async (req: Request, res: Response) => {
  const { channelId, profile } = req.params;
  const channel = await dbService.getChannelById(channelId);
  if (!channel) {
    res.status(404).send('Channel not found');
    return;
  }

  const val = validateStreamUrl(channel.url);
  if (!val.valid || !val.parsedUrl) {
    res.status(400).send('Invalid stream URL');
    return;
  }

  const selectedProfile: TranscodeProfile = (profile as TranscodeProfile) || 'nokia_e72';
  const p = PROFILES[selectedProfile] || PROFILES.nokia_e72;

  logger.info(`Starting direct MPEG-TS pipe for "${channel.name}" [${selectedProfile}] to client`);

  res.setHeader('Content-Type', 'video/mp2t');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');

  // Spawn dedicated direct FFmpeg pipe to response stream
  const ffmpegArgs: string[] = [
    '-hide_banner',
    '-loglevel', 'warning',
    '-reconnect', '1',
    '-reconnect_at_eof', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    '-i', val.parsedUrl.toString()
  ];

  if (selectedProfile === 'nokia_e72') {
    ffmpegArgs.push(
      '-vf', 'scale=320:240:force_original_aspect_ratio=decrease,pad=320:240:(ow-iw)/2:(oh-ih)/2,fps=15',
      '-c:v', 'libx264',
      '-profile:v', 'baseline',
      '-level', '1.3',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-b:v', '180k',
      '-maxrate', '220k',
      '-bufsize', '400k',
      '-g', '30',
      '-c:a', 'aac',
      '-b:a', '40k',
      '-ar', '22050',
      '-ac', '1',
      '-f', 'mpegts',
      'pipe:1'
    );
  } else {
    ffmpegArgs.push(
      '-vf', `scale=${p.resolution}:force_original_aspect_ratio=decrease,fps=${p.fps}`,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-b:v', p.videoBitrate,
      '-maxrate', `${parseInt(p.videoBitrate) * 1.3}k`,
      '-bufsize', `${parseInt(p.videoBitrate) * 2}k`,
      '-g', `${p.fps * 2}`,
      '-c:a', 'aac',
      '-b:a', p.audioBitrate,
      '-ar', '32000',
      '-ac', '2',
      '-f', 'mpegts',
      'pipe:1'
    );
  }

  const proc = spawn(config.ffmpegPath, ffmpegArgs, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  proc.stdout.pipe(res);

  proc.stderr.on('data', data => {
    // optional debug
  });

  req.on('close', () => {
    logger.info(`Client disconnected from direct MPEG-TS pipe for ${channel.name}`);
    proc.kill('SIGTERM');
  });

  proc.on('error', err => {
    logger.error(`Direct MPEG-TS process error: ${err.message}`);
    if (!res.headersSent) {
      res.status(502).send('Transcode pipe error');
    }
  });
});

// Admin API
router.post('/admin/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (username === config.adminUsername && password === config.adminPassword) {
    // Generate secure session token and register
    const token = `adm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    validAdminTokens.add(token);
    logger.info(`Admin logged in successfully: ${username}`);
    res.json({ success: true, token, username });
  } else {
    logger.warn(`Failed admin login attempt for user: ${username}`);
    res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu.' });
  }
});

router.get('/admin/verify', (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'] || req.headers['x-admin-token'];
  let token = '';
  if (typeof authHeader === 'string') {
    token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
  }
  if (token && validAdminTokens.has(token)) {
    res.json({ authenticated: true, username: config.adminUsername });
  } else {
    res.json({ authenticated: false });
  }
});

router.post('/admin/logout', (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'] || req.headers['x-admin-token'];
  let token = '';
  if (typeof authHeader === 'string') {
    token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
  }
  if (token) {
    validAdminTokens.delete(token);
  }
  res.json({ success: true });
});

router.get('/admin/metrics', async (req: Request, res: Response) => {
  try {
    const totalMem = Math.round(os.totalmem() / 1024 / 1024);
    const freeMem = Math.round(os.freemem() / 1024 / 1024);
    const usedMem = totalMem - freeMem;

    // Estimate CPU load average
    const cpus = os.cpus();
    const loadAvg = os.loadavg();
    const cpuUsage = Math.min(100, Math.round((loadAvg[0] / (cpus.length || 1)) * 100));

    const stats = await dbService.getStats();
    const sessions = transcodeManager.getActiveSessions();

    res.json({
      cpuUsage,
      totalMemoryMb: totalMem,
      freeMemoryMb: freeMem,
      usedMemoryMb: usedMem,
      uptimeSeconds: Math.round(os.uptime()),
      nodeVersion: process.version,
      activeTranscodeSessions: sessions.length,
      totalPlaylists: stats.playlistCount,
      totalChannels: stats.channelCount,
      ffmpegAvailable: true
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

router.get('/admin/logs', (req: Request, res: Response) => {
  const limit = parseInt((req.query.limit as string) || '100', 10);
  res.json(logger.getLogs(limit));
});

export default router;
