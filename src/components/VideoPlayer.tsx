import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RotateCw,
  Copy,
  Check,
  AlertTriangle,
  Sliders,
  ExternalLink,
  Heart,
  Radio,
  Clock,
  Layers
} from 'lucide-react';
import { ChannelWithEpg, TranscodeProfile } from '../types/iptv.ts';
import { apiUrl } from '../lib/api.ts';

interface VideoPlayerProps {
  channel: ChannelWithEpg | null;
  onToggleFavorite: (channelId: string) => void;
  onOpenExternalModal: (channel: ChannelWithEpg) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  channel,
  onToggleFavorite,
  onOpenExternalModal
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState<'16/9' | '4/3' | 'cover'>('16/9');

  const [selectedProfile, setSelectedProfile] = useState<TranscodeProfile>('original');
  const [isTranscoding, setIsTranscoding] = useState<boolean>(false);
  const [transcodeHlsUrl, setTranscodeHlsUrl] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoadingStream, setIsLoadingStream] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);

  // Stop previous HLS instance safely
  const destroyHls = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  };

  // Helper to resolve stream playback URL based on profile
  const resolvePlaybackUrl = (streamUrl: string, profile: TranscodeProfile): string => {
    if (profile !== 'original' && transcodeHlsUrl) {
      return apiUrl(transcodeHlsUrl);
    }
    // If original direct stream is an external HTTP/HTTPS .m3u8, we proxy through /api/proxy to bypass CORS
    return apiUrl(`/api/proxy?url=${encodeURIComponent(streamUrl)}`);
  };

  // Handle switching transcode profile
  const handleProfileChange = async (newProfile: TranscodeProfile) => {
    if (!channel) return;
    setSelectedProfile(newProfile);
    setErrorMsg(null);

    if (newProfile === 'original') {
      setIsTranscoding(false);
      setTranscodeHlsUrl(null);
      // Reload direct stream
      loadStream(channel.url, 'original');
      return;
    }

    try {
      setIsLoadingStream(true);
      setIsTranscoding(true);
      const res = await fetch(apiUrl('/api/transcode/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: channel.id, profile: newProfile })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start transcoding');
      }
      setTranscodeHlsUrl(data.hlsUrl);
      loadStream(data.hlsUrl, newProfile, true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Lỗi chuyển mã FFmpeg: ${msg}`);
      setIsLoadingStream(false);
    }
  };

  // Main Stream Loader
  const loadStream = (url: string, profile: TranscodeProfile, isDirectLocalUrl = false) => {
    const video = videoRef.current;
    if (!video || !url) return;

    destroyHls();
    setErrorMsg(null);
    setIsLoadingStream(true);

    const streamSource = isDirectLocalUrl ? url : resolvePlaybackUrl(url, profile);

    // 1. Native HLS support (Safari, iOS, Mac)
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamSource;
      video
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsLoadingStream(false);
        })
        .catch(err => {
          console.warn('Native playback error:', err);
          setIsLoadingStream(false);
        });
      return;
    }

    // 2. HLS.js for Chrome, Firefox, Edge, Android
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 60,
        manifestLoadingTimeOut: 10000,
        levelLoadingTimeOut: 10000
      });

      hlsRef.current = hls;
      hls.loadSource(streamSource);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoadingStream(false);
        video
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => setIsPlaying(false));
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.warn('HLS.js event error:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (data.response?.code === 502 || data.response?.code === 404) {
                setErrorMsg('Luồng stream tạm thời ngoại tuyến hoặc không phản hồi từ máy chủ nguồn. Bạn có thể thử chuyển mã hoặc chọn kênh khác.');
              } else {
                setErrorMsg('Lỗi kết nối mạng đến luồng phát (Network Error).');
                hls.startLoad();
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setErrorMsg('Lỗi giải mã đa phương tiện (Media Error). Đang thử phục hồi...');
              hls.recoverMediaError();
              break;
            default:
              setErrorMsg('Không thể phát luồng này trực tiếp (Manifest Load Error). Bạn có thể thử chuyển mã FFmpeg hoặc mở bằng VLC.');
              destroyHls();
              break;
          }
          setIsLoadingStream(false);
        }
      });
    } else {
      // Direct video tag fallback
      video.src = streamSource;
      video
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsLoadingStream(false);
        })
        .catch(() => {
          setErrorMsg('Trình duyệt của bạn không hỗ trợ định dạng stream này.');
          setIsLoadingStream(false);
        });
    }
  };

  // Re-load stream when channel changes
  useEffect(() => {
    if (!channel) {
      destroyHls();
      return;
    }

    // Record watch history
    fetch(apiUrl(`/api/channels/${channel.id}/history`), { method: 'POST' }).catch(() => {});

    // Reset to original profile on channel switch
    setSelectedProfile('original');
    setIsTranscoding(false);
    setTranscodeHlsUrl(null);
    loadStream(channel.url, 'original');

    return () => {
      destroyHls();
    };
  }, [channel?.id, channel?.url]);

  // Video control helpers
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleVolumeChange = (newVol: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = newVol;
    setVolume(newVol);
    setIsMuted(newVol === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !isMuted;
    video.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const toggleFullscreen = () => {
    const container = document.getElementById('player-container');
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleCopyStreamUrl = () => {
    if (!channel) return;
    const streamToCopy =
      selectedProfile === 'original'
        ? channel.url
        : `${window.location.origin}/api/transcode/live/${channel.id}/${selectedProfile}.ts`;

    navigator.clipboard.writeText(streamToCopy).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    });
  };

  const handleRetryStream = () => {
    if (!channel) return;
    handleProfileChange(selectedProfile);
  };

  if (!channel) {
    return (
      <div className="flex-1 bg-zinc-950 flex flex-col items-center justify-center p-8 text-center border-l border-zinc-800">
        <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 shadow-xl">
          <Radio className="w-8 h-8 text-emerald-500 animate-pulse" />
        </div>
        <h3 className="text-base font-semibold text-zinc-200">Chọn một kênh để bắt đầu xem</h3>
        <p className="text-xs text-zinc-500 max-w-sm mt-1">
          Hỗ trợ luồng HLS trực tiếp, giải mã bằng FFmpeg trên máy chủ và chế độ siêu nhẹ cho Nokia E72.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-zinc-950 flex flex-col h-full overflow-y-auto border-l border-zinc-800">
      {/* Video Container */}
      <div
        id="player-container"
        className="relative bg-black w-full flex items-center justify-center overflow-hidden group select-none"
        style={{ aspectRatio: isFullscreen ? 'auto' : aspectRatio === '16/9' ? '16/9' : '4/3', maxHeight: '68vh' }}
      >
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          playsInline
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />

        {/* Loading Spinner Overlay */}
        {isLoadingStream && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center gap-2 pointer-events-none z-10">
            <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-medium text-emerald-300">
              {isTranscoding ? 'FFmpeg đang chuyển mã luồng...' : 'Đang kết nối luồng stream...'}
            </span>
          </div>
        )}

        {/* Error Overlay with One-Click Transcode Fallback */}
        {errorMsg && (
          <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-6 text-center z-20 space-y-3">
            <div className="w-12 h-12 rounded-full bg-rose-950/80 border border-rose-800 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="max-w-md">
              <h4 className="text-sm font-semibold text-rose-200">Luồng không thể phát trực tiếp</h4>
              <p className="text-xs text-zinc-400 mt-1">{errorMsg}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                onClick={handleRetryStream}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200"
              >
                <RotateCw className="w-3.5 h-3.5" /> Thử lại (Retry)
              </button>
              {selectedProfile === 'original' && (
                <button
                  onClick={() => handleProfileChange('mobile')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white shadow-lg shadow-emerald-950"
                >
                  <Sliders className="w-3.5 h-3.5" /> Thử chuyển mã FFmpeg (Mobile 360p)
                </button>
              )}
              <button
                onClick={() => onOpenExternalModal(channel)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Mở bằng VLC
              </button>
            </div>
          </div>
        )}

        {/* Video Control Bar (Overlay on hover or when paused) */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity z-15">
          {/* Play/Pause & Volume */}
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="p-1.5 rounded-lg text-white hover:text-emerald-400 hover:bg-white/10 transition-colors"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-white" />}
            </button>

            <button
              onClick={toggleMute}
              className="p-1.5 rounded-lg text-white hover:text-emerald-400 hover:bg-white/10 transition-colors"
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>

            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={e => handleVolumeChange(parseFloat(e.target.value))}
              className="w-20 accent-emerald-500 cursor-pointer hidden sm:block"
            />
          </div>

          {/* Right Controls: Aspect Ratio, Reload & Fullscreen */}
          <div className="flex items-center gap-2">
            {/* Aspect Ratio Toggle */}
            <button
              onClick={() => setAspectRatio(aspectRatio === '16/9' ? '4/3' : '16/9')}
              className="px-2 py-1 rounded text-[11px] font-semibold bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Tỉ lệ khung hình"
            >
              {aspectRatio}
            </button>

            <button
              onClick={handleRetryStream}
              className="p-1.5 rounded-lg text-white hover:text-emerald-400 hover:bg-white/10 transition-colors"
              title="Làm mới luồng"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg text-white hover:text-emerald-400 hover:bg-white/10 transition-colors"
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Channel Information & Controls Strip */}
      <div className="p-4 bg-zinc-900/90 border-b border-zinc-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Channel Name & Logo */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
              {channel.logo ? (
                <img
                  src={channel.logo}
                  alt={channel.name}
                  className="w-full h-full object-contain p-1"
                  onError={e => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : null}
              <span className="text-sm font-bold text-zinc-400 uppercase select-none">
                {channel.name.substring(0, 2)}
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-white truncate">{channel.name}</h2>
                <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700">
                  {channel.group || 'Chung'}
                </span>
                {isTranscoding && (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-purple-950 text-purple-300 border border-purple-800 font-semibold animate-pulse">
                    FFmpeg: {selectedProfile.toUpperCase()}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 truncate mt-0.5">
                {channel.tvgId ? `TVG-ID: ${channel.tvgId}` : 'Luồng trực tiếp (Live Stream)'}
              </p>
            </div>
          </div>

          {/* Action Buttons: Favorite, Copy, External Player */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onToggleFavorite(channel.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                channel.isFavorite
                  ? 'bg-rose-950 text-rose-300 border-rose-800'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${channel.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
              <span>{channel.isFavorite ? 'Đã yêu thích' : 'Yêu thích'}</span>
            </button>

            <button
              onClick={handleCopyStreamUrl}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors"
              title="Copy URL luồng stream"
            >
              {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedUrl ? 'Đã copy!' : 'Copy Stream URL'}</span>
            </button>

            <button
              onClick={() => onOpenExternalModal(channel)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Mở ngoài (VLC/E72)</span>
            </button>
          </div>
        </div>

        {/* Transcode Profile Selector */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-800/80">
          <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-emerald-400" /> Chế độ phát & Chuyển mã:
          </span>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'original' as TranscodeProfile, label: 'Gốc (Direct / Original)', desc: 'Không chuyển mã' },
              { id: 'mobile' as TranscodeProfile, label: 'Mobile 360p', desc: 'H.264/AAC 700k' },
              { id: 'low' as TranscodeProfile, label: 'Low 240p', desc: 'H.264 400k - Mạng yếu' },
              { id: 'nokia_e72' as TranscodeProfile, label: 'Nokia E72 (240p 15fps)', desc: 'Symbian S60 Baseline' }
            ].map(prof => {
              const isCurrent = selectedProfile === prof.id;
              return (
                <button
                  key={prof.id}
                  onClick={() => handleProfileChange(prof.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                    isCurrent
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                      : 'bg-zinc-800/80 text-zinc-300 border-zinc-700/80 hover:bg-zinc-700 hover:text-white'
                  }`}
                  title={prof.desc}
                >
                  {prof.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* EPG Timeline Card */}
        {(channel.nowPlaying || channel.nextPlaying) && (
          <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800 flex flex-col sm:flex-row gap-3">
            {channel.nowPlaying && (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 uppercase tracking-wide">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Đang phát (Now)</span>
                </div>
                <h4 className="text-xs sm:text-sm font-semibold text-zinc-100 truncate mt-0.5">
                  {channel.nowPlaying.title}
                </h4>
                {channel.nowPlaying.description && (
                  <p className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5">
                    {channel.nowPlaying.description}
                  </p>
                )}
              </div>
            )}

            {channel.nextPlaying && (
              <div className="flex-1 min-w-0 border-t sm:border-t-0 sm:border-l border-zinc-800 pt-2 sm:pt-0 sm:pl-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Tiếp theo (Next)</span>
                </div>
                <h4 className="text-xs sm:text-sm font-medium text-zinc-300 truncate mt-0.5">
                  {channel.nextPlaying.title}
                </h4>
                {channel.nextPlaying.description && (
                  <p className="text-[11px] text-zinc-500 line-clamp-2 mt-0.5">
                    {channel.nextPlaying.description}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
