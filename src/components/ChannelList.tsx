import React, { useState, useEffect } from 'react';
import { Heart, Play, Radio, ExternalLink, ChevronDown } from 'lucide-react';
import { ChannelWithEpg } from '../types/iptv.ts';

interface ChannelListProps {
  channels: ChannelWithEpg[];
  activeChannel: ChannelWithEpg | null;
  onSelectChannel: (channel: ChannelWithEpg) => void;
  onToggleFavorite: (channelId: string, e: React.MouseEvent) => void;
  onOpenExternalModal: (channel: ChannelWithEpg, e: React.MouseEvent) => void;
  isLoading?: boolean;
}

const INITIAL_PAGE_SIZE = 60;
const PAGE_INCREMENT = 40;

export const ChannelList: React.FC<ChannelListProps> = ({
  channels,
  activeChannel,
  onSelectChannel,
  onToggleFavorite,
  onOpenExternalModal,
  isLoading
}) => {
  const [displayCount, setDisplayCount] = useState<number>(INITIAL_PAGE_SIZE);

  // Reset pagination window when channel source list changes
  useEffect(() => {
    setDisplayCount(INITIAL_PAGE_SIZE);
  }, [channels]);

  if (isLoading) {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center text-zinc-400 space-y-3">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs">Đang tải danh sách kênh...</p>
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="flex-1 p-8 flex flex-col items-center justify-center text-center text-zinc-400 space-y-3">
        <Radio className="w-12 h-12 text-zinc-600 mb-1" />
        <p className="text-sm font-medium text-zinc-300">Không tìm thấy kênh nào</p>
        <p className="text-xs text-zinc-500 max-w-xs">
          Thử tìm kiếm với từ khóa khác hoặc bấm nút Playlists ở thanh trên để thêm danh sách M3U/M3U8.
        </p>
      </div>
    );
  }

  const visibleChannels = channels.slice(0, displayCount);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 400) {
      if (displayCount < channels.length) {
        setDisplayCount(prev => Math.min(prev + PAGE_INCREMENT, channels.length));
      }
    }
  };

  return (
    <div
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-1.5 scrollbar-thin scrollbar-thumb-zinc-700 select-none"
    >
      {visibleChannels.map(channel => {
        const isActive = activeChannel?.id === channel.id;
        return (
          <div
            key={channel.id}
            onClick={() => onSelectChannel(channel)}
            className={`group relative flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
              isActive
                ? 'bg-emerald-950/70 border-emerald-600/80 shadow-md shadow-emerald-950/40 text-white'
                : 'bg-zinc-900/70 border-zinc-800/80 hover:bg-zinc-800/70 text-zinc-200 hover:border-zinc-700'
            }`}
          >
            {/* Left: Logo & Info */}
            <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
              {/* Channel Logo */}
              <div className="w-11 h-11 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0 relative">
                {channel.logo ? (
                  <img
                    src={channel.logo}
                    alt={channel.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-contain p-1"
                    onError={e => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : null}
                <span className="text-xs font-bold text-zinc-400 uppercase select-none">
                  {channel.name.substring(0, 2)}
                </span>

                {isActive && (
                  <div className="absolute inset-0 bg-emerald-600/20 backdrop-blur-[1px] flex items-center justify-center">
                    <Play className="w-4 h-4 text-emerald-400 fill-emerald-400 animate-pulse" />
                  </div>
                )}
              </div>

              {/* Title & EPG / Group */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs sm:text-sm font-semibold truncate leading-tight">{channel.name}</h4>
                  {channel.group && (
                    <span className="hidden sm:inline-block text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 flex-shrink-0 truncate max-w-[100px]">
                      {channel.group}
                    </span>
                  )}
                </div>

                {/* EPG Info (Now Playing) */}
                <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                  {channel.nowPlaying ? (
                    <span className="text-emerald-400 truncate flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block flex-shrink-0" />
                      <span className="truncate">{channel.nowPlaying.title}</span>
                    </span>
                  ) : (
                    <span className="text-zinc-500 truncate">{channel.group || 'Live TV'}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Touch Friendly Action Buttons */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Favorite Button (Minimum 44px hit-box on mobile) */}
              <button
                onClick={e => onToggleFavorite(channel.id, e)}
                className={`p-2.5 sm:p-1.5 rounded-lg transition-colors cursor-pointer ${
                  channel.isFavorite
                    ? 'text-rose-500 hover:text-rose-400'
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
                title={channel.isFavorite ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}
              >
                <Heart className={`w-4 h-4 ${channel.isFavorite ? 'fill-rose-500' : ''}`} />
              </button>

              {/* External / VLC / E72 Button */}
              <button
                onClick={e => onOpenExternalModal(channel, e)}
                className="p-2.5 sm:p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Mở ngoài (VLC, Nokia E72, CorePlayer)"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}

      {/* Infinite Scroll Indicator & Load More */}
      {displayCount < channels.length && (
        <div className="p-3 text-center">
          <button
            onClick={() => setDisplayCount(prev => Math.min(prev + PAGE_INCREMENT, channels.length))}
            className="w-full py-2 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 flex items-center justify-center gap-1.5 transition-colors"
          >
            <span>Đang hiển thị {displayCount} / {channels.length} kênh (Bấm hoặc Cuộn để xem tiếp)</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
