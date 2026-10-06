import { XMLParser } from 'fast-xml-parser';
import { dbService } from './db.ts';
import { logger } from './logger.ts';
import { EpgProgram } from '../types/iptv.ts';
import { validateStreamUrl } from './security.ts';

// Parse XMLTV date format: "20261005180000 +0000" or "20261005180000"
function parseXmltvDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString();
  try {
    const clean = dateStr.trim();
    const year = parseInt(clean.substring(0, 4), 10);
    const month = parseInt(clean.substring(4, 6), 10) - 1;
    const day = parseInt(clean.substring(6, 8), 10);
    const hour = parseInt(clean.substring(8, 10), 10);
    const min = parseInt(clean.substring(10, 12), 10);
    const sec = parseInt(clean.substring(12, 14), 10) || 0;

    // Check timezone offset if present
    const tzMatch = clean.match(/([+-]\d{4})$/);
    if (tzMatch) {
      const tzStr = tzMatch[1];
      const tzSign = tzStr[0] === '+' ? 1 : -1;
      const tzHours = parseInt(tzStr.substring(1, 3), 10);
      const tzMins = parseInt(tzStr.substring(3, 5), 10);
      const totalOffsetMinutes = tzSign * (tzHours * 60 + tzMins);

      // Create UTC timestamp
      const utcMs = Date.UTC(year, month, day, hour, min, sec) - totalOffsetMinutes * 60000;
      return new Date(utcMs).toISOString();
    }

    return new Date(Date.UTC(year, month, day, hour, min, sec)).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

export async function fetchAndParseXmltv(xmltvUrl: string): Promise<number> {
  const val = validateStreamUrl(xmltvUrl);
  if (!val.valid || !val.parsedUrl) {
    throw new Error(`Invalid XMLTV URL: ${val.error}`);
  }

  logger.info(`Fetching XMLTV EPG from: ${xmltvUrl}`);
  const response = await fetch(xmltvUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 IPTV-EPG-Fetcher/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP Error fetching XMLTV: ${response.status} ${response.statusText}`);
  }

  const xmlText = await response.text();
  return parseXmltvString(xmlText);
}

export async function parseXmltvString(xmlContent: string): Promise<number> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_'
  });

  const parsed = parser.parse(xmlContent);
  if (!parsed || !parsed.tv) {
    throw new Error('Invalid XMLTV format: missing <tv> root element');
  }

  const programmes = parsed.tv.programme;
  if (!programmes) {
    return 0;
  }

  const progList = Array.isArray(programmes) ? programmes : [programmes];
  const epgPrograms: EpgProgram[] = [];

  for (let i = 0; i < progList.length; i++) {
    const item = progList[i];
    const channelId = item['@_channel'];
    if (!channelId) continue;

    const start = parseXmltvDate(item['@_start']);
    const stop = parseXmltvDate(item['@_stop']);

    let title = 'Chương trình';
    if (typeof item.title === 'string') {
      title = item.title;
    } else if (item.title && typeof item.title['#text'] === 'string') {
      title = item.title['#text'];
    }

    let description = '';
    if (typeof item.desc === 'string') {
      description = item.desc;
    } else if (item.desc && typeof item.desc['#text'] === 'string') {
      description = item.desc['#text'];
    }

    epgPrograms.push({
      id: `epg-${channelId}-${i}-${Date.now().toString(36)}`,
      channelTvgId: channelId,
      title: title.trim(),
      description: description.trim(),
      start,
      stop
    });
  }

  if (epgPrograms.length > 0) {
    // Insert in batches of 500 to avoid exceeding SQLite param limit
    const batchSize = 500;
    for (let i = 0; i < epgPrograms.length; i += batchSize) {
      const chunk = epgPrograms.slice(i, i + batchSize);
      await dbService.insertEpgPrograms(chunk);
    }
  }

  logger.info(`Successfully parsed and stored ${epgPrograms.length} EPG programs.`);
  return epgPrograms.length;
}
