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
  PictureInPicture2,
  Sparkles
} from 'lucide-react';
import { ChannelWithEpg, TranscodeProfile } from '../types/iptv.ts';
import { apiUrl } from '../lib/api.ts';

export type StreamMode = 'direct' | 'proxy';

function getStoredStreamMode(): StreamMode {
  if (typeof window === 'undefined') return 'direct';
  try {
    const saved = localStorage.getItem('iptv_preferred_stream_mode');
    if (saved === 'direct' || saved === 'proxy') return saved;
  } catch {}
  return 'direct';
}

function saveStoredStreamMode(mode: StreamMode) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('iptv_preferred_stream_mode', mode);
  } catch {}
}

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

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showUnmuteNotice, setShowUnmuteNotice] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState<'16/9' | '4/3' | 'cover'>('16/9');

  const [selectedProfile, setSelectedProfile] = useState<TranscodeProfile>('original');
  const [streamMode, setStreamMode] = useState<StreamMode>(getStoredStreamMode);
  const [modeNotice, setModeNotice] = useState<string | null>(null);
  const [isTranscoding, setIsTranscoding] = useState<boolean>(false);
  const [transcodeHlsUrl, setTranscodeHlsUrl] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoadingStream, setIsLoadingStream] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);

  // Picture-in-Picture State
  const [isPipActive, setIsPipActive] = useState<boolean>(false);
  const [isPipSupported, setIsPipSupported] = useState<boolean>(false);

  // Screen Wake Lock & Auto-retry refs
  const wakeLockRef = useRef<any>(null);
  const retryCountRef = useRef<number>(0);
  const autoFallbackAttemptedRef = useRef<boolean>(false);
  const maxRetries = 3;

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setIsPipSupported(Boolean((document as any).pictureInPictureEnabled));
    }
  }, []);

  // Screen Wake Lock to prevent screen sleep while streaming
  const acquireWakeLock = async () => {
    try {
      if ('wakeLock' in navigator && (navigator as any).wakeLock) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch {}
  };

  const releaseWakeLock = async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch {}
  };

  useEffect(() => {
    if (isPlaying && channel) {
      acquireWakeLock();
    } else {
      releaseWakeLock();
    }
    return () => {
      releaseWakeLock();
    };
  }, [isPlaying, channel]);

  // Picture-in-Picture Toggle
  const togglePip = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if ((document as any).pictureInPictureElement) {
        await (document as any).exitPictureInPicture();
      } else if ((document as any).pictureInPictureEnabled) {
        await (video as any).requestPictureInPicture();
      }
    } catch (err) {
      console.warn('PiP error:', err);
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnterPip = () => setIsPipActive(true);
    const onLeavePip = () => setIsPipActive(false);
    video.addEventListener('enterpictureinpicture', onEnterPip);
    video.addEventListener('leavepictureinpicture', onLeavePip);
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnterPip);
      video.removeEventListener('leavepictureinpicture', onLeavePip);
    };
  }, []);

  // Stop previous HLS instance safely
  const destroyHls = () => {
    if (hlsRef.current) {
      try {
        hlsRef.current.stopLoad();
        hlsRef.current.detachMedia();
        hlsRef.current.destroy();
      } catch (e) {
        console.warn('HLS destroy warning:', e);
      }
      hlsRef.current = null;
    }
  };

  // Check if stream URL is a raw MPEG-TS (.ts) stream
  const isRawTsStream = (url: string): boolean => {
    const clean = url.split('?')[0].toLowerCase();
    return clean.endsWith('.ts') || clean.endsWith('.mpegts');
  };

  // Helper to resolve stream playback URL based on profile and streamMode
  const resolvePlaybackUrl = (streamUrl: string, mode: StreamMode, profile: TranscodeProfile): string => {
    if (profile !== 'original' && transcodeHlsUrl) {
      return apiUrl(transcodeHlsUrl);
    }
    if (mode === 'direct') {
      return streamUrl;
    }
    // Route through /api/proxy to rewrite M3U8 manifests and bypass CORS / Mixed Content
    return apiUrl(`/api/proxy?url=${encodeURIComponent(streamUrl)}`);
  };

  // Start FFmpeg remuxing or transcoding on the server
  const startTranscodeSession = async (profileToUse: TranscodeProfile, isAutoFallback = false) => {
    if (!channel) return;
    try {
      setIsLoadingStream(true);
      setIsTranscoding(true);
      setErrorMsg(
        isAutoFallback
          ? 'Luồng gốc cần chuyển gói tương thích. Đang khởi tạo bộ giải mã FFmpeg...'
          : null
      );

      const res = await fetch(apiUrl('/api/transcode/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: channel.id, profile: profileToUse })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Không thể khởi động chuyển mã FFmpeg');
      }

      setSelectedProfile(profileToUse);
      setTranscodeHlsUrl(data.hlsUrl);
      setErrorMsg(null);
      loadStreamInternal(data.hlsUrl, 'direct', profileToUse, true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Lỗi chuyển mã: ${msg}`);
      setIsLoadingStream(false);
      setIsTranscoding(false);
    }
  };

  // Handle switching transcode profile from UI buttons
  const handleProfileChange = async (newProfile: TranscodeProfile) => {
    if (!channel) return;
    setErrorMsg(null);

    if (newProfile === 'original' && !isRawTsStream(channel.url)) {
      setSelectedProfile('original');
      setIsTranscoding(false);
      setTranscodeHlsUrl(null);
      loadStreamInternal(channel.url, streamMode, 'original', false);
      return;
    }

    // Start FFmpeg session for this profile
    startTranscodeSession(newProfile, false);
  };

  // Switch playback mode explicitly (direct vs proxy) and remember preference
  const handleSwitchMode = (newMode: StreamMode) => {
    if (!channel) return;
    saveStoredStreamMode(newMode);
    setStreamMode(newMode);
    setSelectedProfile('original');
    setIsTranscoding(false);
    setTranscodeHlsUrl(null);
    autoFallbackAttemptedRef.current = false;
    setModeNotice(
      newMode === 'direct'
        ? 'Đã chuyển sang: URL Nguồn trực tiếp (Đã lưu mặc định)'
        : 'Đã chuyển sang: Proxy máy chủ (Đã lưu mặc định)'
    );
    setTimeout(() => setModeNotice(null), 3500);
    loadStreamInternal(channel.url, newMode, 'original', false);
  };

  // Main Stream Loader
  const loadStreamInternal = (
    url: string,
    mode: StreamMode,
    profile: TranscodeProfile = 'original',
    isDirectLocalUrl = false
  ) => {
    const video = videoRef.current;
    if (!video || !url) return;

    destroyHls();
    setErrorMsg(null);
    setIsLoadingStream(true);

    const streamSource = isDirectLocalUrl
      ? apiUrl(url)
      : resolvePlaybackUrl(url, mode, profile);

    // 1. Native HLS support (Safari on macOS / iOS)
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamSource;
      video
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsLoadingStream(false);
          setShowUnmuteNotice(false);
        })
        .catch(err => {
          console.warn('Native playback unmuted blocked, falling back to muted:', err);
          video.muted = true;
          setIsMuted(true);
          video
            .play()
            .then(() => {
              setIsPlaying(true);
              setIsLoadingStream(false);
              setShowUnmuteNotice(true);
            })
            .catch(() => {
              setIsLoadingStream(false);
            });
        });
      return;
    }

    // 2. HLS.js for modern desktop browsers (Chrome, Edge, Firefox, Brave)
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 60,
        manifestLoadingTimeOut: 12000,
        levelLoadingTimeOut: 12000,
        fragLoadingTimeOut: 15000,
        startLevel: -1
      });

      hlsRef.current = hls;
      hls.loadSource(streamSource);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoadingStream(false);
        retryCountRef.current = 0;
        setErrorMsg(null);

        // Attempt playback immediately
        video
          .play()
          .then(() => {
            setIsPlaying(true);
            setShowUnmuteNotice(false);
          })
          .catch(err => {
            console.warn('Autoplay unmuted blocked by browser policy. Falling back to muted play:', err);
            // Autoplay policy fallback: mute audio to allow instant live video playback on PC
            video.muted = true;
            setIsMuted(true);
            video
              .play()
              .then(() => {
                setIsPlaying(true);
                setShowUnmuteNotice(true);
              })
              .catch(() => {
                setIsPlaying(false);
              });
          });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.warn('HLS.js event:', data.type, data.details, data.fatal);

        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // Seamless Auto-Fallback between Direct and Proxy!
              if (!autoFallbackAttemptedRef.current && channel && !isDirectLocalUrl) {
                autoFallbackAttemptedRef.current = true;
                if (mode === 'direct') {
                  setModeNotice('Luồng trực tiếp cần vượt kiểm tra mạng (CORS). Đang tự động thử qua Proxy máy chủ...');
                  setTimeout(() => setModeNotice(null), 4000);
                  setStreamMode('proxy');
                  loadStreamInternal(channel.url, 'proxy', 'original', false);
                  return;
                } else if (mode === 'proxy') {
                  setModeNotice('Proxy máy chủ gặp sự cố mạng. Đang tự động thử bằng URL Nguồn trực tiếp...');
                  setTimeout(() => setModeNotice(null), 4000);
                  setStreamMode('direct');
                  loadStreamInternal(channel.url, 'direct', 'original', false);
                  return;
                }
              }

              if (retryCountRef.current < maxRetries) {
                retryCountRef.current += 1;
                const delay = retryCountRef.current * 1500;
                setErrorMsg(`Đang thử kết nối lại luồng lần ${retryCountRef.current}/${maxRetries}...`);
                setIsLoadingStream(true);
                setTimeout(() => {
                  if (hlsRef.current) {
                    hlsRef.current.startLoad();
                  }
                }, delay);
              } else if (!autoFallbackAttemptedRef.current && channel) {
                autoFallbackAttemptedRef.current = true;
                startTranscodeSession('original', true);
              } else {
                setErrorMsg('Không thể tải luồng phát sóng từ máy chủ gốc. Hãy thử bấm "URL Nguồn trực tiếp" hoặc "Proxy máy chủ" bên dưới.');
                setIsLoadingStream(false);
              }
              break;

            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('HLS media error, attempting recovery...');
              hls.recoverMediaError();
              break;

            default:
              if (!autoFallbackAttemptedRef.current && channel && !isDirectLocalUrl) {
                autoFallbackAttemptedRef.current = true;
                const alternateMode = mode === 'direct' ? 'proxy' : 'direct';
                setStreamMode(alternateMode);
                loadStreamInternal(channel.url, alternateMode, 'original', false);
              } else {
                setErrorMsg('Luồng stream cần chuyển mã để phát trên trình duyệt này. Nhấn nút "Chuyển mã FFmpeg" bên dưới.');
                destroyHls();
                setIsLoadingStream(false);
              }
              break;
          }
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
          video.muted = true;
          setIsMuted(true);
          video
            .play()
            .then(() => {
              setIsPlaying(true);
              setIsLoadingStream(false);
              setShowUnmuteNotice(true);
            })
            .catch(() => {
              setIsLoadingStream(false);
            });
        });
    }
  };

  // Public stream initializer for a channel
  const loadStream = (targetChannel: ChannelWithEpg, preferredMode?: StreamMode) => {
    autoFallbackAttemptedRef.current = false;
    retryCountRef.current = 0;
    setErrorMsg(null);

    const mode = preferredMode || streamMode;

    // If stream URL is raw MPEG-TS (.ts), modern browsers need HLS packaging
    if (isRawTsStream(targetChannel.url)) {
      startTranscodeSession('original', false);
      return;
    }

    setSelectedProfile('original');
    setIsTranscoding(false);
    setTranscodeHlsUrl(null);
    loadStreamInternal(targetChannel.url, mode, 'original', false);
  };

  // Re-load stream whenever active channel changes
  useEffect(() => {
    if (!channel) {
      destroyHls();
      setIsPlaying(false);
      return;
    }

    // Record watch history
    fetch(apiUrl(`/api/channels/${channel.id}/history`), { method: 'POST' }).catch(() => {});

    loadStream(channel, streamMode);

    return () => {
      destroyHls();
    };
  }, [channel?.id, channel?.url]);

  // Video control helpers: Robust toggle play
  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video || !channel) return;

    if (video.paused || !isPlaying) {
      setErrorMsg(null);

      // If video has no active stream or is errored out, reload the stream
      if (!hlsRef.current && !video.src) {
        loadStream(channel, streamMode);
        return;
      }

      try {
        await video.play();
        setIsPlaying(true);
      } catch (err) {
        console.warn('Playback blocked by browser autoplay policy, attempting muted play:', err);
        // Fallback: Mute and play immediately to satisfy browser gesture requirements
        video.muted = true;
        setIsMuted(true);
        try {
          await video.play();
          setIsPlaying(true);
          setShowUnmuteNotice(true);
        } catch (err2) {
          console.warn('Playback retry failed, re-initializing stream:', err2);
          loadStream(channel, streamMode);
        }
      }
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
    const muted = newVol === 0;
    video.muted = muted;
    setIsMuted(muted);
    if (!muted) {
      setShowUnmuteNotice(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !isMuted;
    video.muted = nextMuted;
    setIsMuted(nextMuted);
    if (!nextMuted) {
      setShowUnmuteNotice(false);
      if (volume === 0) {
        video.volume = 0.5;
        setVolume(0.5);
      }
    }
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
    loadStream(channel);
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
        className="relative bg-black w-full flex items-center justify-center overflow-hidden group select-none cursor-pointer"
        style={{
          aspectRatio: isFullscreen ? 'auto' : aspectRatio === '16/9' ? '16/9' : '4/3',
          maxHeight: '68vh'
        }}
        onClick={e => {
          // Toggle play when clicking the video area itself
          if ((e.target as HTMLElement).tagName.toLowerCase() === 'video') {
            togglePlay();
          }
        }}
      >
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          playsInline
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />

        {/* Live Badge (Top-left) */}
        {isPlaying && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/75 backdrop-blur-xs border border-zinc-800 text-[11px] font-bold text-rose-400 z-20 pointer-events-none shadow-md">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <span>TRỰC TIẾP (LIVE)</span>
          </div>
        )}

        {/* Unmute Toast Notice (Top-right) */}
        {showUnmuteNotice && isPlaying && (
          <button
            onClick={e => {
              e.stopPropagation();
              toggleMute();
            }}
            className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/90 hover:bg-emerald-900 border border-emerald-600/80 text-emerald-300 text-xs font-semibold z-25 shadow-xl transition-all cursor-pointer animate-in fade-in"
          >
            <VolumeX className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span>Đang tắt tiếng • Bấm để mở tiếng</span>
          </button>
        )}

        {/* Mode Switch Notice Pill (Top-center) */}
        {modeNotice && (
          <div className="absolute top-3 inset-x-0 mx-auto max-w-fit flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900/95 border border-zinc-700 text-zinc-200 text-xs font-medium z-25 shadow-xl transition-all animate-in fade-in pointer-events-none">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>{modeNotice}</span>
          </div>
        )}

        {/* Prominent Center Play Button when paused/idle */}
        {!isPlaying && !isLoadingStream && !errorMsg && (
          <div
            onClick={e => {
              e.stopPropagation();
              togglePlay();
            }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 hover:bg-black/35 transition-all z-15 cursor-pointer group/center"
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-emerald-600 group-hover/center:bg-emerald-500 text-white flex items-center justify-center shadow-2xl shadow-emerald-950 transition-all transform group-hover/center:scale-110">
              <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-white ml-1" />
            </div>
            <span className="mt-3 text-xs sm:text-sm font-semibold text-white bg-zinc-950/80 border border-zinc-700/80 px-3.5 py-1 rounded-full shadow-lg">
              Nhấn để phát trực tiếp
            </span>
          </div>
        )}

        {/* Loading Spinner Overlay */}
        {isLoadingStream && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center gap-2.5 pointer-events-none z-20">
            <div className="w-11 h-11 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-semibold text-emerald-300 drop-shadow-md">
              {isTranscoding ? 'FFmpeg đang chuyển mã luồng trực tiếp...' : 'Đang kết nối luồng stream...'}
            </span>
          </div>
        )}

        {/* Error Overlay with Auto/Manual FFmpeg Fallback */}
        {errorMsg && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-6 text-center z-25 space-y-3">
            <div className="w-12 h-12 rounded-full bg-rose-950/80 border border-rose-800 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="max-w-md">
              <h4 className="text-sm font-semibold text-rose-200">Không thể phát luồng trực tiếp</h4>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{errorMsg}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {streamMode !== 'direct' && (
                <button
                  onClick={() => handleSwitchMode('direct')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-lg shadow-emerald-950 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-white" /> Thử URL Nguồn trực tiếp
                </button>
              )}
              {streamMode !== 'proxy' && (
                <button
                  onClick={() => handleSwitchMode('proxy')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-lg shadow-blue-950 cursor-pointer"
                >
                  <Radio className="w-3.5 h-3.5" /> Thử Proxy máy chủ
                </button>
              )}
              <button
                onClick={handleRetryStream}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" /> Thử lại (Retry)
              </button>
              <button
                onClick={() => startTranscodeSession('original', false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white shadow-lg shadow-purple-950 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" /> Phát qua FFmpeg (Remux)
              </button>
              <button
                onClick={() => onOpenExternalModal(channel)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Mở bằng VLC
              </button>
            </div>
          </div>
        )}

        {/* Video Control Bar (Visible when paused or on hover when playing) */}
        <div
          onClick={e => e.stopPropagation()}
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-3 flex items-center justify-between transition-opacity z-20 ${
            !isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          {/* Play/Pause & Volume */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={togglePlay}
              className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md cursor-pointer"
              title={isPlaying ? 'Tạm dừng (Pause)' : 'Phát trực tiếp (Play)'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-white" />
              ) : (
                <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-white" />
              )}
            </button>

            <button
              onClick={toggleMute}
              className="p-1.5 rounded-lg text-white hover:text-emerald-400 hover:bg-white/10 transition-colors cursor-pointer"
              title={isMuted ? 'Mở tiếng' : 'Tắt tiếng'}
            >
              {isMuted ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5" />}
            </button>

            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : (volume ?? 1)}
              onChange={e => handleVolumeChange(parseFloat(e.target.value) || 0)}
              className="w-20 accent-emerald-500 cursor-pointer hidden sm:block"
            />
          </div>

          {/* Right Controls: Aspect Ratio, Reload & Fullscreen */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Aspect Ratio Toggle */}
            <button
              onClick={() => setAspectRatio(aspectRatio === '16/9' ? '4/3' : '16/9')}
              className="px-2 py-1 rounded text-[11px] font-semibold bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title="Tỉ lệ khung hình"
            >
              {aspectRatio}
            </button>

            <button
              onClick={handleRetryStream}
              className="p-1.5 rounded-lg text-white hover:text-emerald-400 hover:bg-white/10 transition-colors cursor-pointer"
              title="Làm mới luồng"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            {isPipSupported && (
              <button
                onClick={togglePip}
                className={`p-1.5 rounded-lg text-white hover:text-emerald-400 hover:bg-white/10 transition-colors cursor-pointer ${
                  isPipActive ? 'text-emerald-400 bg-white/10' : ''
                }`}
                title={isPipActive ? 'Đóng cửa sổ nổi (PiP)' : 'Mở cửa sổ nổi (Picture-in-Picture)'}
              >
                <PictureInPicture2 className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg text-white hover:text-emerald-400 hover:bg-white/10 transition-colors cursor-pointer"
              title={isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}
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
                {streamMode === 'direct' ? (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
                    URL Nguồn trực tiếp (Direct)
                  </span>
                ) : isTranscoding ? (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-purple-950 text-purple-300 border border-purple-800 font-semibold animate-pulse">
                    FFmpeg: {selectedProfile.toUpperCase()}
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-blue-950 text-blue-300 border border-blue-800 font-semibold">
                    Proxy HLS (Gzip Decoded)
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors cursor-pointer"
              title="Copy URL luồng stream"
            >
              {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedUrl ? 'Đã copy!' : 'Copy Stream URL'}</span>
            </button>

            <button
              onClick={() => onOpenExternalModal(channel)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 transition-colors cursor-pointer"
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
            <button
              onClick={() => handleSwitchMode('proxy')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                streamMode === 'proxy' && selectedProfile === 'original' && !isTranscoding
                  ? 'bg-blue-600 text-white border-blue-500 shadow-sm font-semibold'
                  : 'bg-zinc-800/80 text-zinc-300 border-zinc-700/80 hover:bg-zinc-700 hover:text-white'
              }`}
              title="Phát qua Proxy máy chủ (Tự động giải nén Gzip, vượt lỗi CORS & Mixed Content)"
            >
              Gốc (Proxy HLS)
            </button>

            <button
              onClick={() => handleSwitchMode('direct')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                streamMode === 'direct' && !isTranscoding
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm font-semibold'
                  : 'bg-zinc-800/80 text-zinc-300 border-zinc-700/80 hover:bg-zinc-700 hover:text-white'
              }`}
              title="Phát thẳng bằng URL nguồn trực tiếp của nhà đài (Không qua máy chủ)"
            >
              URL Nguồn trực tiếp (Raw Direct)
            </button>

            {[
              { id: 'mobile' as TranscodeProfile, label: 'Mobile 360p', desc: 'H.264/AAC 700k' },
              { id: 'low' as TranscodeProfile, label: 'Low 240p', desc: 'H.264 400k - Mạng yếu' },
              { id: 'nokia_e72' as TranscodeProfile, label: 'Nokia E72 (240p 15fps)', desc: 'Symbian S60 Baseline' }
            ].map(prof => {
              const isCurrent = streamMode !== 'direct' && selectedProfile === prof.id && isTranscoding;
              return (
                <button
                  key={prof.id}
                  onClick={() => handleProfileChange(prof.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                    isCurrent
                      ? 'bg-purple-600 text-white border-purple-500 shadow-sm font-semibold'
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
