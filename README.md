# IPTV Web Stream & Transcoder (Hỗ trợ Nokia E72 & Thiết bị Legacy)

Ứng dụng Web IPTV toàn diện được xây dựng bằng kiến trúc Full-Stack hiện đại (Node.js Express + React 19 + TypeScript + Tailwind CSS), tích hợp giải mã và chuyển mã luồng trực tiếp bằng FFmpeg theo thời gian thực (Real-time Transcoding) với chế độ chuyên biệt dành cho thiết bị cổ như **Nokia E72 chạy Symbian S60v3**.

---

## 1. TÍNH NĂNG NỔI BẬT

* **Quản lý Playlist IPTV**:
  * Nhập playlist qua URL trực tuyến (`.m3u`, `.m3u8`).
  * Upload file danh sách trực tiếp từ máy tính hoặc điện thoại.
  * Parser siêu tốc độ cao: Đọc đầy đủ `#EXTM3U`, `#EXTINF`, `tvg-id`, `tvg-name`, `tvg-logo`, `group-title`.
  * Tự động gom nhóm kênh (News, Sports, Movies, Science,...) và hỗ trợ hàng chục nghìn kênh mà không làm treo ứng dụng.
  * Hỗ trợ bật/tắt (Toggle active), cập nhật lại (Refresh) và xóa danh sách.

* **Trình phát Video Hiện đại (Web Player)**:
  * Tích hợp **HLS.js** với cơ chế tự động nhận diện native HLS trên Safari / iOS / macOS.
  * Tự phục hồi lỗi phát sóng (`recoverMediaError`, `startLoad` khi gặp `NETWORK_ERROR`, `MEDIA_ERROR`).
  * Gợi ý chuyển mã 1-click khi luồng gốc gặp lỗi định dạng hoặc mạng người dùng bị bóp băng thông.
  * Đầy đủ điều khiển: Play/Pause, Âm lượng, Toàn màn hình (Fullscreen), Tỉ lệ khung hình (16:9 / 4:3), Làm mới luồng.
  * Đánh dấu kênh Yêu thích (Favorites) và lưu Lịch sử xem gần đây (Recently Watched).

* **Hạ tầng Chuyển mã FFmpeg (Transcoder Engine)**:
  * Module **Transcode Session Manager**: Gộp luồng thông minh (Session Pooling) - khi nhiều người cùng xem 1 kênh và 1 profile, hệ thống chỉ chạy duy nhất 1 tiến trình FFmpeg nhằm tiết kiệm tài nguyên CPU.
  * Tự động tắt tiến trình FFmpeg sau 60 giây nếu không còn người xem (`idle watchdog`).
  * Bảo vệ giới hạn số phiên chuyển mã đồng thời (`MAX_TRANSCODE_SESSIONS`).
  * An toàn tuyệt đối: Sử dụng `spawn(ffmpeg, args)` thay vì `exec()`, triệt tiêu lỗ hổng Command Injection.

* **Chế độ Riêng cho Nokia E72 & Thiết bị Legacy (`/legacy`)**:
  * Giao diện HTML thuần cực nhẹ (~2KB), không chứa JavaScript nặng, tương thích 100% với trình duyệt mặc định của Nokia E72 và Opera Mobile.
  * Profile `nokia_e72`: Độ phân giải chuẩn màn hình E72 **320x240 @ 15fps**, video **H.264 Baseline Level 1.2/1.3** cực nhẹ, âm thanh **AAC Mono 40 kbps @ 22.050 Hz**.
  * Cung cấp luồng stream MPEG-TS trực tiếp và tính năng tải file `.m3u` tương thích hoàn hảo với **CorePlayer 1.36** và **RealPlayer**.

* **EPG (Lịch phát sóng XMLTV)**:
  * Tải và phân tích định dạng XMLTV từ URL hoặc file upload.
  * Tự động đối chiếu theo `tvg-id` để hiển thị chương trình Đang phát (Now) và Kế tiếp (Next).

* **Stream Proxy an toàn & Chống SSRF**:
  * Endpoint `/api/proxy` hỗ trợ chuyển tiếp luồng HTTP/HTTPS, xử lý User-Agent, Referer, Range Header.
  * Tích hợp bộ lọc SSRF chặn các dải IP nội bộ và private: `127.0.0.1`, `localhost`, `10.x.x.x`, `192.168.x.x`, `172.16-31.x.x`, `169.254.x.x` (có chế độ bật tắt LAN Mode).

