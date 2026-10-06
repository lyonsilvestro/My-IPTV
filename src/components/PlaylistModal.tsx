import React, { useState } from 'react';
import { X, Plus, Upload, Link, RefreshCw, Trash2, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
import { Playlist } from '../types/iptv.ts';
import { apiUrl } from '../lib/api.ts';

interface PlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlists: Playlist[];
  onRefreshPlaylists: () => void;
  onSelectPlaylist?: (playlistId: string) => void;
}

export const PlaylistModal: React.FC<PlaylistModalProps> = ({
  isOpen,
  onClose,
  playlists,
  onRefreshPlaylists
}) => {
  const [activeTab, setActiveTab] = useState<'url' | 'upload'>('url');
  const [playlistName, setPlaylistName] = useState('');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistName.trim() || !playlistUrl.trim()) {
      setErrorMsg('Vui lòng nhập tên playlist và URL M3U.');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const resp = await fetch(apiUrl('/api/playlists'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playlistName.trim(), url: playlistUrl.trim() })
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to import playlist');
      }

      setSuccessMsg(`Thành công! Đã thêm ${data.channelCount} kênh.`);
      setPlaylistName('');
      setPlaylistUrl('');
      onRefreshPlaylists();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('Vui lòng chọn file .m3u hoặc .m3u8.');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('name', playlistName.trim() || selectedFile.name);

      const resp = await fetch(apiUrl('/api/playlists/upload'), {
        method: 'POST',
        body: formData
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to upload playlist');
      }

      setSuccessMsg(`Tải lên thành công! Đã thêm ${data.channelCount} kênh.`);
      setPlaylistName('');
      setSelectedFile(null);
      onRefreshPlaylists();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async (playlistId: string) => {
    try {
      setRefreshingId(playlistId);
      setErrorMsg(null);
      const resp = await fetch(apiUrl(`/api/playlists/${playlistId}/refresh`), { method: 'POST' });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to refresh playlist');
      }
      setSuccessMsg(`Đã cập nhật playlist! Tổng ${data.channelCount} kênh.`);
      onRefreshPlaylists();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setRefreshingId(null);
    }
  };

  const handleToggleActive = async (playlistId: string) => {
    try {
      await fetch(apiUrl(`/api/playlists/${playlistId}/toggle`), { method: 'POST' });
      onRefreshPlaylists();
    } catch (err: unknown) {
      console.error('Failed to toggle playlist:', err);
    }
  };

  const handleDelete = async (playlistId: string, name: string) => {
    if (!confirm(`Bạn có chắc muốn xóa playlist "${name}" không?`)) return;
    try {
      await fetch(apiUrl(`/api/playlists/${playlistId}`), { method: 'DELETE' });
      onRefreshPlaylists();
    } catch (err: unknown) {
      console.error('Failed to delete playlist:', err);
    }
  };

  // Preset demo legal channels button
  const handleLoadPreset = (name: string, url: string) => {
    setPlaylistName(name);
    setPlaylistUrl(url);
    setActiveTab('url');
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-zinc-100">
        {/* Modal Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">Quản lý Playlist IPTV</h3>
              <p className="text-xs text-zinc-400">Thêm nguồn M3U/M3U8 hợp pháp hoặc tải file từ máy</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Notifications */}
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Tab Switcher */}
          <div className="flex rounded-lg bg-zinc-950 p-1 border border-zinc-800">
            <button
              onClick={() => setActiveTab('url')}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === 'url' ? 'bg-emerald-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Link className="w-3.5 h-3.5" /> Thêm qua URL
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === 'upload' ? 'bg-emerald-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5" /> Upload File .m3u
            </button>
          </div>

          {/* Add via URL Form */}
          {activeTab === 'url' ? (
            <form onSubmit={handleAddUrl} className="space-y-3 bg-zinc-950/50 p-3.5 rounded-xl border border-zinc-800">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Tên Playlist</label>
                <input
                  type="text"
                  value={playlistName}
                  onChange={e => setPlaylistName(e.target.value)}
                  placeholder="Ví dụ: Kênh Tin Tức Quốc Tế"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">URL M3U / M3U8</label>
                <input
                  type="url"
                  value={playlistUrl}
                  onChange={e => setPlaylistUrl(e.target.value)}
                  placeholder="https://example.com/playlist.m3u"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Sample Presets */}
              <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-zinc-300">Gợi ý mẫu hợp pháp:</span>
                <button
                  type="button"
                  onClick={() =>
                    handleLoadPreset(
                      'Free News Streams (IPTV-org)',
                      'https://iptv-org.github.io/iptv/categories/news.m3u'
                    )
                  }
                  className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border border-zinc-700"
                >
                  News Free-To-Air
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleLoadPreset(
                      'Free Sports Streams',
                      'https://iptv-org.github.io/iptv/categories/sports.m3u'
                    )
                  }
                  className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border border-zinc-700"
                >
                  Sports Free-To-Air
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950 transition-colors disabled:opacity-50"
              >
                {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {isLoading ? 'Đang phân tích & lưu trữ...' : 'Thêm Playlist'}
              </button>
            </form>
          ) : (
            /* Upload File Form */
            <form onSubmit={handleUploadFile} className="space-y-3 bg-zinc-950/50 p-3.5 rounded-xl border border-zinc-800">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Tên Playlist</label>
                <input
                  type="text"
                  value={playlistName}
                  onChange={e => setPlaylistName(e.target.value)}
                  placeholder="Đặt tên cho danh sách..."
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Chọn file .m3u / .m3u8</label>
                <input
                  type="file"
                  accept=".m3u,.m3u8,text/plain"
                  onChange={e => {
                    const f = e.target.files?.[0] || null;
                    setSelectedFile(f);
                    if (f && !playlistName) {
                      setPlaylistName(f.name.replace(/\.[^/.]+$/, ''));
                    }
                  }}
                  className="w-full text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700 cursor-pointer"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || !selectedFile}
                className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950 transition-colors disabled:opacity-50"
              >
                {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {isLoading ? 'Đang tải lên...' : 'Tải lên File Playlist'}
              </button>
            </form>
          )}

          {/* Current Playlists Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Danh sách hiện có ({playlists.length})
            </h4>

            {playlists.length === 0 ? (
              <p className="text-xs text-zinc-500 italic p-3 text-center">Chưa có playlist nào được thêm.</p>
            ) : (
              <div className="space-y-2">
                {playlists.map(pl => (
                  <div
                    key={pl.id}
                    className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs sm:text-sm text-zinc-200 truncate">{pl.name}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-emerald-400 border border-zinc-700 flex-shrink-0">
                          {pl.channelCount} kênh
                        </span>
                        <span className="text-[10px] text-zinc-500 uppercase">{pl.type}</span>
                      </div>
                      <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                        Cập nhật: {new Date(pl.lastUpdated).toLocaleString('vi-VN')}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {/* Active Toggle */}
                      <button
                        onClick={() => handleToggleActive(pl.id)}
                        className={`text-xs px-2 py-1 rounded-md border font-medium ${
                          pl.isActive
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                            : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                        }`}
                      >
                        {pl.isActive ? 'Đang bật' : 'Tắt'}
                      </button>

                      {/* Refresh Button for URL */}
                      {pl.type === 'url' && (
                        <button
                          onClick={() => handleRefresh(pl.id)}
                          disabled={refreshingId === pl.id}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                          title="Cập nhật lại từ URL"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${refreshingId === pl.id ? 'animate-spin text-emerald-400' : ''}`}
                          />
                        </button>
                      )}

                      {/* Delete Button */}
                      <button
                        onClick={() => handleDelete(pl.id, pl.name)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
                        title="Xóa playlist"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
