import React, { useState } from 'react';
import { X, Copy, Check, ExternalLink, Play, Smartphone, Monitor, ShieldAlert } from 'lucide-react';
import { ChannelWithEpg } from '../types/iptv.ts';

interface ExternalPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: ChannelWithEpg | null;
}

export const ExternalPlayerModal: React.FC<ExternalPlayerModalProps> = ({
  isOpen,
  onClose,
  channel
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen || !channel) return null;

  const origin = window.location.origin;
  const directOriginalUrl = channel.url;
  const proxyDirectUrl = `${origin}/api/proxy?url=${encodeURIComponent(channel.url)}`;
  const nokiaTsUrl = `${origin}/api/transcode/live/${channel.id}/nokia_e72.ts`;
  const mobileHlsUrl = `${origin}/api/transcode/hls/${channel.id}/mobile/index.m3u8`;
  const legacyWebUrl = `${origin}/legacy/channel/${channel.id}`;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    });
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-zinc-100">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
              <ExternalLink className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">Mở kênh qua Trình phát ngoài</h3>
              <p className="text-xs text-zinc-400 truncate max-w-xs">{channel.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* VLC / PotPlayer / MPV Direct */}
          <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                <Monitor className="w-4 h-4 text-emerald-400" />
                <span>1. Luồng gốc cho VLC / PotPlayer (PC & Mobile)</span>
              </div>
              <button
                onClick={() => copyToClipboard(proxyDirectUrl, 'vlc')}
                className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 hover:text-emerald-300"
              >
                {copiedKey === 'vlc' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === 'vlc' ? 'Đã copy' : 'Copy'}</span>
              </button>
            </div>
            <div className="p-2 rounded bg-black/80 font-mono text-[11px] text-zinc-300 break-all select-all border border-zinc-800">
              {proxyDirectUrl}
            </div>
            <p className="text-[11px] text-zinc-500">Mở VLC &gt; Media &gt; Open Network Stream &gt; Dán link này.</p>
          </div>

          {/* CorePlayer / Nokia E72 MPEG-TS Direct Stream */}
          <div className="p-3 rounded-xl bg-orange-950/30 border border-orange-900/60 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-300">
                <Smartphone className="w-4 h-4 text-orange-400" />
                <span>2. Luồng Nokia E72 & CorePlayer (320x240 @ 15fps TS)</span>
              </div>
              <button
                onClick={() => copyToClipboard(nokiaTsUrl, 'nokia')}
                className="flex items-center gap-1 text-[11px] font-medium text-orange-400 hover:text-orange-300"
              >
                {copiedKey === 'nokia' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === 'nokia' ? 'Đã copy' : 'Copy'}</span>
              </button>
            </div>
            <div className="p-2 rounded bg-black/80 font-mono text-[11px] text-orange-200 break-all select-all border border-orange-900/50">
              {nokiaTsUrl}
            </div>
            <p className="text-[11px] text-zinc-400">
              Chuyển mã bằng FFmpeg sang H.264 Baseline Level 1.2, AAC Mono cực nhẹ. Mở CorePlayer trên Symbian E72 và nhập URL này.
            </p>
          </div>

          {/* Direct Raw Original Stream */}
          <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
                <Play className="w-4 h-4 text-blue-400" />
                <span>3. URL Nguồn trực tiếp (Raw Provider URL)</span>
              </div>
              <button
                onClick={() => copyToClipboard(directOriginalUrl, 'raw')}
                className="flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300"
              >
                {copiedKey === 'raw' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === 'raw' ? 'Đã copy' : 'Copy'}</span>
              </button>
            </div>
            <div className="p-2 rounded bg-black/80 font-mono text-[11px] text-zinc-400 break-all select-all border border-zinc-800">
              {directOriginalUrl}
            </div>
          </div>

          {/* Mobile Web Legacy link */}
          <div className="text-center pt-2">
            <a
              href={legacyWebUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5 text-orange-400" />
              <span>Xem trang Giao diện Siêu nhẹ (/legacy)</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