* **Bảng điều khiển Quản trị (Admin Dashboard)**:
  * Đăng nhập bảo mật.
  * Giám sát thời gian thực: Tải CPU (%), Bộ nhớ RAM sử dụng (MB), Uptime hệ thống, Số session FFmpeg đang hoạt động.
  * Danh sách phiên chuyển mã với nút dừng/hủy (Kill process) tức thì.
  * Nhật ký máy chủ (Server Logs) trực quan theo mức INFO, WARN, ERROR.

---

## 2. CẤU TRÚC THƯ MỤC PROJECT

```text
├── server.ts                       # Entrypoint Express + tích hợp Vite middleware
├── src/
│   ├── types/
│   │   └── iptv.ts                 # Định nghĩa TypeScript interface
│   ├── server/
│   │   ├── config.ts               # Cấu hình biến môi trường
│   │   ├── logger.ts               # Hệ thống ghi nhật ký & lưu lịch sử log
│   │   ├── db.ts                   # Cơ sở dữ liệu SQLite (hỗ trợ chuyển đổi sang PostgreSQL)
│   │   ├── security.ts             # Bộ lọc SSRF, kiểm tra URL và an toàn spawn
│   │   ├── parser.ts               # Bộ phân tích M3U/M3U8 hiệu năng cao
│   │   ├── proxy.ts                # Stream Proxy trung gian có kiểm soát
│   │   ├── transcoder.ts           # Quản lý phiên chuyển mã FFmpeg & Pooling
│   │   ├── epg.ts                  # Bộ phân tích EPG XMLTV
│   │   └── routes/
│   │       ├── api.ts              # REST API (channels, playlists, transcode, admin)
│   │       └── legacy.ts           # Giao diện HTML siêu nhẹ cho Nokia E72
│   ├── components/
│   │   ├── Header.tsx              # Thanh điều hướng và tìm kiếm
│   │   ├── Sidebar.tsx             # Danh mục nhóm kênh
│   │   ├── ChannelList.tsx         # Danh sách kênh, logo, EPG now/next
│   │   ├── VideoPlayer.tsx         # Trình phát HLS.js, profile transcode, điều khiển
│   │   ├── PlaylistModal.tsx       # Quản lý thêm/upload/refresh playlist
│   │   ├── EpgModal.tsx            # Cài đặt EPG XMLTV
│   │   ├── AdminModal.tsx          # Giám sát CPU/RAM, active sessions, kill process
│   │   ├── ExternalPlayerModal.tsx # URL mở ngoài (VLC, PotPlayer, MPV)
│   │   └── LegacyGuideModal.tsx    # Hướng dẫn chi tiết cho Nokia E72
│   ├── App.tsx                     # Giao diện React chính
│   ├── index.css                   # Tailwind CSS và tinh chỉnh thanh cuộn
│   └── main.tsx                    # React client entry point
├── Dockerfile                      # Dockerfile production (Node.js 20 + FFmpeg)
├── docker-compose.yml              # Cấu hình khởi chạy nhanh Docker Compose
├── .env.example                    # Mẫu cấu hình môi trường
├── package.json
└── README.md
```

---

## 3. CÁC PROFILE CHUYỂN MÃ FFMPEG

| Profile | Độ phân giải | FPS | Video Codec | Audio Codec | Bitrate | Container | Mục đích |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **original** | Gốc | Gốc | Copy | Copy | Gốc | HLS (m3u8) | Phát trực tiếp không nén |
| **mobile** | 640x360 | 25 | H.264 (libx264) | AAC | Video: 700k, Audio: 80k | HLS (m3u8) | Tiết kiệm 4G/5G trên Smartphone |
| **low** | 426x240 | 20 | H.264 (libx264) | AAC | Video: 400k, Audio: 64k | HLS (m3u8) | Mạng chập chờn / thiết bị cấu hình thấp |
| **legacy** | 320x240 | 20 | H.264 Baseline 1.3 | AAC | Video: 280k, Audio: 48k | HLS (m3u8) | Thiết bị cũ có hỗ trợ HLS |
| **nokia_e72** | **320x240** | **15** | **H.264 Baseline 1.2** | **AAC Mono** | **Video: 180k, Audio: 40k** | **MPEG-TS (.ts)** | **Tối ưu 100% cho CorePlayer & Nokia E72** |

### Lệnh FFmpeg đại diện cho Nokia E72:
```bash
ffmpeg -hide_banner -loglevel warning -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 5 \
  -i "STREAM_INPUT_URL" \
  -vf "scale=320:240:force_original_aspect_ratio=decrease,pad=320:240:(ow-iw)/2:(oh-ih)/2,fps=15" \
  -c:v libx264 -profile:v baseline -level 1.3 -preset ultrafast -tune zerolatency \
  -b:v 180k -maxrate 220k -bufsize 400k -g 30 \
  -c:a aac -b:a 40k -ar 22050 -ac 1 \
  -f mpegts pipe:1
```

