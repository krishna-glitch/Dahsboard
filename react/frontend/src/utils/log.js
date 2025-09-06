// Simple logging utility with level gating
// Usage: import { log } from '../utils/log'; log.debug('msg', ctx)

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const envLevel = (import.meta?.env?.VITE_LOG_LEVEL || 'debug').toLowerCase();
const CURRENT = LEVELS[envLevel] ?? LEVELS.debug;

function out(level, args) {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
   
  (console[level] || console.log).apply(console, [prefix, ...args]);
}

export const log = {
  debug: (...args) => { if (CURRENT <= LEVELS.debug) out('debug', args); },
  info: (...args) => { if (CURRENT <= LEVELS.info) out('info', args); },
  warn: (...args) => { if (CURRENT <= LEVELS.warn) out('warn', args); },
  error: (...args) => out('error', args),
};

