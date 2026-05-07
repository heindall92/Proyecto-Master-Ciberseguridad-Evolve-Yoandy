/**
 * Valhalla SOC — Centralized Frontend Logger
 * Only outputs to console in development mode.
 * In production, all logging is silently suppressed.
 */

const isDev = import.meta.env.DEV;

export const logger = {
  log: (...args: unknown[]): void => {
    if (isDev) console.log('[Valhalla]', ...args);
  },
  warn: (...args: unknown[]): void => {
    if (isDev) console.warn('[Valhalla]', ...args);
  },
  error: (...args: unknown[]): void => {
    if (isDev) console.error('[Valhalla]', ...args);
  },
  info: (...args: unknown[]): void => {
    if (isDev) console.info('[Valhalla]', ...args);
  },
};

export default logger;
