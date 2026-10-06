import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Upload,
  Link,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Lock,
  Unlock,
  Shield,
  Layers,
  Info
} from 'lucide-react';
import { Playlist } from '../types/iptv.ts';
import { apiUrl } from '../lib/api.ts';
import {
  getAuthHeaders,
  isAdminLoggedIn,
  setAdminSession,
  clearAdminSession
} from '../lib/auth.ts';

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
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<'url' | 'upload'>('url');
  const [playlistName, setPlaylistName] = useState('');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Admin login form state
  const [adminUser, setAdminUser] = useState('admin');
  const [adminPass, setAdminPass] = useState('');
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsAdmin(isAdminLoggedIn());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setErrorMsg(null);
    try {
      const resp = await fetch(apiUrl('/api/admin/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminUser, password: adminPass })
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Sai thông tin đăng nhập quản trị viên.');
      }
      setAdminSession(data.token, data.username);
      setIsAdmin(true);
      setShowLoginForm(false);
      setAdminPass('');
      setSuccessMsg('Đăng nhập Quản trị viên thành công! Bạn có thể quản lý danh sách kênh.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleAdminLogout = () => {
    clearAdminSession();
    setIsAdmin(false);
    setSuccessMsg('Đã đăng xuất chế độ Quản trị viên. Giao diện trở về chế độ Người xem.');
  };

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
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ name: playlistName.trim(), url: playlistUrl.trim() })
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to import playlist');
      }

      setSuccessMsg(`Thành công! Đã nạp và đồng bộ ${data.channelCount} kênh cho toàn hệ thống.`);
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
        headers: {
          ...getAuthHeaders()
        },
        body: formData
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to upload playlist');
      }

      setSuccessMsg(`Tải lên thành công! Đã nạp ${data.channelCount} kênh vào cơ sở dữ liệu hệ thống.`);
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
      const resp = await fetch(apiUrl(`/api/playlists/${playlistId}/refresh`), {
        method: 'POST',
        headers: { ...getAuthHeaders() }
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to refresh playlist');
      }
      setSuccessMsg(`Đã cập nhật lại playlist! Tổng cộng ${data.channelCount} kênh.`);
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
      const resp = await fetch(apiUrl(`/api/playlists/${playlistId}/toggle`), {
        method: 'POST',
        headers: { ...getAuthHeaders() }
      });
      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || 'Failed to toggle playlist');
      }
      onRefreshPlaylists();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    }
  };

  const handleDelete = async (playlistId: string, name: string) => {
    if (!confirm(`Bạn có chắc muốn xóa playlist "${name}" khỏi toàn bộ hệ thống không?`)) return;
    try {
      const resp = await fetch(apiUrl(`/api/playlists/${playlistId}`), {
        method: 'DELETE',
        headers: { ...getAuthHeaders() }
      });
      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || 'Failed to delete playlist');
      }
      setSuccessMsg(`Đã xóa playlist "${name}" thành công.`);
      onRefreshPlaylists();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    }
  };

  const handleLoadPreset = (name: string, url: string) => {
    setPlaylistName(name);
    setPlaylistUrl(url);
    setActiveTab('url');
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-zinc-100">
        {/* Modal Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base">Quản lý Playlist IPTV</h3>
                {isAdmin ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                    <Shield className="w-3 h-3" /> Quyền Admin
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Chế độ Người xem
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400">Danh sách kênh trung tâm đồng bộ trên mọi thiết bị</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin ? (
              <button
                onClick={handleAdminLogout}
                className="text-xs text-zinc-400 hover:text-white px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors"
                title="Đăng xuất quyền Admin"
              >
                Đăng xuất
              </button>
            ) : (
              <button
                onClick={() => setShowLoginForm(!showLoginForm)}
                className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded bg-emerald-950/60 border border-emerald-800/80 transition-colors flex items-center gap-1 font-semibold"
              >
                <Unlock className="w-3 h-3" /> Đăng nhập Admin
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 scrollbar-thin scrollbar-thumb-zinc-700">
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

          {/* Inline Admin Login Form (if toggled) */}
          {showLoginForm && !isAdmin && (
            <form
              onSubmit={handleAdminLogin}
              className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-800/80 space-y-2.5 animate-in fade-in"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-purple-400" /> Đăng nhập Quản trị viên để chỉnh sửa danh sách kênh
                </span>
                <button
                  type="button"
                  onClick={() => setShowLoginForm(false)}
                  className="text-xs text-zinc-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-0.5">Tài khoản</label>
                  <input
                    type="text"
                    value={adminUser}
                    onChange={e => setAdminUser(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-0.5">Mật khẩu</label>
                  <input
                    type="password"
                    value={adminPass}
                    onChange={e => setAdminPass(e.target.value)}
                    placeholder="Nhập mật khẩu admin..."
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white transition-colors disabled:opacity-50"
              >
                {loginLoading ? 'Đang xác thực...' : 'Xác thực Quyền Admin'}
              </button>
            </form>
          )}

          {/* Centralized Catalog Information Notice for non-admin devices */}
          {!isAdmin ? (
            <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                <Info className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Danh sách kênh được quản trị tập trung (Bảo vệ tính toàn vẹn)</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Mọi thiết bị truy cập (Điện thoại, Máy tính, Nokia E72) đều được đồng bộ xem chung danh sách kênh do
                Quản trị viên thiết lập. Người xem không thể tùy tiện xóa hoặc thay đổi danh mục chung của hệ thống, nhưng
                có thể tự do <b>bấm nút hình trái tim để lưu danh sách Kênh Yêu thích</b> của riêng mình.
              </p>
            </div>
          ) : (
            /* Admin Modification Controls (URL & Upload Tabs) */
            <div className="space-y-3">
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
                <form
                  onSubmit={handleAddUrl}
                  className="space-y-3 bg-zinc-950/50 p-3.5 rounded-xl border border-zinc-800"
                >
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Tên Playlist</label>
                    <input
                      type="text"
                      value={playlistName}
                      onChange={e => setPlaylistName(e.target.value)}
                      placeholder="Ví dụ: Kênh Quốc Tế Mới"
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
                    <span className="font-semibold text-zinc-300">Gợi ý nguồn công khai:</span>
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
                    {isLoading ? 'Đang phân tích & lưu trữ...' : 'Nạp Playlist Vào Hệ Thống'}
                  </button>
                </form>
              ) : (
                /* Upload File Form */
                <form
                  onSubmit={handleUploadFile}
                  className="space-y-3 bg-zinc-950/50 p-3.5 rounded-xl border border-zinc-800"
                >
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Tên Playlist</label>
                    <input
                      type="text"
                      value={playlistName}
                      onChange={e => setPlaylistName(e.target.value)}
                      placeholder="Đặt tên danh sách tải lên..."
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
                    {isLoading ? 'Đang tải lên...' : 'Tải lên & Đồng bộ'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Current Playlists List */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
              <span>Danh sách Playlist Hệ Thống ({playlists.length})</span>
              <span className="text-[11px] text-zinc-500 lowercase">
                {isAdmin ? 'Được phép quản lý' : 'Chỉ xem'}
              </span>
            </h4>

            {playlists.length === 0 ? (
              <p className="text-xs text-zinc-500 italic p-3 text-center">Chưa có playlist nào trong hệ thống.</p>
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

                    {/* Actions: only Admin can toggle, refresh or delete */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isAdmin ? (
                        <>
                          {/* Active Toggle */}
                          <button
                            onClick={() => handleToggleActive(pl.id)}
                            className={`text-xs px-2 py-1 rounded-md border font-medium transition-colors ${
                              pl.isActive
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                            }`}
                            title="Bật/Tắt playlist này trong hệ thống"
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
                            title="Xóa playlist khỏi toàn bộ hệ thống"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded border ${
                            pl.isActive
                              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                              : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                          }`}
                        >
                          {pl.isActive ? 'Đang hoạt động' : 'Tạm tắt'}
                        </span>
                      )}
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