---

## 4. HƯỚNG DẪN CẤU HÌNH VÀ XEM TRÊN NOKIA E72 (SYMBIAN S60v3)

Nokia E72 sử dụng vi xử lý ARM11 xung nhịp 600 MHz cùng 128 MB RAM và màn hình ngang 2.36 inch QVGA (320x240). Để xem mượt mà nhất:

### Phương pháp 1: Sử dụng phần mềm CorePlayer v1.36 (Khuyên dùng)
1. Tải và cài đặt file SIS **CorePlayer 1.36 (Build 7427)** vào thẻ nhớ hoặc bộ nhớ máy Nokia E72.
2. Mở trình duyệt Web của Nokia E72, truy cập cổng Legacy tại: `http://<IP_MAY_CHU>:3000/legacy`.
3. Chọn nhóm kênh &gt; Chọn kênh muốn xem &gt; Bấm **"Tải file Playlist (.m3u) về máy"**.
4. Chọn Mở file bằng **CorePlayer**.
5. *Cách khác:* Trong CorePlayer, chọn **Menu &gt; Open URL...** và nhập trực tiếp đường link:
   `http://<IP_MAY_CHU>:3000/api/transcode/live/<CHANNEL_ID>/nokia_e72.ts`.

### Phương pháp 2: Sử dụng RealPlayer có sẵn trong máy
1. Mở ứng dụng **RealPlayer** trên máy Nokia E72.
2. Vào **Options (Tùy chọn) &gt; Settings (Cài đặt) &gt; Streaming (Truyền tải trực tiếp) &gt; Network (Mạng)**.
3. Chỉnh thông số **Buffer time (Thời gian đệm)** lên **20 - 30 giây** để giữ luồng ổn định khi qua 3G hoặc WiFi.
4. Mở liên kết stream trực tiếp từ trình duyệt web E72.

---

## 5. HƯỚNG DẪN CHẠY LOCAL DEVELOPMENT

### Yêu cầu tiên quyết:
* Node.js v18 trở lên.
* Đã cài đặt FFmpeg trên máy (`sudo apt install ffmpeg` hoặc tải cho Windows/macOS).

### Các bước thực hiện:
```bash
# 1. Clone source code
git clone <REPO_URL> iptv-app
cd iptv-app

# 2. Cài đặt thư viện
npm install

# 3. Tạo file cấu hình môi trường
cp .env.example .env

# 4. Khởi chạy chế độ phát triển (Full-stack)
npm run dev
```
Mở trình duyệt:
* Giao diện chính: `http://localhost:3000/`
* Giao diện Nokia E72 / Legacy: `http://localhost:3000/legacy`
* Kiểm tra API Health: `http://localhost:3000/api/health`

---

## 6. HƯỚNG DẪN DEPLOY TRỰC TIẾP QUA GITHUB LÊN RENDER (KHUYẾN NGHỊ CAO NHẤT)

Render hỗ trợ **Docker Web Service** nguyên bản, hoàn hảo cho các tác vụ Streaming, chuyển mã thời gian thực bằng FFmpeg, kết nối HTTP dài hạn (Streaming pipes) và lưu trữ dữ liệu ổn định trên ổ đĩa mở rộng (Persistent Disk).

