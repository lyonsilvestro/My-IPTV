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
  List
} from 'lucide-react';
import { ServerMetrics, TranscodeSessionInfo, LogEntry } from '../types/iptv.ts';
import { apiUrl } from '../lib/api.ts';
import { setAdminSession, isAdminLoggedIn, getAuthHeaders, clearAdminSession } from '../lib/auth.ts';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({ isOpen, onClose }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [sessions, setSessions] = useState<TranscodeSessionInfo[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR'>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  if (!isOpen) return null;

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
              <h3 className="font-bold text-sm sm:text-base">Quản trị Hệ thống & FFmpeg Transcoder</h3>
              <p className="text-xs text-zinc-400">Giám sát tải CPU, RAM, tiến trình chuyển mã và nhật ký máy chủ</p>
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
              <p className="text-xs text-zinc-500">Mặc định: admin / admin123 (có thể đổi trong .env)</p>
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
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Mật khẩu</label>
                <input
                  type="password"
                  value={password}
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
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-purple-400" />
                  Các phiên FFmpeg đang chuyển mã ({sessions.length})
                </h4>
                <button
                  onClick={fetchData}
                  className="text-xs text-zinc-400 hover:text-white flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-purple-400' : ''}`} />
                  Làm mới
                </button>
              </div>

              {sessions.length === 0 ? (
                <div className="p-4 rounded-xl bg-zinc-950/50 border border-zinc-800/80 text-center text-xs text-zinc-500">
                  Không có phiên chuyển mã nào đang chạy. Hệ thống ở trạng thái nghỉ tiết kiệm CPU.
                </div>
              ) : (
                <div className="space-y-2">
                  {sessions.map(s => (
                    <div
                      key={s.sessionId}
                      className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs sm:text-sm text-zinc-100 truncate">
                            {s.channelName}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800 font-semibold uppercase">
                            {s.profile}
                          </span>
                          <span className="text-[10px] text-emerald-400 font-medium">
                            {s.clients} người xem
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          Bắt đầu: {new Date(s.startedAt).toLocaleTimeString('vi-VN')} | Session ID: {s.sessionId}
                        </p>
                      </div>

                      <button
                        onClick={() => handleStopSession(s.sessionId)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-medium transition-colors"
                        title="Dừng và giải phóng tài nguyên FFmpeg"
                      >
                        <StopCircle className="w-3.5 h-3.5" />
                        <span>Dừng</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Server Logs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <List className="w-3.5 h-3.5 text-zinc-400" />
                  Nhật ký máy chủ (Server Logs)
                </h4>

                {/* Filter buttons */}
                <div className="flex items-center gap-1">
                  {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map(lvl => (
                    <button
                      key={lvl}
                      onClick={() => setLogFilter(lvl)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                        logFilter === lvl ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-black/90 border border-zinc-800 rounded-xl p-3 font-mono text-[11px] max-h-48 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-zinc-700">
                {logs
                  .filter(l => logFilter === 'ALL' || l.level === logFilter)
                  .map(l => (
                    <div key={l.id} className="flex items-start gap-2 leading-tight">
                      <span className="text-zinc-500 select-none flex-shrink-0">
                        {new Date(l.timestamp).toLocaleTimeString()}
                      </span>
                      <span
                        className={`font-bold flex-shrink-0 ${
                          l.level === 'ERROR'
                            ? 'text-rose-400'
                            : l.level === 'WARN'
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        [{l.level}]
                      </span>
                      <span className="text-zinc-300 break-all">{l.message}</span>
                    </div>
                  ))}
                {logs.length === 0 && <span className="text-zinc-600">Chưa có nhật ký nào.</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
