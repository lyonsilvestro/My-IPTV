import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  Smartphone,
  Share,
  PlusSquare,
  CheckCircle2,
  Monitor,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface InstallPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  deferredPrompt: any;
  onInstalled?: () => void;
}

export const InstallPromptModal: React.FC<InstallPromptModalProps> = ({
  isOpen,
  onClose,
  deferredPrompt,
  onInstalled
}) => {
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ua = window.navigator.userAgent.toLowerCase();
      const isIosDevice = /iphone|ipad|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isAndroidDevice = /android/.test(ua);
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;

      setIsIOS(isIosDevice);
      setIsAndroid(isAndroidDevice);
      setIsStandalone(standalone);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstallSuccess(true);
        if (onInstalled) onInstalled();
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    } catch (err) {
      console.warn('Install prompt error:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-zinc-100 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">Cài đặt IPTV ra Màn hình chính</h3>
              <p className="text-xs text-zinc-400">Ứng dụng Web Tiến bộ (Progressive Web App - PWA)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
          {isStandalone ? (
            <div className="p-4 rounded-xl bg-emerald-950/70 border border-emerald-800 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <h4 className="font-semibold text-emerald-300 text-sm">Ứng dụng đã được cài đặt!</h4>
              <p className="text-xs text-zinc-300">
                Bạn đang chạy IPTV Streamer ở chế độ Standalone toàn màn hình trực tiếp từ màn hình chính.
              </p>
            </div>
          ) : installSuccess ? (
            <div className="p-4 rounded-xl bg-emerald-950/70 border border-emerald-800 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <h4 className="font-semibold text-emerald-300 text-sm">Cài đặt thành công!</h4>
              <p className="text-xs text-zinc-300">Biểu tượng ứng dụng IPTV đã được thêm ra màn hình chính của bạn.</p>
            </div>
          ) : (
            <>
              {/* One-click install button if supported */}
              {deferredPrompt && (
                <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-950/80 to-zinc-900 border border-emerald-800/80 text-center space-y-3">
                  <div className="flex items-center justify-center gap-2 text-emerald-400 font-semibold text-sm">
                    <Sparkles className="w-4 h-4 animate-pulse" />
                    <span>Hỗ trợ cài đặt nhanh 1 chạm</span>
                  </div>
                  <p className="text-xs text-zinc-300">
                    Trình duyệt của bạn hỗ trợ cài đặt trực tiếp. Nhấn nút bên dưới để thêm ngay ứng dụng ra màn hình:
                  </p>
                  <button
                    onClick={handleInstallClick}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Cài đặt Ứng dụng ngay bây giờ</span>
                  </button>
                </div>
              )}

              {/* iOS Safari Instruction */}
              {isIOS && (
                <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800 space-y-3">
                  <div className="flex items-center gap-2 text-zinc-200 font-semibold text-sm">
                    <Smartphone className="w-4 h-4 text-blue-400" />
                    <span>Hướng dẫn cho iPhone / iPad (Safari)</span>
                  </div>
                  <ol className="text-xs text-zinc-300 space-y-2.5 list-decimal list-inside pl-1">
                    <li className="leading-relaxed">
                      Nhấn vào nút <span className="font-semibold text-blue-400 inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded bg-zinc-800"><Share className="w-3 h-3" /> Chia sẻ (Share)</span> ở thanh công cụ dưới cùng của trình duyệt Safari.
                    </li>
                    <li className="leading-relaxed">
                      Cuộn xuống danh sách tùy chọn và chọn <span className="font-semibold text-amber-300 inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded bg-zinc-800"><PlusSquare className="w-3 h-3" /> Thêm vào MH chính (Add to Home Screen)</span>.
                    </li>
                    <li className="leading-relaxed">
                      Nhấn nút <span className="font-bold text-white px-1.5 py-0.5 rounded bg-zinc-800">Thêm (Add)</span> ở góc trên bên phải để xác nhận.
                    </li>
                  </ol>
                </div>
              )}

              {/* Android / Chrome Instruction */}
              {!isIOS && !deferredPrompt && (
                <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800 space-y-3">
                  <div className="flex items-center gap-2 text-zinc-200 font-semibold text-sm">
                    {isAndroid ? <Smartphone className="w-4 h-4 text-emerald-400" /> : <Monitor className="w-4 h-4 text-purple-400" />}
                    <span>{isAndroid ? 'Hướng dẫn cho Android (Chrome / Edge)' : 'Hướng dẫn cho Máy tính (Chrome / Edge)'}</span>
                  </div>
                  <ol className="text-xs text-zinc-300 space-y-2 list-decimal list-inside pl-1">
                    <li className="leading-relaxed">
                      Nhấn vào biểu tượng <span className="font-bold text-white px-1.5 py-0.5 rounded bg-zinc-800">⋮ (Menu 3 chấm)</span> ở góc phải trên trình duyệt.
                    </li>
                    <li className="leading-relaxed">
                      Chọn <span className="font-semibold text-emerald-400 px-1.5 py-0.5 rounded bg-zinc-800">"Cài đặt ứng dụng"</span> hoặc <span className="font-semibold text-emerald-400 px-1.5 py-0.5 rounded bg-zinc-800">"Thêm vào màn hình chính"</span>.
                    </li>
                    <li className="leading-relaxed">
                      Xác nhận cài đặt để tạo lối tắt độc lập trên màn hình.
                    </li>
                  </ol>
                </div>
              )}

              {/* Benefits list */}
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3.5 space-y-2">
                <h5 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Ưu điểm khi cài đặt PWA:</h5>
                <ul className="text-xs text-zinc-300 space-y-1.5">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Mở ứng dụng toàn màn hình không có thanh URL trình duyệt</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Khởi động siêu tốc, chiếm dưới 3MB bộ nhớ điện thoại</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Kênh Yêu thích được đồng bộ lưu trữ an toàn riêng cho thiết bị của bạn</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Tương thích với cả điện thoại Android, iPhone, iPad, PC và Smart TV</span>
                  </li>
                </ul>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
