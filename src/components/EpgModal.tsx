import React, { useState } from 'react';
import { X, Calendar, Link, Upload, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiUrl } from '../lib/api.ts';

interface EpgModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshChannels: () => void;
}

export const EpgModal: React.FC<EpgModalProps> = ({ isOpen, onClose, onRefreshChannels }) => {
  const [xmltvUrl, setXmltvUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<'url' | 'upload'>('url');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFetchUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!xmltvUrl.trim()) {
      setErrorMsg('Vui lòng nhập URL XMLTV.');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const resp = await fetch(apiUrl('/api/epg/fetch'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: xmltvUrl.trim() })
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to fetch EPG');
      }

      setSuccessMsg(`Đã tải thành công ${data.count} chương trình EPG!`);
      onRefreshChannels();
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
      setErrorMsg('Vui lòng chọn file XMLTV (.xml).');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const formData = new FormData();
      formData.append('file', selectedFile);

      const resp = await fetch(apiUrl('/api/epg/upload'), {
        method: 'POST',
        body: formData
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to upload XMLTV file');
      }

      setSuccessMsg(`Đã nhập thành công ${data.count} chương trình EPG!`);
      setSelectedFile(null);
      onRefreshChannels();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-zinc-100">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">Lịch phát sóng EPG (XMLTV)</h3>
              <p className="text-xs text-zinc-400">Tự động đối soát và hiển thị chương trình Hiện tại / Kế tiếp</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
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
                activeTab === 'url' ? 'bg-blue-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Link className="w-3.5 h-3.5" /> Tải từ URL XMLTV
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === 'upload' ? 'bg-blue-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5" /> Upload File XML
            </button>
          </div>

          {activeTab === 'url' ? (
            <form onSubmit={handleFetchUrl} className="space-y-3 bg-zinc-950/50 p-3.5 rounded-xl border border-zinc-800">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">URL XMLTV</label>
                <input
                  type="url"
                  value={xmltvUrl ?? ''}
                  onChange={e => setXmltvUrl(e.target.value)}
                  placeholder="https://example.com/epg/guide.xml"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />}
                {isLoading ? 'Đang tải & phân tích XMLTV...' : 'Tải EPG'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleUploadFile} className="space-y-3 bg-zinc-950/50 p-3.5 rounded-xl border border-zinc-800">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Chọn file XMLTV (.xml)</label>
                <input
                  type="file"
                  accept=".xml,text/xml"
                  onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700 cursor-pointer"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || !selectedFile}
                className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {isLoading ? 'Đang phân tích file...' : 'Tải lên XMLTV'}
              </button>
            </form>
          )}

          <div className="p-3 rounded-xl bg-zinc-950/40 border border-zinc-800 text-[11px] text-zinc-400 space-y-1">
            <span className="font-semibold text-zinc-300">Cơ chế ánh xạ EPG:</span>
            <p>
              Hệ thống sẽ tự động ghép kênh dựa trên thuộc tính <code className="text-blue-400">tvg-id</code> hoặc{' '}
              <code className="text-blue-400">tvg-name</code> trong danh sách M3U với mã kênh trong XMLTV.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
