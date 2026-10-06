import React, { useEffect, useState } from 'react';
import {
  X,
  Shield,
  Activity,
  Cpu,
  HardDrive,
  Clock,
  StopCircle,
  RefreshCw,
  AlertTriangle,
  Lock,
  List,
  Database,
  Download,
  Upload,
  FileJson,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { ServerMetrics, TranscodeSessionInfo, LogEntry } from '../types/iptv.ts';
import { apiUrl } from '../lib/api.ts';
import { setAdminSession, isAdminLoggedIn, getAuthHeaders, clearAdminSession } from '../lib/auth.ts';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshAll?: () => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({ isOpen, onClose, onRefreshAll }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'metrics' | 'backup'>('metrics');

  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [sessions, setSessions] = useState<TranscodeSessionInfo[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR'>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Backup & Restore states
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [showConfirmRestore, setShowConfirmRestore] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  // Check existing session on open
  useEffect(() => {
    if (isOpen) {
      if (isAdminLoggedIn()) {
        setIsAuthenticated(true);
      }
    }
  }, [isOpen]);

  // Poll metrics when open and authenticated
  useEffect(() => {
    if (!isOpen || !isAuthenticated) return;

    fetchData();
    const timer = setInterval(fetchData, 4000);
    return () => clearInterval(timer);
  }, [isOpen, isAuthenticated]);

  const fetchData = async () => {
    try {
      setIsRefreshing(true);
      const [metResp, sessResp, logsResp] = await Promise.all([
        fetch(apiUrl('/api/admin/metrics')),
        fetch(apiUrl('/api/transcode/sessions')),
        fetch(apiUrl('/api/admin/logs?limit=50'))
      ]);

      if (metResp.ok) setMetrics(await metResp.json());
      if (sessResp.ok) setSessions(await sessResp.json());
      if (logsResp.ok) setLogs(await logsResp.json());
    } catch (err) {
      console.error('Failed to fetch admin data:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const resp = await fetch(apiUrl('/api/admin/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Sai thông tin đăng nhập');
      }
      setAdminSession(data.token, data.username);
      setIsAuthenticated(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoginError(msg);
    }
  };

  const handleStopSession = async (sessionId: string) => {
    try {
      await fetch(apiUrl(`/api/transcode/sessions/${encodeURIComponent(sessionId)}/stop`), {
        method: 'POST'
      });
      fetchData();
    } catch (err) {
      console.error('Failed to stop session:', err);
    }
  };

  // Download JSON Backup
  const handleDownloadBackupJson = async () => {
    try {
      setIsExporting(true);
      setBackupError(null);
      setBackupSuccess(null);

      const resp = await fetch(apiUrl('/api/admin/backup'), {
        headers: { ...getAuthHeaders() }
      });

      if (!resp.ok) {
        throw new Error(`Lỗi tải backup: HTTP ${resp.status}`);
      }

      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `iptv-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setBackupSuccess('Đã tải xuống file sao lưu JSON thành công!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setBackupError(msg);
    } finally {
      setIsExporting(false);
    }
  };

  // Download raw SQLite .db file
  const handleDownloadBackupDb = async () => {
    try {
      setIsExporting(true);
      setBackupError(null);
      setBackupSuccess(null);

      const resp = await fetch(apiUrl('/api/admin/backup/db'), {
        headers: { ...getAuthHeaders() }
      });

      if (!resp.ok) {
        throw new Error(`Lỗi tải file database: HTTP ${resp.status}`);
      }

      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `iptv-${new Date().toISOString().split('T')[0]}.db`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setBackupSuccess('Đã tải xuống file cơ sở dữ liệu SQLite (.db) thành công!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setBackupError(msg);
    } finally {
      setIsExporting(false);
    }
  };

  // Restore Database from Uploaded Backup File
  const handlePromptRestore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreFile) {
      setBackupError('Vui lòng chọn file sao lưu (.json hoặc .db) để khôi phục.');
      return;
    }
    setBackupError(null);
    setShowConfirmRestore(true);
  };

  const executeRestore = async () => {
    if (!restoreFile) return;

    try {
      setIsRestoring(true);
      setShowConfirmRestore(false);
      setBackupError(null);
      setBackupSuccess(null);

      const formData = new FormData();
      formData.append('file', restoreFile);

      const resp = await fetch(apiUrl('/api/admin/restore'), {
        method: 'POST',
        headers: { ...getAuthHeaders() },
        body: formData
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Khôi phục dữ liệu thất bại.');
      }

      const formatLabel = data.format === 'sqlite' ? 'SQLite nguyên bản' : 'JSON';
      setBackupSuccess(
        `Khôi phục thành công (${formatLabel})! Đã phục hồi ${data.playlistsRestored} playlist và ${data.channelsRestored} kênh vào hệ thống.`
      );
      setRestoreFile(null);
      fetchData();
      if (onRefreshAll) {
        onRefreshAll();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setBackupError(msg);
    } finally {
      setIsRestoring(false);
    }
  };

  if (!isOpen) return null;

  const filteredLogs = logs.filter(l => (logFilter === 'ALL' ? true : l.level === logFilter));

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-zinc-100">
        {/* Modal Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">Quản trị Hệ thống & Dữ liệu IPTV</h3>
              <p className="text-xs text-zinc-400">Giám sát tài nguyên, tiến trình chuyển mã và sao lưu cơ sở dữ liệu</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Not Logged In View */}
        {!isAuthenticated ? (
          <div className="p-6 max-w-sm mx-auto w-full space-y-4">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto text-purple-400 mb-2">
                <Lock className="w-6 h-6" />
              </div>
              <h4 className="font-semibold text-sm">Đăng nhập Quản trị viên</h4>
              <p className="text-xs text-zinc-500">Mặc định: admin / admin123 (hoặc mật khẩu trong .env)</p>
            </div>

            {loginError && (
              <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs text-center">
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Tài khoản</label>
                <input
                  type="text"
                  value={username ?? ''}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Mật khẩu</label>
                <input
                  type="password"
                  value={password ?? ''}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu..."
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-purple-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white transition-colors"
              >
                Đăng nhập
              </button>
            </form>
          </div>
        ) : (
          /* Authenticated Dashboard View */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tab Navigation */}
            <div className="flex border-b border-zinc-800 bg-zinc-950 px-4 pt-2 gap-2">
              <button
                onClick={() => setActiveTab('metrics')}
                className={`py-2 px-3 text-xs font-semibold rounded-t-lg border-b-2 flex items-center gap-2 transition-colors ${
                  activeTab === 'metrics'
                    ? 'border-purple-500 text-purple-400 bg-zinc-900'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>Giám sát & Chuyển mã</span>
              </button>
              <button
                onClick={() => setActiveTab('backup')}
                className={`py-2 px-3 text-xs font-semibold rounded-t-lg border-b-2 flex items-center gap-2 transition-colors ${
                  activeTab === 'backup'
                    ? 'border-purple-500 text-purple-400 bg-zinc-900'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Database className="w-4 h-4" />
                <span>Sao lưu & Khôi phục (Backup / Restore)</span>
              </button>
            </div>

            {/* Tab 1: Metrics & Logs */}
            {activeTab === 'metrics' ? (
              <div className="p-4 overflow-y-auto space-y-5 flex-1 scrollbar-thin scrollbar-thumb-zinc-700">
                {/* Top Stat Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800">
                    <div className="flex items-center justify-between text-zinc-400 text-xs">
                      <span>Tải CPU</span>
                      <Cpu className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-xl font-bold text-zinc-100 mt-1">{metrics ? `${metrics.cpuUsage}%` : '...'}</div>
                    <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${metrics?.cpuUsage || 5}%` }}
                      />
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800">
                    <div className="flex items-center justify-between text-zinc-400 text-xs">
                      <span>RAM Đang dùng</span>
                      <HardDrive className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="text-xl font-bold text-zinc-100 mt-1">
                      {metrics ? `${metrics.usedMemoryMb} MB` : '...'}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-1">
                      Tổng: {metrics?.totalMemoryMb || 0} MB (Trống {metrics?.freeMemoryMb || 0} MB)
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800">
                    <div className="flex items-center justify-between text-zinc-400 text-xs">
                      <span>FFmpeg Sessions</span>
                      <Activity className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="text-xl font-bold text-purple-400 mt-1">
                      {sessions.length} / 5
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-1">Tiến trình đang hoạt động</div>
                  </div>

                  <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800">
                    <div className="flex items-center justify-between text-zinc-400 text-xs">
                      <span>Thời gian chạy</span>
                      <Clock className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="text-xl font-bold text-zinc-100 mt-1">
                      {metrics ? `${Math.floor(metrics.uptimeSeconds / 60)} phút` : '...'}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-1">Node {metrics?.nodeVersion}</div>
                  </div>
                </div>

                {/* Active FFmpeg Transcode Sessions Table */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Phiên Chuyển mã Đang chạy ({sessions.length})
                    </h4>
                    <button
                      onClick={fetchData}
                      disabled={isRefreshing}
                      className="p-1 rounded text-zinc-400 hover:text-white"
                      title="Làm mới"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {sessions.length === 0 ? (
                    <div className="p-4 rounded-xl bg-zinc-950/40 border border-zinc-800/80 text-xs text-zinc-500 text-center italic">
                      Không có phiên chuyển mã FFmpeg nào đang chạy. Các luồng Direct Stream không tốn CPU server.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-zinc-800 overflow-hidden bg-zinc-950/50">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400">
                          <tr>
                            <th className="p-2.5">Kênh</th>
                            <th className="p-2.5">Profile</th>
                            <th className="p-2.5">Clients</th>
                            <th className="p-2.5">Bắt đầu lúc</th>
                            <th className="p-2.5 text-right">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60">
                          {sessions.map(s => (
                            <tr key={s.sessionId} className="hover:bg-zinc-900/40">
                              <td className="p-2.5 font-medium text-zinc-200">{s.channelName}</td>
                              <td className="p-2.5">
                                <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 text-[10px] font-mono">
                                  {s.profile}
                                </span>
                              </td>
                              <td className="p-2.5 text-zinc-400">{s.clients} người xem</td>
                              <td className="p-2.5 text-zinc-500 font-mono text-[11px]">
                                {new Date(s.startedAt).toLocaleTimeString()}
                              </td>
                              <td className="p-2.5 text-right">
                                <button
                                  onClick={() => handleStopSession(s.sessionId)}
                                  className="text-xs text-rose-400 hover:text-rose-300 font-semibold px-2 py-1 rounded bg-rose-950/60 border border-rose-800/80 transition-colors"
                                >
                                  Dừng
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* System Logs */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Nhật ký Máy chủ (Logs)
                    </h4>
                    <div className="flex items-center gap-1">
                      {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map(lvl => (
                        <button
                          key={lvl}
                          onClick={() => setLogFilter(lvl)}
                          className={`text-[10px] px-2 py-0.5 rounded font-mono transition-colors ${
                            logFilter === lvl
                              ? 'bg-zinc-700 text-white font-bold'
                              : 'bg-zinc-900 text-zinc-400 hover:text-white'
                          }`}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-black border border-zinc-800 font-mono text-[11px] h-48 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-zinc-700">
                    {filteredLogs.length === 0 ? (
                      <div className="text-zinc-600 italic">Chưa có nhật ký nào trong bộ lọc này.</div>
                    ) : (
                      filteredLogs.map((l, idx) => {
                        const color =
                          l.level === 'ERROR'
                            ? 'text-rose-400'
                            : l.level === 'WARN'
                            ? 'text-amber-400'
                            : 'text-zinc-400';
                        return (
                          <div key={idx} className="leading-relaxed">
                            <span className="text-zinc-600">[{new Date(l.timestamp).toLocaleTimeString()}]</span>{' '}
                            <span className={`font-semibold ${color}`}>[{l.level}]</span>{' '}
                            <span className="text-zinc-200">{l.message}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Tab 2: Backup & Restore */
              <div className="p-4 overflow-y-auto space-y-4 flex-1 scrollbar-thin scrollbar-thumb-zinc-700">
                {backupSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    <span>{backupSuccess}</span>
                  </div>
                )}
                {backupError && (
                  <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{backupError}</span>
                  </div>
                )}

                {/* Current Database Status Banner */}
                <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                      <HardDrive className="w-4 h-4 text-purple-400" />
                      <span>Thông tin Cơ sở dữ liệu Hệ thống</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
                      SQLite 3
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800/80">
                      <span className="text-zinc-500 block text-[11px]">Tổng Playlists</span>
                      <span className="text-base font-bold text-zinc-100">{metrics?.totalPlaylists ?? 0}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800/80">
                      <span className="text-zinc-500 block text-[11px]">Tổng Kênh Live</span>
                      <span className="text-base font-bold text-emerald-400">{metrics?.totalChannels ?? 0}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800/80">
                      <span className="text-zinc-500 block text-[11px]">Dung lượng DB</span>
                      <span className="text-base font-bold text-blue-400">
                        {metrics?.dbFileSizeKb ? `${metrics.dbFileSizeKb} KB` : 'Ổn định'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800/80">
                      <span className="text-zinc-500 block text-[11px]">Cập nhật lần cuối</span>
                      <span className="text-[11px] font-mono text-zinc-300 block truncate mt-1">
                        {metrics?.dbLastModified
                          ? new Date(metrics.dbLastModified).toLocaleTimeString('vi-VN')
                          : 'Hiện tại'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section 1: Export Backup */}
                <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>1. Xuất Bản Sao Lưu Dữ Liệu (Export Backup)</span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Tải về toàn bộ cơ sở dữ liệu (Bao gồm danh sách Playlist, Kênh, và Cấu hình). Bạn có thể lưu trữ file này
                    trên máy tính cá nhân để bảo vệ dữ liệu vĩnh viễn hoặc chuyển sang máy chủ khác khi cần.
                  </p>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      onClick={handleDownloadBackupJson}
                      disabled={isExporting}
                      className="py-2 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                    >
                      <FileJson className="w-4 h-4" />
                      <span>{isExporting ? 'Đang xuất...' : 'Tải File Backup (.json)'}</span>
                    </button>

                    <button
                      onClick={handleDownloadBackupDb}
                      disabled={isExporting}
                      className="py-2 px-3.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-zinc-200 flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <Database className="w-4 h-4 text-purple-400" />
                      <span>Tải Cơ sở dữ liệu thô (.db)</span>
                    </button>
                  </div>
                </div>

                {/* Section 2: Import Restore */}
                <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                    <Upload className="w-4 h-4 text-blue-400" />
                    <span>2. Khôi Phục Dữ Liệu Từ File Sao Lưu (Restore)</span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Chọn file sao lưu định dạng <code className="text-purple-300">.json</code> hoặc file cơ sở dữ liệu SQLite <code className="text-purple-300">.db</code> để phục hồi lại toàn bộ danh mục kênh. Thao tác này sẽ đồng bộ hóa cơ sở dữ liệu máy chủ ngay lập tức.
                  </p>

                  <form onSubmit={handlePromptRestore} className="space-y-3 pt-1">
                    <div>
                      <input
                        type="file"
                        accept=".json,.db"
                        onChange={e => {
                          setRestoreFile(e.target.files?.[0] || null);
                          setBackupError(null);
                        }}
                        className="w-full text-xs text-zinc-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700 cursor-pointer"
                      />
                    </div>

                    {/* Selected File Details */}
                    {restoreFile && (
                      <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                            {restoreFile.name.endsWith('.db') ? (
                              <Database className="w-3.5 h-3.5 text-purple-400" />
                            ) : (
                              <FileJson className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                            {restoreFile.name}
                          </span>
                          <span className="text-zinc-400 font-mono text-[11px]">
                            {Math.round(restoreFile.size / 1024)} KB
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500">
                          Định dạng: {restoreFile.name.endsWith('.db') ? 'Cơ sở dữ liệu SQLite binary (.db)' : 'Bản sao lưu JSON (.json)'}
                        </p>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isRestoring || !restoreFile}
                      className="py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                    >
                      {isRestoring ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      <span>{isRestoring ? 'Đang khôi phục dữ liệu...' : 'Khôi phục Dữ liệu Ngay'}</span>
                    </button>
                  </form>
                </div>

                {/* Confirmation Dialog before Restore */}
                {showConfirmRestore && restoreFile && (
                  <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-800 space-y-3 animate-in fade-in">
                    <div className="flex items-center gap-2 text-rose-300 font-semibold text-xs sm:text-sm">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>Xác nhận khôi phục Cơ sở dữ liệu?</span>
                    </div>
                    <p className="text-xs text-rose-200 leading-relaxed">
                      Hành động này sẽ <strong>thay thế toàn bộ</strong> danh sách playlist và các kênh hiện tại trong cơ sở dữ liệu server bằng dữ liệu trong file <strong>"{restoreFile.name}"</strong>.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={executeRestore}
                        disabled={isRestoring}
                        className="py-1.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {isRestoring ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        <span>Tiến hành Khôi phục</span>
                      </button>
                      <button
                        onClick={() => setShowConfirmRestore(false)}
                        className="py-1.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs transition-colors"
                      >
                        Hủy bỏ
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
