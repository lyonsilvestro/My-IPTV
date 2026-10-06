import { Channel } from '../types/iptv.ts';

// Extract attribute safely from an EXTINF line
function extractAttribute(line: string, attr: string): string {
  // Matches attr="value" or attr='value' or attr=value
  const regex = new RegExp(`${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s,]+))`, 'i');
  const match = line.match(regex);
  if (match) {
    return (match[1] ?? match[2] ?? match[3] ?? '').trim();
  }
  return '';
}

// Extract channel name from end of EXTINF line (after last comma)
function extractChannelName(line: string): string {
  const commaIdx = line.lastIndexOf(',');
  if (commaIdx !== -1) {
    const name = line.substring(commaIdx + 1).trim();
    if (name) return name;
  }
  return 'Unnamed Channel';
}

export function parseM3U(content: string, playlistId: string): Omit<Channel, 'isFavorite'>[] {
  const channels: Omit<Channel, 'isFavorite'>[] = [];
  const lines = content.split(/\r?\n/);
  const totalLines = lines.length;

  let currentExtInf: string | null = null;
  let channelIndex = 0;

  for (let i = 0; i < totalLines; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      currentExtInf = line;
      continue;
    }

    if (line.startsWith('#')) {
      // Other metadata or tags like #EXTVLCOPT, #EXTGRP, etc.
      if (line.startsWith('#EXTGRP:') && currentExtInf) {
        // Can override group if not in EXTINF
        const grp = line.substring(8).trim();
        if (grp && !extractAttribute(currentExtInf, 'group-title')) {
          currentExtInf += ` group-title="${grp}"`;
        }
      }
      continue;
    }

    // It's a stream URL
    if (currentExtInf && (line.startsWith('http://') || line.startsWith('https://') || line.startsWith('rtsp://') || line.startsWith('/'))) {
      const tvgId = extractAttribute(currentExtInf, 'tvg-id');
      const tvgName = extractAttribute(currentExtInf, 'tvg-name');
      const tvgLogo = extractAttribute(currentExtInf, 'tvg-logo');
      let group = extractAttribute(currentExtInf, 'group-title');
      if (!group) group = 'General';

      let name = extractChannelName(currentExtInf);
      if (!name || name === 'Unnamed Channel') {
        name = tvgName || tvgId || `Channel ${channelIndex + 1}`;
      }

      channelIndex++;
      const id = `${playlistId}-ch-${channelIndex}`;

      channels.push({
        id,
        playlistId,
        name,
        logo: tvgLogo,
        group,
        url: line,
        tvgId: tvgId || tvgName,
        tvgName: tvgName || name,
        orderIndex: channelIndex
      });

      currentExtInf = null;
    }
  }

  return channels;
}
