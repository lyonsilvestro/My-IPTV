export interface Channel {
  id: string;
  playlistId: string;
  name: string;
  logo: string;
  group: string;
  url: string;
  tvgId: string;
  tvgName: string;
  orderIndex?: number;
  isFavorite?: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  url?: string;
  type: 'url' | 'upload';
  channelCount: number;
  isActive: boolean;
  lastUpdated: string;
  createdAt: string;
}

export interface EpgProgram {
  id: string;
  channelTvgId: string;
  title: string;
  description: string;
  start: string; // ISO string
  stop: string;  // ISO string
}

export interface ChannelWithEpg extends Channel {
  nowPlaying?: EpgProgram | null;
  nextPlaying?: EpgProgram | null;
}

export interface TranscodeSessionInfo {
  sessionId: string;
  channelId: string;
  channelName: string;
  profile: TranscodeProfile;
  clients: number;
  startedAt: string;
  lastActive: string;
  fps?: number;
  status: 'running' | 'idle' | 'error';
}

export type TranscodeProfile = 'original' | 'mobile' | 'low' | 'legacy' | 'nokia_e72';

export interface ProfileConfig {
  id: TranscodeProfile;
  name: string;
  description: string;
  resolution: string;
  videoCodec: string;
  audioCodec: string;
  videoBitrate: string;
  audioBitrate: string;
  fps: number;
  container: 'm3u8' | 'ts' | 'mp4';
}

export interface ServerMetrics {
  cpuUsage: number;
  totalMemoryMb: number;
  freeMemoryMb: number;
  usedMemoryMb: number;
  uptimeSeconds: number;
  nodeVersion: string;
  activeTranscodeSessions: number;
  totalPlaylists: number;
  totalChannels: number;
  ffmpegAvailable: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  context?: Record<string, unknown>;
}
