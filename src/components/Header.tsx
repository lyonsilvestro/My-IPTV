import React, { useEffect, useState } from 'react';
import {
  Tv,
  Search,
  Heart,
  Clock,
  ListPlus,
  Calendar,
  Smartphone,
  ShieldCheck,
  RefreshCw,
  Download,
  CheckCircle2
} from 'lucide-react';
import { InstallPromptModal } from './InstallPromptModal.tsx';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeView: 'live' | 'favorites' | 'history';
  onViewChange: (view: 'live' | 'favorites' | 'history') => void;
  onOpenPlaylistModal: () => void;
  onOpenEpgModal: () => void;
  onOpenLegacyModal: () => void;
  onOpenAdminModal: () => void;
  onRefreshChannels: () => void;
  isRefreshing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  activeView,
  onViewChange,
  onOpenPlaylistModal,
  onOpenEpgModal,
  onOpenLegacyModal,
  onOpenAdminModal,
  onRefreshChannels,
  isRefreshing
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [canInstall, setCanInstall] = useState<boolean>(false);
  const [showInstallModal, setShowInstallModal] = useState<boolean>(false);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      setIsStandalone(standalone);

      const handleBeforeInstallPrompt = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setCanInstall(true);
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      };
    }
  }, []);

  const handleOpenInstall = () => {
    setShowInstallModal(true);
  };

  return (
    <header className="bg-zinc-950 border-b border-zinc-800 text-zinc-100 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Brand / Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-900/40">
            <Tv className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-white">IPTV Streamer</span>
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                Transcode
              </span>
            </div>
            <p className="text-xs text-zinc-400 hidden sm:block">Web Player & Nokia E72 Transcoder</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-md min-w-[200px] relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery ?? ''}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Tìm kiếm kênh, nhóm hoặc TVG-ID..."
            className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg pl-9 pr-4 py-1.5 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 text-xs px-1"
            >
              ✕
            </button>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {/* Quick Filter: Favorites */}
          <button
            onClick={() => onViewChange(activeView === 'favorites' ? 'live' : 'favorites')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              activeView === 'favorites'
                ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800'
            }`}
            title="Kênh yêu thích"
          >
            <Heart className={`w-3.5 h-3.5 ${activeView === 'favorites' ? 'fill-rose-500 text-rose-500' : ''}`} />
            <span className="hidden md:inline">Yêu thích</span>
          </button>

          {/* Quick Filter: History */}
          <button
            onClick={() => onViewChange(activeView === 'history' ? 'live' : 'history')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              activeView === 'history'
                ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800'
            }`}
            title="Đã xem gần đây"
          >
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">Lịch sử</span>
          </button>

          {/* Manage Playlists */}
          <button
            onClick={onOpenPlaylistModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            <ListPlus className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Playlists</span>
          </button>

          {/* EPG Guide */}
          <button
            onClick={onOpenEpgModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800 hover:text-white transition-colors"
            title="Lịch phát sóng EPG"
          >
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">EPG</span>
          </button>

          {/* Legacy / Nokia E72 Mode */}
          <button
            onClick={onOpenLegacyModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-orange-950/60 text-orange-300 border border-orange-800/80 hover:bg-orange-900/80 transition-colors"
            title="Chế độ Nokia E72 / CorePlayer"
          >
            <Smartphone className="w-3.5 h-3.5 text-orange-400" />
            <span>Nokia E72</span>
          </button>

          {/* PWA Install Button */}
          {!isStandalone && (
            <button
              onClick={handleOpenInstall}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                canInstall
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-950'
                  : 'bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800 hover:text-white'
              }`}
              title="Cài đặt IPTV ra Màn hình chính (PWA)"
            >
              <Download className={`w-3.5 h-3.5 ${canInstall ? 'text-white' : 'text-emerald-400'}`} />
              <span className="hidden sm:inline">Cài đặt App</span>
            </button>
          )}

          {/* Admin Dashboard */}
          <button
            onClick={onOpenAdminModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800 hover:text-white transition-colors"
            title="Bảng điều khiển Admin & FFmpeg"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden md:inline">Admin</span>
          </button>

          {/* Refresh Channels button */}
          <button
            onClick={onRefreshChannels}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors"
            title="Làm mới danh sách kênh"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* PWA Install Guide Modal */}
      <InstallPromptModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
        deferredPrompt={deferredPrompt}
        onInstalled={() => {
          setCanInstall(false);
          setIsStandalone(true);
        }}
      />
    </header>
  );
};
