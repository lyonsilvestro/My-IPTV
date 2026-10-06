import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { config } from './config.ts';
import { logger } from './logger.ts';
import { Channel, ChannelWithEpg, EpgProgram, Playlist } from '../types/iptv.ts';

let dbInstance: Database | null = null;
let saveTimeout: NodeJS.Timeout | null = null;

function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveToDisk();
  }, 400);
}

function saveToDisk() {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    const tempPath = `${config.dbPath}.tmp`;
    fs.writeFileSync(tempPath, buffer);
    fs.renameSync(tempPath, config.dbPath);
  } catch (err) {
    logger.error('Failed to save database to disk', { error: String(err) });
  }
}

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  const SQL = await initSqlJs();
  let db: Database;

  if (fs.existsSync(config.dbPath)) {
    try {
      const fileBuffer = fs.readFileSync(config.dbPath);
      db = new SQL.Database(fileBuffer);
      logger.info(`Loaded existing database from ${config.dbPath}`);
    } catch (err) {
      logger.warn(`Corrupt database file, creating fresh database: ${err}`);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
    logger.info(`Initialized new SQLite database at ${config.dbPath}`);
  }

  // Schema initialization
  db.run(`
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT,
      type TEXT NOT NULL,
      channelCount INTEGER DEFAULT 0,
      isActive INTEGER DEFAULT 1,
      lastUpdated TEXT,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      playlistId TEXT NOT NULL,
      name TEXT NOT NULL,
      logo TEXT,
      groupTitle TEXT,
      url TEXT NOT NULL,
      tvgId TEXT,
      tvgName TEXT,
      orderIndex INTEGER DEFAULT 0,
      FOREIGN KEY(playlistId) REFERENCES playlists(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_channels_group ON channels(groupTitle);
    CREATE INDEX IF NOT EXISTS idx_channels_playlist ON channels(playlistId);
    CREATE INDEX IF NOT EXISTS idx_channels_tvgId ON channels(tvgId);

    CREATE TABLE IF NOT EXISTS favorites (
      channelId TEXT PRIMARY KEY,
      addedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      channelId TEXT NOT NULL,
      viewedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS epg_programs (
      id TEXT PRIMARY KEY,
      channelTvgId TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      start TEXT NOT NULL,
      stop TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_epg_tvgId ON epg_programs(channelTvgId);
    CREATE INDEX IF NOT EXISTS idx_epg_time ON epg_programs(start, stop);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  dbInstance = db;
  saveToDisk();
  return db;
}

// Helper to convert rows
function stmtToObjects<T>(db: Database, sql: string, params: (string | number | null)[] = []): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results: T[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as unknown as T;
    results.push(row);
  }
  stmt.free();
  return results;
}

export const dbService = {
  async getAllPlaylists(): Promise<Playlist[]> {
    const db = await getDb();
    const rows = stmtToObjects<any>(db, 'SELECT * FROM playlists ORDER BY createdAt DESC');
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      url: r.url || undefined,
      type: r.type,
      channelCount: r.channelCount || 0,
      isActive: Boolean(r.isActive),
      lastUpdated: r.lastUpdated,
      createdAt: r.createdAt
    }));
  },

  async getPlaylist(id: string): Promise<Playlist | null> {
    const db = await getDb();
    const rows = stmtToObjects<any>(db, 'SELECT * FROM playlists WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      url: r.url || undefined,
      type: r.type,
      channelCount: r.channelCount || 0,
      isActive: Boolean(r.isActive),
      lastUpdated: r.lastUpdated,
      createdAt: r.createdAt
    };
  },

  async savePlaylist(playlist: Playlist): Promise<void> {
    const db = await getDb();
    db.run(
      `INSERT OR REPLACE INTO playlists (id, name, url, type, channelCount, isActive, lastUpdated, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        playlist.id,
        playlist.name,
        playlist.url || null,
        playlist.type,
        playlist.channelCount,
        playlist.isActive ? 1 : 0,
        playlist.lastUpdated,
        playlist.createdAt
      ]
    );
    scheduleSave();
  },

  async deletePlaylist(id: string): Promise<void> {
    const db = await getDb();
    db.run('DELETE FROM channels WHERE playlistId = ?', [id]);
    db.run('DELETE FROM playlists WHERE id = ?', [id]);
    scheduleSave();
  },

  async togglePlaylistActive(id: string, active: boolean): Promise<void> {
    const db = await getDb();
    db.run('UPDATE playlists SET isActive = ? WHERE id = ?', [active ? 1 : 0, id]);
    scheduleSave();
  },

  async insertChannelsBatch(channels: Omit<Channel, 'isFavorite'>[]): Promise<void> {
    const db = await getDb();
    db.run('BEGIN TRANSACTION;');
    try {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO channels (id, playlistId, name, logo, groupTitle, url, tvgId, tvgName, orderIndex)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < channels.length; i++) {
        const c = channels[i];
        stmt.run([
          c.id,
          c.playlistId,
          c.name,
          c.logo || '',
          c.group || 'Other',
          c.url,
          c.tvgId || '',
          c.tvgName || '',
          c.orderIndex ?? i
        ]);
      }
      stmt.free();
      db.run('COMMIT;');
    } catch (e) {
      db.run('ROLLBACK;');
      throw e;
    }
    scheduleSave();
  },

  async deleteChannelsByPlaylist(playlistId: string): Promise<void> {
    const db = await getDb();
    db.run('DELETE FROM channels WHERE playlistId = ?', [playlistId]);
    scheduleSave();
  },

  async getGroups(): Promise<{ name: string; count: number }[]> {
    const db = await getDb();
    const rows = stmtToObjects<any>(db, `
      SELECT c.groupTitle as name, COUNT(c.id) as count
      FROM channels c
      JOIN playlists p ON c.playlistId = p.id
      WHERE p.isActive = 1
      GROUP BY c.groupTitle
      ORDER BY count DESC, c.groupTitle ASC
    `);
    return rows.map(r => ({ name: r.name || 'Other', count: r.count }));
  },

  async getChannels(params: {
    group?: string;
    search?: string;
    onlyFavorites?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ channels: ChannelWithEpg[]; total: number }> {
    const db = await getDb();
    let whereClauses = ['p.isActive = 1'];
    const sqlParams: (string | number)[] = [];

    if (params.onlyFavorites) {
      whereClauses.push('f.channelId IS NOT NULL');
    }

    if (params.group && params.group !== 'All') {
      whereClauses.push('c.groupTitle = ?');
      sqlParams.push(params.group);
    }

    if (params.search && params.search.trim()) {
      const term = `%${params.search.trim()}%`;
      whereClauses.push('(c.name LIKE ? OR c.groupTitle LIKE ? OR c.tvgId LIKE ?)');
      sqlParams.push(term, term, term);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count
    const countRows = stmtToObjects<{ total: number }>(
      db,
      `SELECT COUNT(c.id) as total
       FROM channels c
       JOIN playlists p ON c.playlistId = p.id
       LEFT JOIN favorites f ON c.id = f.channelId
       ${whereSql}`,
      sqlParams
    );
    const total = countRows[0]?.total || 0;

    // Fetch channels
    const limit = params.limit || 500;
    const offset = params.offset || 0;

    const dataRows = stmtToObjects<any>(
      db,
      `SELECT c.*, (f.channelId IS NOT NULL) as isFav
       FROM channels c
       JOIN playlists p ON c.playlistId = p.id
       LEFT JOIN favorites f ON c.id = f.channelId
       ${whereSql}
       ORDER BY c.orderIndex ASC, c.name ASC
       LIMIT ? OFFSET ?`,
      [...sqlParams, limit, offset]
    );

    const nowIso = new Date().toISOString();

    const channels: ChannelWithEpg[] = dataRows.map(r => {
      let nowPlaying: EpgProgram | null = null;
      let nextPlaying: EpgProgram | null = null;

      if (r.tvgId) {
        // Query Now
        const nowRows = stmtToObjects<any>(
          db,
          `SELECT * FROM epg_programs
           WHERE channelTvgId = ? AND start <= ? AND stop > ?
           ORDER BY start DESC LIMIT 1`,
          [r.tvgId, nowIso, nowIso]
        );
        if (nowRows.length > 0) {
          nowPlaying = {
            id: nowRows[0].id,
            channelTvgId: nowRows[0].channelTvgId,
            title: nowRows[0].title,
            description: nowRows[0].description || '',
            start: nowRows[0].start,
            stop: nowRows[0].stop
          };
        }

        // Query Next
        const nextRows = stmtToObjects<any>(
          db,
          `SELECT * FROM epg_programs
           WHERE channelTvgId = ? AND start >= ?
           ORDER BY start ASC LIMIT 1`,
          [r.tvgId, nowIso]
        );
        if (nextRows.length > 0) {
          nextPlaying = {
            id: nextRows[0].id,
            channelTvgId: nextRows[0].channelTvgId,
            title: nextRows[0].title,
            description: nextRows[0].description || '',
            start: nextRows[0].start,
            stop: nextRows[0].stop
          };
        }
      }

      return {
        id: r.id,
        playlistId: r.playlistId,
        name: r.name,
        logo: r.logo,
        group: r.groupTitle,
        url: r.url,
        tvgId: r.tvgId,
        tvgName: r.tvgName,
        orderIndex: r.orderIndex,
        isFavorite: Boolean(r.isFav),
        nowPlaying,
        nextPlaying
      };
    });

    return { channels, total };
  },

  async getChannelById(id: string): Promise<ChannelWithEpg | null> {
    const db = await getDb();
    const rows = stmtToObjects<any>(
      db,
      `SELECT c.*, (f.channelId IS NOT NULL) as isFav
       FROM channels c
       LEFT JOIN favorites f ON c.id = f.channelId
       WHERE c.id = ?`,
      [id]
    );
    if (rows.length === 0) return null;
    const r = rows[0];

    const nowIso = new Date().toISOString();
    let nowPlaying: EpgProgram | null = null;
    let nextPlaying: EpgProgram | null = null;

    if (r.tvgId) {
      const nowRows = stmtToObjects<any>(
        db,
        `SELECT * FROM epg_programs
         WHERE channelTvgId = ? AND start <= ? AND stop > ?
         ORDER BY start DESC LIMIT 1`,
        [r.tvgId, nowIso, nowIso]
      );
      if (nowRows.length > 0) {
        nowPlaying = {
          id: nowRows[0].id,
          channelTvgId: nowRows[0].channelTvgId,
          title: nowRows[0].title,
          description: nowRows[0].description || '',
          start: nowRows[0].start,
          stop: nowRows[0].stop
        };
      }

      const nextRows = stmtToObjects<any>(
        db,
        `SELECT * FROM epg_programs
         WHERE channelTvgId = ? AND start >= ?
         ORDER BY start ASC LIMIT 1`,
        [r.tvgId, nowIso]
      );
      if (nextRows.length > 0) {
        nextPlaying = {
          id: nextRows[0].id,
          channelTvgId: nextRows[0].channelTvgId,
          title: nextRows[0].title,
          description: nextRows[0].description || '',
          start: nextRows[0].start,
          stop: nextRows[0].stop
        };
      }
    }

    return {
      id: r.id,
      playlistId: r.playlistId,
      name: r.name,
      logo: r.logo,
      group: r.groupTitle,
      url: r.url,
      tvgId: r.tvgId,
      tvgName: r.tvgName,
      orderIndex: r.orderIndex,
      isFavorite: Boolean(r.isFav),
      nowPlaying,
      nextPlaying
    };
  },

  async toggleFavorite(channelId: string): Promise<boolean> {
    const db = await getDb();
    const existing = stmtToObjects<any>(db, 'SELECT channelId FROM favorites WHERE channelId = ?', [channelId]);
    if (existing.length > 0) {
      db.run('DELETE FROM favorites WHERE channelId = ?', [channelId]);
      scheduleSave();
      return false;
    } else {
      db.run('INSERT INTO favorites (channelId, addedAt) VALUES (?, ?)', [channelId, new Date().toISOString()]);
      scheduleSave();
      return true;
    }
  },

  async addHistory(channelId: string): Promise<void> {
    const db = await getDb();
    const id = `hist-${Date.now()}`;
    db.run('INSERT INTO history (id, channelId, viewedAt) VALUES (?, ?, ?)', [id, channelId, new Date().toISOString()]);
    // Keep last 50 history entries
    db.run(`
      DELETE FROM history WHERE id NOT IN (
        SELECT id FROM history ORDER BY viewedAt DESC LIMIT 50
      )
    `);
    scheduleSave();
  },

  async getRecentHistory(limit = 20): Promise<ChannelWithEpg[]> {
    const db = await getDb();
    const rows = stmtToObjects<any>(
      db,
      `SELECT c.*, (f.channelId IS NOT NULL) as isFav, h.viewedAt
       FROM history h
       JOIN channels c ON h.channelId = c.id
       LEFT JOIN favorites f ON c.id = f.channelId
       ORDER BY h.viewedAt DESC
       LIMIT ?`,
      [limit]
    );

    return rows.map(r => ({
      id: r.id,
      playlistId: r.playlistId,
      name: r.name,
      logo: r.logo,
      group: r.groupTitle,
      url: r.url,
      tvgId: r.tvgId,
      tvgName: r.tvgName,
      orderIndex: r.orderIndex,
      isFavorite: Boolean(r.isFav)
    }));
  },

  async insertEpgPrograms(programs: EpgProgram[]): Promise<void> {
    const db = await getDb();
    db.run('BEGIN TRANSACTION;');
    try {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO epg_programs (id, channelTvgId, title, description, start, stop)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const p of programs) {
        stmt.run([p.id, p.channelTvgId, p.title, p.description || '', p.start, p.stop]);
      }
      stmt.free();
      db.run('COMMIT;');
    } catch (e) {
      db.run('ROLLBACK;');
      throw e;
    }
    scheduleSave();
  },

  async clearEpg(): Promise<void> {
    const db = await getDb();
    db.run('DELETE FROM epg_programs;');
    scheduleSave();
  },

  async getSetting(key: string, defaultValue = ''): Promise<string> {
    const db = await getDb();
    const rows = stmtToObjects<any>(db, 'SELECT value FROM settings WHERE key = ?', [key]);
    if (rows.length === 0) return defaultValue;
    return rows[0].value ?? defaultValue;
  },

  async setSetting(key: string, value: string): Promise<void> {
    const db = await getDb();
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    scheduleSave();
  },

  async getStats(): Promise<{ playlistCount: number; channelCount: number }> {
    const db = await getDb();
    const plRows = stmtToObjects<{ cnt: number }>(db, 'SELECT COUNT(id) as cnt FROM playlists');
    const chRows = stmtToObjects<{ cnt: number }>(db, 'SELECT COUNT(id) as cnt FROM channels');
    return {
      playlistCount: plRows[0]?.cnt || 0,
      channelCount: chRows[0]?.cnt || 0
    };
  }
};
