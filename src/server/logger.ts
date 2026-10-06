import { LogEntry } from '../types/iptv.ts';

const MAX_LOGS = 300;
const logHistory: LogEntry[] = [];

export function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, context?: Record<string, unknown>) {
  const entry: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    level,
    message,
    context
  };

  logHistory.unshift(entry);
  if (logHistory.length > MAX_LOGS) {
    logHistory.pop();
  }

  const prefix = `[${entry.timestamp}] [${level}]`;
  if (level === 'ERROR') {
    console.error(prefix, message, context || '');
  } else if (level === 'WARN') {
    console.warn(prefix, message, context || '');
  } else {
    console.log(prefix, message, context || '');
  }

  return entry;
}

export function getLogs(limit = 100): LogEntry[] {
  return logHistory.slice(0, limit);
}

export const logger = {
  info: (msg: string, ctx?: Record<string, unknown>) => log('INFO', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => log('WARN', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log('ERROR', msg, ctx),
  getLogs
};
