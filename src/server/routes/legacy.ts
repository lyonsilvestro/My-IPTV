import { Router, Request, Response } from 'express';
import { dbService } from '../db.ts';
import { transcodeManager, PROFILES } from '../transcoder.ts';
import { sanitizePath } from '../security.ts';
import { config } from '../config.ts';

const router = Router();

// HTML page for legacy Symbian / Nokia E72 devices
router.get('/', async (req: Request, res: Response) => {
  const selectedGroup = req.query.group as string;
  const groups = await dbService.getGroups();
  const { channels } = await dbService.getChannels({
    group: selectedGroup && selectedGroup !== 'All' ? selectedGroup : undefined,
    limit: 100
  });

  const baseUrl = config.legacyBaseUrl || `${req.protocol}://${req.get('host')}`;

  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=320, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>IPTV Nokia E72 & Legacy</title>
  <style>
    body { background: #121212; color: #f0f0f0; font-family: Tahoma, Arial, sans-serif; font-size: 13px; margin: 4px; padding: 0; }
    h1 { font-size: 14px; margin: 4px 0; color: #ff9800; border-bottom: 1px solid #333; padding-bottom: 2px; }
    h2 { font-size: 13px; margin: 4px 0; color: #4caf50; }
    a { color: #64b5f6; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .box { background: #1e1e1e; border: 1px solid #333; padding: 4px; margin-bottom: 6px; }
    .btn { display: inline-block; background: #2e7d32; color: #fff; padding: 4px 8px; margin: 2px 0; font-weight: bold; border-radius: 2px; }
    .btn-orange { background: #e65100; }
    .nav-bar { background: #263238; padding: 4px; margin-bottom: 6px; }
    .ch-item { border-bottom: 1px dotted #333; padding: 4px 0; }
    .small { font-size: 11px; color: #aaa; }
    select, input[type=submit] { font-size: 12px; background: #222; color: #fff; border: 1px solid #555; padding: 2px; }
  </style>
</head>
<body>
  <div class="nav-bar">
    <strong>[IPTV Mobile & Symbian S60]</strong> | <a href="${baseUrl}/">Web HD</a>
  </div>

  <div class="box">
    <h1>1. CHỌN NHÓM KÊNH</h1>
    <form method="get" action="${baseUrl}/legacy">
      <select name="group">
        <option value="All">-- Tất cả nhóm (${groups.reduce((a, b) => a + b.count, 0)}) --</option>
        ${groups.map(g => `<option value="${escapeHtml(g.name)}" ${g.name === selectedGroup ? 'selected' : ''}>${escapeHtml(g.name)} (${g.count})</option>`).join('')}
      </select>
      <input type="submit" value="Lọc">
    </form>
  </div>

  <div class="box">
    <h1>2. DANH SÁCH KÊNH (${channels.length})</h1>
    ${channels.length === 0 ? '<p>Chưa có kênh nào trong nhóm này. Hãy thêm playlist trong bản Web.</p>' : ''}
    ${channels.map(ch => `
      <div class="ch-item">
        <strong><a href="${baseUrl}/legacy/channel/${ch.id}">${escapeHtml(ch.name)}</a></strong>
        <span class="small">[${escapeHtml(ch.group)}]</span><br>
        <a class="btn btn-orange" href="${baseUrl}/legacy/channel/${ch.id}">Mở Xem / Stream Link</a>
      </div>
    `).join('')}
  </div>

  <div class="box small">
    <strong>Hướng dẫn Nokia E72:</strong><br>
    - Sử dụng CorePlayer 1.36 hoặc RealPlayer.<br>
    - Chọn kênh -> Chọn link "Nokia E72 Stream (CorePlayer)".<br>
    - Độ phân giải: 320x240, 15fps, H.264 Baseline / AAC Mono.
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// Channel details & stream URLs for Nokia E72
router.get('/channel/:id', async (req: Request, res: Response) => {
  const channel = await dbService.getChannelById(req.params.id);
  if (!channel) {
    res.status(404).send('Không tìm thấy kênh này');
    return;
  }

  const baseUrl = config.legacyBaseUrl || `${req.protocol}://${req.get('host')}`;
  const cleanId = sanitizePath(channel.id);
  const nokiaStreamUrl = `${baseUrl}/api/transcode/live/${cleanId}/nokia_e72.ts`;
  const lowStreamUrl = `${baseUrl}/api/transcode/live/${cleanId}/low.ts`;
  const nokiaHlsUrl = `${baseUrl}/api/transcode/hls/${cleanId}/nokia_e72/index.m3u8`;
  const directProxyUrl = `${baseUrl}/api/proxy?url=${encodeURIComponent(channel.url)}`;

  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=320, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${escapeHtml(channel.name)} - Nokia E72 Player</title>
  <style>
    body { background: #121212; color: #f0f0f0; font-family: Tahoma, Arial, sans-serif; font-size: 13px; margin: 4px; padding: 0; }
    h1 { font-size: 15px; margin: 4px 0; color: #ff9800; border-bottom: 1px solid #333; padding-bottom: 2px; }
    a { color: #64b5f6; text-decoration: none; }
    .box { background: #1e1e1e; border: 1px solid #333; padding: 6px; margin-bottom: 6px; }
    .btn { display: block; text-align: center; background: #e65100; color: #fff; padding: 8px 4px; margin: 4px 0; font-weight: bold; border-radius: 3px; font-size: 13px; }
    .btn-green { background: #2e7d32; }
    .btn-blue { background: #1565c0; }
    .url-box { background: #000; border: 1px solid #444; padding: 4px; font-family: monospace; font-size: 11px; word-break: break-all; color: #00e676; margin: 4px 0; }
    .small { font-size: 11px; color: #aaa; }
  </style>
</head>
<body>
  <div class="box">
    <a href="${baseUrl}/legacy">&laquo; Quay lại danh sách kênh</a>
    <h1>KÊNH: ${escapeHtml(channel.name)}</h1>
    <div class="small">Nhóm: ${escapeHtml(channel.group)} | ID: ${escapeHtml(channel.id)}</div>
    ${channel.nowPlaying ? `<div class="small" style="color:#ffb74d; margin-top:2px;">Đang phát: ${escapeHtml(channel.nowPlaying.title)}</div>` : ''}
  </div>

  <div class="box">
    <strong>STREAM DÀNH CHO NOKIA E72 / COREPLAYER:</strong>
    <p class="small">Profile: 320x240 @ 15fps, H.264 Baseline 1.2, AAC Mono (Cực nhẹ)</p>
    <a class="btn" href="${nokiaStreamUrl}">Phát MPEG-TS Stream (CorePlayer)</a>
    <div class="url-box">${nokiaStreamUrl}</div>

    <a class="btn btn-blue" href="${baseUrl}/legacy/m3u/${cleanId}">Tải file Playlist (.m3u) về máy</a>
  </div>

  <div class="box">
    <strong>CÁC CHẾ ĐỘ STREAM KHÁC:</strong>
    <a class="btn btn-green" href="${lowStreamUrl}">Low Quality 240p MPEG-TS</a>
    <a class="btn btn-blue" href="${nokiaHlsUrl}">HLS Stream (Browser / VLC)</a>
    <a class="btn btn-green" href="${directProxyUrl}">Direct Stream Proxy (Original)</a>
  </div>

  <div class="box small">
    <strong>Cách mở trên Nokia E72:</strong><br>
    1. Mở ứng dụng <b>CorePlayer</b> trên Symbian E72.<br>
    2. Chọn <b>Menu &gt; Open URL...</b><br>
    3. Nhập URL MPEG-TS màu xanh lá ở trên.<br>
    4. Hoặc bấm tải file .m3u, CorePlayer sẽ tự nhận dạng và phát.
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// Generate a downloadable M3U file specifically for CorePlayer on Nokia E72
router.get('/m3u/:id', async (req: Request, res: Response) => {
  const channel = await dbService.getChannelById(req.params.id);
  if (!channel) {
    res.status(404).send('Channel not found');
    return;
  }

  const baseUrl = config.legacyBaseUrl || `${req.protocol}://${req.get('host')}`;
  const cleanId = sanitizePath(channel.id);
  const streamUrl = `${baseUrl}/api/transcode/live/${cleanId}/nokia_e72.ts`;

  const m3uContent = `#EXTM3U\n#EXTINF:-1 tvg-name="${channel.name}" group-title="${channel.group}",${channel.name}\n${streamUrl}\n`;

  res.setHeader('Content-Type', 'audio/x-mpegurl');
  res.setHeader('Content-Disposition', `attachment; filename="${cleanId}-nokia.m3u"`);
  res.send(m3uContent);
});

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default router;
