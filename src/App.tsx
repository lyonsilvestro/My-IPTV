import React, { useEffect, useState, useCallback } from 'react';
import { Header } from './components/Header.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { ChannelList } from './components/ChannelList.tsx';
import { VideoPlayer } from './components/VideoPlayer.tsx';
import { PlaylistModal } from './components/PlaylistModal.tsx';
import { EpgModal } from './components/EpgModal.tsx';
import { AdminModal } from './components/AdminModal.tsx';
import { ExternalPlayerModal } from './components/ExternalPlayerModal.tsx';
import { LegacyGuideModal } from './components/LegacyGuideModal.tsx';
import { ChannelWithEpg, Playlist } from './types/iptv.ts';
import { apiUrl } from './lib/api.ts';
import { Tv, Menu, X } from 'lucide-react';

function getLocalFavoriteIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem('iptv_device_favorites');
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

function saveLocalFavoriteIds(favSet: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('iptv_device_favorites', JSON.stringify(Array.from(favSet)));
  } catch {}
}

export default function App() {
  const [activeView, setActiveView] = useState<'live' | 'favorites' | 'history'>('live');
  const [selectedGroup, setSelectedGroup] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [channels, setChannels] = useState<ChannelWithEpg[]>([]);
  const [groups, setGroups] = useState<{ name: string; count: number }[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activeChannel, setActiveChannel] = useState<ChannelWithEpg | null>(null);

  const [isLoadingChannels, setIsLoadingChannels] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState<boolean>(false);

  // Modals state
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState<boolean>(false);
  const [isEpgModalOpen, setIsEpgModalOpen] = useState<boolean>(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState<boolean>(false);
  const [isLegacyModalOpen, setIsLegacyModalOpen] = useState<boolean>(false);
  const [externalModalChannel, setExternalModalChannel] = useState<ChannelWithEpg | null>(null);

  // Fetch groups and playlists
  const fetchMetadata = useCallback(async () => {
    try {
      const [grpResp, plResp] = await Promise.all([
        fetch(apiUrl('/api/groups')),
        fetch(apiUrl('/api/playlists'))
      ]);
      if (grpResp.ok) setGroups(await grpResp.json());
      if (plResp.ok) setPlaylists(await plResp.json());
    } catch (err) {
      console.error('Failed to fetch metadata:', err);
    }
  }, []);

  // Fetch channels based on filter
  const fetchChannels = useCallback(async () => {
    try {
      setIsLoadingChannels(true);
      const localFavs = getLocalFavoriteIds();

      if (activeView === 'history') {
        const resp = await fetch(apiUrl('/api/history'));
        if (resp.ok) {
          const data: ChannelWithEpg[] = await resp.json();
          const enriched = data.map(ch => ({
            ...ch,
            isFavorite: localFavs.has(ch.id) || Boolean(ch.isFavorite)
          }));
          setChannels(enriched);
          if (!activeChannel && enriched.length > 0) {
            setActiveChannel(enriched[0]);
          }
        }
      } else {
        const params = new URLSearchParams();
        if (selectedGroup && selectedGroup !== 'All') {
          params.set('group', selectedGroup);
        }
        if (searchQuery.trim()) {
          params.set('search', searchQuery.trim());
        }
        params.set('limit', '500');

        const resp = await fetch(apiUrl(`/api/channels?${params.toString()}`));
        if (resp.ok) {
          const data = await resp.json();
          let rawChannels: ChannelWithEpg[] = data.channels || [];
          const enriched = rawChannels.map(ch => ({
            ...ch,
            isFavorite: localFavs.has(ch.id) || Boolean(ch.isFavorite)
          }));

          const filtered =
            activeView === 'favorites'
              ? enriched.filter(ch => ch.isFavorite)
              : enriched;

          setChannels(filtered);
          if (!activeChannel && filtered.length > 0) {
            setActiveChannel(filtered[0]);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch channels:', err);
    } finally {
      setIsLoadingChannels(false);
      setIsRefreshing(false);
    }
  }, [activeView, selectedGroup, searchQuery, activeChannel]);

  // Initial load
  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchMetadata(), fetchChannels()]);
  };

  const handleToggleFavorite = async (channelId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const localFavs = getLocalFavoriteIds();
    const nextIsFav = !localFavs.has(channelId);

    if (nextIsFav) {
      localFavs.add(channelId);
    } else {
      localFavs.delete(channelId);
    }
    saveLocalFavoriteIds(localFavs);

    // Update state immediately for zero-lag feedback
    setChannels(prev => {
      const updated = prev.map(ch =>
        ch.id === channelId ? { ...ch, isFavorite: nextIsFav } : ch
      );
      if (activeView === 'favorites') {
        return updated.filter(ch => ch.isFavorite);
      }
      return updated;
    });

    if (activeChannel?.id === channelId) {
      setActiveChannel(prev => (prev ? { ...prev, isFavorite: nextIsFav } : null));
    }

    // Also sync to server in background
    try {
      fetch(apiUrl(`/api/channels/${channelId}/favorite`), { method: 'POST' }).catch(() => {});
    } catch {}
  };

  const totalChannelsCount = groups.reduce((acc, curr) => acc + curr.count, 0);
  const favoritesCount = getLocalFavoriteIds().size;

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* Top Header */}
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeView={activeView}
        onViewChange={view => {
          setActiveView(view);
          if (view === 'favorites' || view === 'history') {
            setSelectedGroup('All');
          }
        }}
        onOpenPlaylistModal={() => setIsPlaylistModalOpen(true)}
        onOpenEpgModal={() => setIsEpgModalOpen(true)}
        onOpenLegacyModal={() => setIsLegacyModalOpen(true)}
        onOpenAdminModal={() => setIsAdminModalOpen(true)}
        onRefreshChannels={handleRefreshAll}
        isRefreshing={isRefreshing}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile Sidebar Toggle Button */}
        <button
          onClick={() => setIsSidebarOpenMobile(!isSidebarOpenMobile)}
          className="md:hidden absolute bottom-4 left-4 z-40 p-3 rounded-full bg-emerald-600 text-white shadow-xl shadow-black/50"
          title="Mở danh mục nhóm"
        >
          {isSidebarOpenMobile ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        {/* Left Column: Groups Sidebar */}
        <div
          className={`fixed inset-y-0 left-0 z-30 md:static md:z-auto transition-transform duration-300 md:translate-x-0 ${
            isSidebarOpenMobile ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Sidebar
            groups={groups}
            selectedGroup={selectedGroup}
            onSelectGroup={grp => {
              setSelectedGroup(grp);
              setActiveView('live');
              setIsSidebarOpenMobile(false);
            }}
            totalChannelsCount={totalChannelsCount}
            favoritesCount={favoritesCount}
          />
        </div>

        {/* Middle Column: Channel List */}
        <div className="w-full md:w-80 lg:w-96 flex flex-col border-r border-zinc-800 bg-zinc-900/60 overflow-hidden h-full flex-shrink-0">
          <div className="p-3 border-b border-zinc-800 flex items-center justify-between text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            <span className="truncate">
              {activeView === 'favorites'
                ? '⭐ Kênh yêu thích'
                : activeView === 'history'
                ? '🕒 Đã xem gần đây'
                : selectedGroup === 'All'
                ? 'Tất cả kênh'
                : selectedGroup}
            </span>
            <span className="text-[11px] text-zinc-500 font-mono">({channels.length})</span>
          </div>

          <ChannelList
            channels={channels}
            activeChannel={activeChannel}
            onSelectChannel={ch => setActiveChannel(ch)}
            onToggleFavorite={handleToggleFavorite}
            onOpenExternalModal={(ch, e) => {
              e.stopPropagation();
              setExternalModalChannel(ch);
            }}
            isLoading={isLoadingChannels}
          />
        </div>

        {/* Right / Large Column: Video Player */}
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-950">
          <VideoPlayer
            channel={activeChannel}
            onToggleFavorite={handleToggleFavorite}
            onOpenExternalModal={ch => setExternalModalChannel(ch)}
          />
        </main>
      </div>

      {/* Modals */}
      <PlaylistModal
        isOpen={isPlaylistModalOpen}
        onClose={() => setIsPlaylistModalOpen(false)}
        playlists={playlists}
        onRefreshPlaylists={fetchMetadata}
      />

      <EpgModal
        isOpen={isEpgModalOpen}
        onClose={() => setIsEpgModalOpen(false)}
        onRefreshChannels={handleRefreshAll}
      />

      <AdminModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
      />

      <ExternalPlayerModal
        isOpen={Boolean(externalModalChannel)}
        onClose={() => setExternalModalChannel(null)}
        channel={externalModalChannel}
      />

      <LegacyGuideModal
        isOpen={isLegacyModalOpen}
        onClose={() => setIsLegacyModalOpen(false)}
      />
    </div>
  );
}
