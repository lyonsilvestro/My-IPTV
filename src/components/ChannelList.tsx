import React from 'react';
import { Heart, Play, Radio, ExternalLink } from 'lucide-react';
import { ChannelWithEpg } from '../types/iptv.ts';

interface ChannelListProps {
  channels: ChannelWithEpg[];
  activeChannel: ChannelWithEpg | null;
  onSelectChannel: (channel: ChannelWithEpg) => void;
  onToggleFavorite: (channelId: string, e: React.MouseEvent) => void;
  onOpenExternalModal: (channel: ChannelWithEpg, e: React.MouseEvent) => void;
  isLoading?: boolean;
}

export const ChannelList: React.FC<ChannelListProps> = ({
  channels,
  activeChannel,
  onSelectChannel,
  onToggleFavorite,
  onOpenExternalModal,
  isLoading
}) => {
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

  return (
    <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-1.5 scrollbar-thin scrollbar-thumb-zinc-700">
      {channels.map(channel => {
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
                    className="w-full h-full object-contain p-1"
                    onError={e => {
                      // Hide failed image and display initials fallback
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : null}
                {/* Fallback initials if image fails or missing */}
                <span className="text-xs font-bold text-zinc-400 uppercase select-none">
                  {channel.name.substring(0, 2)}
                </span>

                {isActive && (
                  <div className="absolute inset-0 bg-emerald-600/20 backdrop-blur-[1px] flex items-center justify-center">
                    <Play className="w-4 h-4 text-emerald-400 fill-emerald-400 animate-pulse" />
                  </div>
                )}
              </div>

              {/* Title & Group & EPG */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs sm:text-sm font-semibold truncate leading-tight">{channel.name}</h4>
                  <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60 flex-shrink-0">
                    {channel.group || 'Chung'}
                  </span>
                </div>

                {/* EPG Now playing indicator */}
                {channel.nowPlaying ? (
                  <div className="text-[11px] text-amber-300 truncate mt-0.5 flex items-center gap-1 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                    <span className="truncate">Đang phát: {channel.nowPlaying.title}</span>
                  </div>
                ) : (
                  <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                    {channel.tvgId ? `ID: ${channel.tvgId}` : 'Luồng trực tiếp (Live)'}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* External link / Nokia helper button */}
              <button
                onClick={e => onOpenExternalModal(channel, e)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                title="Mở trong VLC / CorePlayer / Nokia E72"
              >
                <ExternalLink className="w-4 h-4" />
              </button>

              {/* Favorite Button */}
              <button
                onClick={e => onToggleFavorite(channel.id, e)}
                className={`p-1.5 rounded-lg transition-colors ${
                  channel.isFavorite
                    ? 'text-rose-500 hover:text-rose-400'
                    : 'text-zinc-500 hover:text-rose-400 hover:bg-zinc-800'
                }`}
                title={channel.isFavorite ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}
              >
                <Heart className={`w-4 h-4 ${channel.isFavorite ? 'fill-rose-500' : ''}`} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
