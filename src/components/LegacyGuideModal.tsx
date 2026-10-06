import React, { useState } from 'react';
import { X, Smartphone, ExternalLink, Copy, Check, Info, Cpu, CheckCircle2 } from 'lucide-react';

interface LegacyGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LegacyGuideModal: React.FC<LegacyGuideModalProps> = ({ isOpen, onClose }) => {
  const [copiedLegacyUrl, setCopiedLegacyUrl] = useState(false);

  if (!isOpen) return null;

  const legacyUrl = `${window.location.origin}/legacy`;

  const copyUrl = () => {
    navigator.clipboard.writeText(legacyUrl).then(() => {
      setCopiedLegacyUrl(true);
      setTimeout(() => setCopiedLegacyUrl(false), 2500);
    });
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-zinc-100">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-600/20 text-orange-400 flex items-center justify-center">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">Hướng dẫn Cấu hình Nokia E72 (Symbian S60)</h3>
              <p className="text-xs text-zinc-400">Tối ưu hóa phát luồng IPTV trên CPU ARM 600 MHz và RAM 128 MB</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
          {/* Legacy Portal Address Box */}
          <div className="p-3.5 rounded-xl bg-orange-950/40 border border-orange-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-orange-300 uppercase tracking-wide">
                Đường dẫn Cổng Legacy Siêu nhẹ:
              </span>
              <button
                onClick={copyUrl}
                className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 font-semibold"
              >
                {copiedLegacyUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLegacyUrl ? 'Đã copy!' : 'Copy Link'}</span>
              </button>
            </div>
            <div className="p-2 bg-black/90 font-mono text-xs text-orange-200 rounded border border-orange-900/60 break-all select-all">
              {legacyUrl}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <a
                href={legacyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-xs font-semibold text-white transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Mở ngay Giao diện Legacy
              </a>
            </div>
          </div>

          {/* Technical Specs Profile */}
          <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
              <Cpu className="w-4 h-4" />
              <span>Thông số Profile FFmpeg nokia_e72 được thiết lập sẵn:</span>
            </div>
            <ul className="text-xs text-zinc-300 space-y-1 list-disc list-inside">
              <li>
                <b>Độ phân giải:</b> 320x240 pixels (Khớp 100% màn hình ngang chuẩn 2.36 inch QVGA của Nokia E72).
              </li>
              <li>
                <b>Tốc độ khung hình (FPS):</b> 15 fps (Giảm tải CPU 600 MHz, mượt mà và không giật lag).
              </li>
              <li>
                <b>Video Codec:</b> H.264 Baseline Profile Level 1.2/1.3, Ultrafast preset, zerolatency.
              </li>
              <li>
                <b>Video Bitrate:</b> 180 - 220 kbps (Hoạt động ổn định cả trên mạng 3G lẫn WiFi 802.11 b/g).
              </li>
              <li>
                <b>Audio Codec:</b> AAC Mono 40 kbps @ 22.050 Hz (Phù hợp loa ngoài và tai nghe 3.5mm của E72).
              </li>
              <li>
                <b>Container:</b> MPEG-TS qua HTTP trực tiếp hoặc file danh sách <code className="text-emerald-400">.m3u</code> tải về máy.
              </li>
            </ul>
          </div>

          {/* Step by step for CorePlayer */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Phương án 1: Dùng phần mềm CorePlayer 1.36 (Khuyên dùng nhất)
            </h4>
            <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800 text-xs text-zinc-300 space-y-2">
              <p>
                <b>Bước 1:</b> Cài đặt ứng dụng <b>CorePlayer v1.3.6 (Build 7427)</b> cho Symbian S60v3.
              </p>
              <p>
                <b>Bước 2:</b> Kết nối Nokia E72 với cùng mạng WiFi hoặc bật 3G/GPRS có kết nối Internet đến máy chủ này.
              </p>
              <p>
                <b>Bước 3:</b> Mở trình duyệt Web mặc định của E72, truy cập vào đường dẫn <code className="text-orange-300">{legacyUrl}</code>.
              </p>
              <p>
                <b>Bước 4:</b> Chọn Nhóm kênh &gt; Chọn Kênh &gt; Bấm vào <b>"Tải file Playlist (.m3u) về máy"</b>.
              </p>
              <p>
                <b>Bước 5:</b> Mở file vừa tải bằng CorePlayer hoặc trong CorePlayer chọn <b>Menu &gt; Open URL...</b> và dán đường link luồng MPEG-TS.
              </p>
            </div>
          </div>

          {/* Step by step for RealPlayer */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-blue-400" />
              Phương án 2: Dùng ứng dụng RealPlayer có sẵn trong máy
            </h4>
            <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800 text-xs text-zinc-300 space-y-2">
              <p>
                <b>Bước 1:</b> Mở <b>RealPlayer</b> trên điện thoại Nokia E72.
              </p>
              <p>
                <b>Bước 2:</b> Vào <b>Tùy chọn &gt; Cài đặt &gt; Truyền tải trực tiếp (Streaming) &gt; Mạng</b>.
              </p>
              <p>
                <b>Bước 3:</b> Chỉnh <b>Thời gian đệm (Buffer time)</b> thành <b>20 giây</b> (giúp stream ổn định không bị ngắt).
              </p>
              <p>
                <b>Bước 4:</b> Mở liên kết stream MPEG-TS hoặc mở trang web Legacy để khởi động luồng.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
