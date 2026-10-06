import { ChildProcess, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { config } from './config.ts';
import { logger } from './logger.ts';
import { ProfileConfig, TranscodeProfile, TranscodeSessionInfo } from '../types/iptv.ts';
import { dbService } from './db.ts';
import { validateStreamUrl, sanitizePath } from './security.ts';

export const PROFILES: Record<TranscodeProfile, ProfileConfig> = {
  original: {
    id: 'original',
    name: 'Direct / Original',
    description: 'Nguyên bản không chuyển mã (Direct Play)',
    resolution: 'Original',
    videoCodec: 'copy',
    audioCodec: 'copy',
    videoBitrate: 'original',
    audioBitrate: 'original',
    fps: 0,
    container: 'm3u8'
  },
  mobile: {
    id: 'mobile',
    name: 'Mobile 360p',
    description: '640x360 @ 25fps H.264/AAC - Tiết kiệm 4G/5G',
    resolution: '640x360',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    videoBitrate: '700k',
    audioBitrate: '80k',
    fps: 25,
    container: 'm3u8'
  },
  low: {
    id: 'low',
    name: 'Low 240p',
    description: '426x240 @ 20fps H.264 - Mạng yếu / Thiết bị cấu hình thấp',
    resolution: '426x240',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    videoBitrate: '400k',
    audioBitrate: '64k',
    fps: 20,
    container: 'm3u8'
  },
  legacy: {
    id: 'legacy',
    name: 'Legacy 240p (Baseline)',
    description: '320x240 @ 20fps H.264 Baseline Profile 1.3',
    resolution: '320x240',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    videoBitrate: '280k',
    audioBitrate: '48k',
    fps: 20,
    container: 'm3u8'
  },
  nokia_e72: {
    id: 'nokia_e72',
    name: 'Nokia E72 / Symbian S60',
    description: '320x240 @ 15fps H.264 Baseline 1.2 / AAC Mono - CorePlayer & RealPlayer',
    resolution: '320x240',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    videoBitrate: '200k',
    audioBitrate: '40k',
    fps: 15,
    container: 'ts'
  }
};

interface TranscodeSession {
  key: string; // `${channelId}:${profile}`
  channelId: string;
  channelName: string;
  profile: TranscodeProfile;
  process: ChildProcess;
  outputDir: string;
  hlsPlaylistPath: string;
  clients: number;
  startedAt: string;
  lastActive: number;
  idleTimer?: NodeJS.Timeout;
}

let ffmpegInstalledCached: boolean | null = null;

export async function checkFFmpegInstalled(): Promise<boolean> {
  if (ffmpegInstalledCached !== null) return ffmpegInstalledCached;
  return new Promise(resolve => {
    try {
      const proc = spawn(config.ffmpegPath, ['-version']);
      proc.on('error', () => {
        ffmpegInstalledCached = false;
        resolve(false);
      });
      proc.on('close', code => {
        ffmpegInstalledCached = code === 0;
        resolve(code === 0);
      });
    } catch {
      ffmpegInstalledCached = false;
      resolve(false);
    }
  });
}

class TranscodeManager {
  private sessions = new Map<string, TranscodeSession>();
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Periodic watchdog to kill inactive sessions
    this.checkInterval = setInterval(() => {
      this.cleanupInactiveSessions();
    }, 15000);
  }

  public getSessionKey(channelId: string, profile: TranscodeProfile): string {
    return `${sanitizePath(channelId)}:${profile}`;
  }

  public getActiveSessions(): TranscodeSessionInfo[] {
    const list: TranscodeSessionInfo[] = [];
    this.sessions.forEach(s => {
      list.push({
        sessionId: s.key,
        channelId: s.channelId,
        channelName: s.channelName,
        profile: s.profile,
        clients: s.clients,
        startedAt: s.startedAt,
        lastActive: new Date(s.lastActive).toISOString(),
        status: s.process && !s.process.killed ? 'running' : 'idle'
      });
    });
    return list;
  }

  public async startOrGetSession(
    channelId: string,
    profile: TranscodeProfile
  ): Promise<{ session: TranscodeSession; isNew: boolean; hlsUrl: string; tsStreamUrl: string }> {
    const key = this.getSessionKey(channelId, profile);
    const existing = this.sessions.get(key);

    if (existing && existing.process && !existing.process.killed) {
      existing.clients++;
      existing.lastActive = Date.now();
      logger.info(`Attached client to existing transcode session: ${key} (Total clients: ${existing.clients})`);
      return {
        session: existing,
        isNew: false,
        hlsUrl: `/api/transcode/hls/${sanitizePath(channelId)}/${profile}/index.m3u8`,
        tsStreamUrl: `/api/transcode/live/${sanitizePath(channelId)}/${profile}.ts`
      };
    }

    // Verify FFmpeg binary presence
    const hasFFmpeg = await checkFFmpegInstalled();
    if (!hasFFmpeg) {
      throw new Error(
        'Máy chủ chưa cài đặt FFmpeg binary (môi trường Serverless như Vercel không có sẵn FFmpeg). Hãy chọn chế độ "Direct / Original" hoặc triển khai bằng Docker trên Render.'
      );
    }

    // Check maximum sessions limit
    if (this.sessions.size >= config.maxTranscodeSessions) {
      // Try to clean up any 0-client sessions first
      this.cleanupInactiveSessions(true);
      if (this.sessions.size >= config.maxTranscodeSessions) {
        throw new Error(`Đạt giới hạn phiên chuyển mã tối đa (${config.maxTranscodeSessions}). Vui lòng thử lại sau.`);
      }
    }

    const channel = await dbService.getChannelById(channelId);
    if (!channel) {
      throw new Error(`Channel not found: ${channelId}`);
    }

    const validation = validateStreamUrl(channel.url);
    if (!validation.valid || !validation.parsedUrl) {
      throw new Error(`Invalid channel stream URL: ${validation.error}`);
    }

    const targetUrl = validation.parsedUrl.toString();
    const cleanChanId = sanitizePath(channelId);
    const sessionDir = path.join(config.transcodeDir, `${cleanChanId}_${profile}`);

    if (fs.existsSync(sessionDir)) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      } catch (e) {
        logger.warn(`Failed to clean old transcode dir: ${e}`);
      }
    }
    fs.mkdirSync(sessionDir, { recursive: true });

    const hlsPlaylistPath = path.join(sessionDir, 'index.m3u8');
    const segmentPattern = path.join(sessionDir, 'seg_%03d.ts');

    const profileConfig = PROFILES[profile] || PROFILES.mobile;
    const ffmpegArgs = this.buildFFmpegArgs(targetUrl, profileConfig, hlsPlaylistPath, segmentPattern);

    logger.info(`Starting FFmpeg transcode for channel "${channel.name}" [${profile}]`);
    logger.info(`FFmpeg args: ${ffmpegArgs.join(' ')}`);

    const child = spawn(config.ffmpegPath, ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stderr.on('data', data => {
      const line = data.toString();
      // Keep errors in logs if fatal
      if (line.includes('Error') || line.includes('Fatal') || line.includes('fail')) {
        logger.warn(`[FFmpeg ${profile}] ${line.substring(0, 200)}`);
      }
    });

    child.on('error', err => {
      logger.error(`FFmpeg process failed to spawn: ${err.message}`);
      this.stopSession(channelId, profile);
    });

    child.on('close', code => {
      logger.info(`FFmpeg process exited for ${key} with code ${code}`);
      this.sessions.delete(key);
    });

    const session: TranscodeSession = {
      key,
      channelId,
      channelName: channel.name,
      profile,
      process: child,
      outputDir: sessionDir,
      hlsPlaylistPath,
      clients: 1,
      startedAt: new Date().toISOString(),
      lastActive: Date.now()
    };

    this.sessions.set(key, session);

    // Wait up to 3.5 seconds for the first playlist or segment to appear
    await this.waitForHlsOutput(hlsPlaylistPath, 5000);

    return {
      session,
      isNew: true,
      hlsUrl: `/api/transcode/hls/${cleanChanId}/${profile}/index.m3u8`,
      tsStreamUrl: `/api/transcode/live/${cleanChanId}/${profile}.ts`
    };
  }

  private buildFFmpegArgs(
    inputUrl: string,
    p: ProfileConfig,
    hlsPlaylist: string,
    segmentPattern: string
  ): string[] {
    const args: string[] = [
      '-hide_banner',
      '-loglevel', 'warning',
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '-i', inputUrl
    ];

    if (p.id === 'original') {
      args.push(
        '-c', 'copy',
        '-f', 'hls',
        '-hls_time', '4',
        '-hls_list_size', '5',
        '-hls_flags', 'delete_segments+split_by_time',
        '-hls_segment_filename', segmentPattern,
        hlsPlaylist
      );
      return args;
    }

    if (p.id === 'nokia_e72') {
      // Extremely low complexity: H.264 Baseline profile Level 1.2 or 1.3
      // Resolution 320x240, 15fps, video bitrate ~180k, audio mono AAC 40k @ 22050Hz
      args.push(
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
        '-f', 'hls',
        '-hls_time', '3',
        '-hls_list_size', '4',
        '-hls_flags', 'delete_segments',
        '-hls_segment_filename', segmentPattern,
        hlsPlaylist
      );
      return args;
    }

    if (p.id === 'legacy') {
      args.push(
        '-vf', 'scale=320:240:force_original_aspect_ratio=decrease,pad=320:240:(ow-iw)/2:(oh-ih)/2,fps=20',
        '-c:v', 'libx264',
        '-profile:v', 'baseline',
        '-level', '1.3',
        '-preset', 'veryfast',
        '-b:v', p.videoBitrate,
        '-maxrate', '350k',
        '-bufsize', '600k',
        '-g', '40',
        '-c:a', 'aac',
        '-b:a', p.audioBitrate,
        '-ar', '32000',
        '-ac', '2',
        '-f', 'hls',
        '-hls_time', '3',
        '-hls_list_size', '5',
        '-hls_flags', 'delete_segments',
        '-hls_segment_filename', segmentPattern,
        hlsPlaylist
      );
      return args;
    }

    // Mobile / Low profiles
    args.push(
      '-vf', `scale=${p.resolution}:force_original_aspect_ratio=decrease,fps=${p.fps}`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-b:v', p.videoBitrate,
      '-maxrate', `${parseInt(p.videoBitrate) * 1.3}k`,
      '-bufsize', `${parseInt(p.videoBitrate) * 2}k`,
      '-g', `${p.fps * 2}`,
      '-c:a', 'aac',
      '-b:a', p.audioBitrate,
      '-ar', '44100',
      '-ac', '2',
      '-f', 'hls',
      '-hls_time', '4',
      '-hls_list_size', '5',
      '-hls_flags', 'delete_segments',
      '-hls_segment_filename', segmentPattern,
      hlsPlaylist
    );

    return args;
  }

  private async waitForHlsOutput(playlistPath: string, timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (fs.existsSync(playlistPath)) {
        try {
          const content = fs.readFileSync(playlistPath, 'utf8');
          // Check if at least one .ts segment exists
          if (content.includes('.ts')) {
            return true;
          }
        } catch {
          // Keep polling
        }
      }
      await new Promise(r => setTimeout(r, 300));
    }
    return false;
  }

  public touchSession(channelId: string, profile: TranscodeProfile) {
    const key = this.getSessionKey(channelId, profile);
    const session = this.sessions.get(key);
    if (session) {
      session.lastActive = Date.now();
    }
  }

  public releaseClient(channelId: string, profile: TranscodeProfile) {
    const key = this.getSessionKey(channelId, profile);
    const session = this.sessions.get(key);
    if (session) {
      session.clients = Math.max(0, session.clients - 1);
      session.lastActive = Date.now();
      logger.info(`Released client from session: ${key} (Remaining clients: ${session.clients})`);
    }
  }

  public stopSession(channelId: string, profile: TranscodeProfile): boolean {
    const key = this.getSessionKey(channelId, profile);
    const session = this.sessions.get(key);
    if (!session) return false;

    try {
      if (session.process && !session.process.killed) {
        session.process.kill('SIGTERM');
        setTimeout(() => {
          if (!session.process.killed) {
            session.process.kill('SIGKILL');
          }
        }, 2000);
      }
    } catch (e) {
      logger.warn(`Error killing process for ${key}: ${e}`);
    }

    try {
      if (fs.existsSync(session.outputDir)) {
        fs.rmSync(session.outputDir, { recursive: true, force: true });
      }
    } catch (e) {
      logger.warn(`Failed to clean output dir for ${key}: ${e}`);
    }

    this.sessions.delete(key);
    logger.info(`Transcode session terminated: ${key}`);
    return true;
  }

  public cleanupInactiveSessions(forceZeroClients = false) {
    const now = Date.now();
    const idleTimeoutMs = 60 * 1000; // 60 seconds idle

    this.sessions.forEach(session => {
      const isIdle = session.clients <= 0;
      const timeSinceActive = now - session.lastActive;

      if ((isIdle && timeSinceActive > idleTimeoutMs) || (forceZeroClients && isIdle)) {
        logger.info(`Auto-terminating idle transcode session: ${session.key} (Idle for ${Math.round(timeSinceActive / 1000)}s)`);
        this.stopSession(session.channelId, session.profile);
      }
    });
  }

  public getSessionOutputDir(channelId: string, profile: TranscodeProfile): string {
    const cleanChanId = sanitizePath(channelId);
    return path.join(config.transcodeDir, `${cleanChanId}_${profile}`);
  }
}

export const transcodeManager = new TranscodeManager();