### Cách 1: Triển khai 1-Click tự động bằng file `render.yaml` (Render Blueprint)
1. Đẩy mã nguồn dự án lên kho chứa GitHub cá nhân của bạn (`git push origin main`).
2. Truy cập [Render Dashboard](https://dashboard.render.com/) &gt; Bấm **New +** &gt; Chọn **Blueprint**.
3. Chọn Repository GitHub vừa đẩy. Render sẽ tự động đọc file `render.yaml` có sẵn trong source code.
4. Render sẽ tự động thiết lập:
   * **Runtime**: Docker (xây dựng từ file `Dockerfile`).
   * **Port**: Cổng `10000` (tự động ánh xạ sang Node.js).
   * **Ổ cứng lưu trữ**: Mount ổ cứng `iptv-data` 1GB tại đường dẫn `/app/data` (giữ nguyên danh sách kênh và tài khoản admin khi máy chủ restart).
   * **Health Check**: Tự động giám sát tại `/api/health`.
5. Bấm **Apply** và chờ Render hoàn tất build Docker. Ứng dụng sẽ có link công khai dạng `https://iptv-web-app-xxxx.onrender.com`.

### Cách 2: Triển khai thủ công (Manual Web Service)
1. Trên Render Dashboard, bấm **New +** &gt; **Web Service**.
2. Chọn repo GitHub &gt; Chọn **Runtime: Docker**.
3. Tại mục **Environment Variables**, thêm:
   * `PORT`: `10000`
   * `NODE_ENV`: `production`
   * `ADMIN_USERNAME`: `admin`
   * `ADMIN_PASSWORD`: *(mật khẩu của bạn)*
   * `DATABASE_PATH`: `/app/data/iptv.db`
4. Tại mục **Disks**, thêm ổ đĩa:
   * Name: `iptv-data`, Mount Path: `/app/data`, Size: `1 GB`.
5. Bấm **Create Web Service**.

---

## 7. HƯỚNG DẪN DEPLOY TRÊN VERCEL

### Lưu ý kỹ thuật quan trọng về Vercel:
Vercel là nền tảng **Serverless / Edge**, có các đặc điểm:
* Không có sẵn binary hệ thống **FFmpeg**.
* Thời gian timeout tối đa của Serverless Function từ 10s - 60s (không phù hợp để duy trì luồng phát sóng video liên tục hàng giờ hoặc chuyển mã video nặng).

### Cách triển khai tối ưu trên Vercel:
Dự án đã tích hợp sẵn file `vercel.json` chuẩn hóa cho Vite React SPA. Bạn có 2 lựa chọn kiến trúc:

#### Lựa chọn A: Triển khai Frontend độc lập trên Vercel + Backend trên Render (Mô hình Microservices hoàn hảo)
1. Backend (chuyển mã FFmpeg, Proxy luồng, SQLite) chạy trên Render (như mục 6 ở trên), có domain ví dụ: `https://my-iptv-backend.onrender.com`.
2. Đẩy repo lên GitHub, vào [Vercel Dashboard](https://vercel.com/) &gt; **Add New Project** &gt; Chọn repo.
3. Trong phần **Environment Variables** trên Vercel, cấu hình:
   * `VITE_BACKEND_URL`: `https://my-iptv-backend.onrender.com`
4. Bấm **Deploy**. Vercel sẽ build giao diện React cực nhanh trên mạng lưới CDN toàn cầu, tự động gọi API và luồng chuyển mã sang máy chủ Render!

#### Lựa chọn B: Triển khai Frontend thuần trên Vercel (Chỉ xem Direct / Original HLS)
* Nếu bạn chỉ cần phát các luồng HLS trực tiếp từ nguồn nhà mạng mà không cần chuyển mã FFmpeg, chỉ cần bấm Deploy trên Vercel với cấu hình mặc định trong `vercel.json`. Hệ thống sẽ tự động phát hiện nếu thiếu FFmpeg và thông báo gợi ý xem luồng nguyên bản.

---

## 8. TỰ ĐỘNG HÓA CI/CD BẰNG GITHUB ACTIONS

Dự án đã được trang bị sẵn workflow CI/CD tại `.github/workflows/deploy.yml`:
* **Tự động kiểm tra chất lượng mã (Linting & TypeScript Check)** mỗi khi có commit hoặc Pull Request vào nhánh `main`.
* **Tự động đóng gói & kiểm thử Docker build**: Đảm bảo image Docker luôn build thành công trên nền Linux, không bao giờ phát sinh lỗi dependency hay thiếu package.
* **Tự động kích hoạt Render Deploy Hook**: Nếu bạn thêm secret `RENDER_DEPLOY_HOOK_URL` trong mục **Settings &gt; Secrets and variables &gt; Actions** của repo GitHub, mỗi lần bạn `git push` lên `main`, Render sẽ tự động kích hoạt deploy bản mới nhất!

---

## 9. HƯỚNG DẪN DEPLOY TRÊN VPS UBUNTU (22.04 / 24.04) BẰNG DOCKER

### Bước 1: Cài đặt Docker & Docker Compose
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw

# Cài đặt Docker chính thức
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

### Bước 2: Clone source code & cấu hình .env
```bash
git clone <REPO_URL> /opt/iptv-app
cd /opt/iptv-app
cp .env.example .env
nano .env
```
*Điền các thông số quản trị viên và mật khẩu mong muốn.*

### Bước 3: Khởi chạy container
```bash
docker compose up -d --build
```
Kiểm tra container đang chạy:
```bash
docker compose ps
docker compose logs -f
```

---

## 10. CẤU HÌNH NGINX REVERSE PROXY VÀ SSL HTTPS (LET'S ENCRYPT)

Nếu bạn có tên miền trỏ về VPS (ví dụ: `iptv.example.com`):

### Cài đặt Nginx và Certbot:
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### Tạo file cấu hình Nginx:
Tạo file `/etc/nginx/sites-available/iptv`:
```nginx
server {
    server_name iptv.example.com;

    client_max_body_size 60M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Cấu hình truyền tải luồng video không đệm
        proxy_buffering off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

Kích hoạt cấu hình và cấp chứng chỉ SSL:
```bash
sudo ln -s /etc/nginx/sites-available/iptv /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Cấp chứng chỉ HTTPS miễn phí
sudo certbot --nginx -d iptv.example.com
```

*Lưu ý cho Nokia E72:* Trình duyệt cổ và CorePlayer của Nokia E72 không hỗ trợ các chuẩn mã hóa SSL/TLS 1.3 mới. Do đó nên để cổng HTTP thường (port 3000 hoặc alias HTTP riêng) để E72 kết nối trực tiếp không bị lỗi SSL Handshake.

---

## 11. TÀI LIỆU REST API

| Phương thức | Đường dẫn | Chức năng | Tham số / Body |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Kiểm tra trạng thái hệ thống, FFmpeg, DB | Không |
| `GET` | `/api/channels` | Lấy danh sách kênh đã lưu | `group`, `search`, `favorites`, `limit`, `offset` |
| `GET` | `/api/channels/:id` | Xem chi tiết 1 kênh và thông tin EPG | `id` |
| `POST` | `/api/channels/:id/favorite` | Thêm / Bỏ yêu thích kênh | `id` |
| `POST` | `/api/channels/:id/history` | Ghi nhận kênh vừa xem | `id` |
| `GET` | `/api/history` | Lấy 30 kênh vừa xem gần đây | Không |
| `GET` | `/api/groups` | Danh sách các nhóm kênh và số lượng | Không |
| `GET` | `/api/playlists` | Danh sách các playlist đã thêm | Không |
| `POST` | `/api/playlists` | Thêm playlist từ URL hoặc text | `{ "name": "...", "url": "..." }` |
| `POST` | `/api/playlists/upload` | Upload file `.m3u` / `.m3u8` | `multipart/form-data` |
| `POST` | `/api/playlists/:id/refresh` | Tải lại danh sách từ URL | `id` |
| `DELETE` | `/api/playlists/:id` | Xóa playlist và toàn bộ kênh của playlist | `id` |
| `POST` | `/api/transcode/start` | Khởi động phiên chuyển mã FFmpeg | `{ "channelId": "...", "profile": "..." }` |
| `POST` | `/api/transcode/stop` | Dừng phiên chuyển mã FFmpeg | `{ "channelId": "...", "profile": "..." }` |
| `GET` | `/api/transcode/sessions` | Xem danh sách các phiên chuyển mã đang chạy | Không |
| `GET` | `/api/transcode/live/:id/:profile.ts` | Luồng MPEG-TS liên tục cho CorePlayer / VLC | `id`, `profile` |
| `GET` | `/api/proxy` | Stream proxy an toàn chống SSRF | `url`, `referer`, `userAgent` |
| `POST` | `/api/epg/fetch` | Tải lịch XMLTV từ URL | `{ "url": "..." }` |
| `GET` | `/api/admin/metrics` | Lấy tải CPU, RAM, thời gian chạy hệ thống | Không |
| `GET` | `/api/admin/logs` | Lấy danh sách nhật ký hệ thống | `limit` |

---

## 9. CHECKLIST KIỂM THỬ TRƯỚC PRODUCTION

1. [x] Kiểm tra URL đầu vào với bộ lọc SSRF (đã chặn 127.0.0.1, 192.168.x.x, 10.x.x.x).
2. [x] Kiểm tra Command Injection (chỉ dùng `spawn`, không dùng `exec` nối chuỗi).
3. [x] Kiểm tra rò rỉ tiến trình FFmpeg (đã có bộ dọn dẹp sau 60 giây không có kết nối).
4. [x] Kiểm tra khả năng xử lý playlist lớn (batch insert theo từng khối trong transaction SQLite).
5. [x] Kiểm tra phát luồng HLS.js trên máy tính và điện thoại thông minh.
6. [x] Kiểm tra giao diện `/legacy` trên màn hình chuẩn 320x240 không có lỗi bố cục.
7. [x] Kiểm tra endpoint trực tiếp `.ts` cho CorePlayer trên thiết bị Symbian.
