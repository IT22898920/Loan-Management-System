export const SESSION_CONFIG = {
  admin: {
    idleTimeoutMs: 30 * 60 * 1000,
    absoluteTimeoutMs: 12 * 60 * 60 * 1000,
    warningMs: 60 * 1000,
  },
  staff: {
    idleTimeoutMs: 60 * 60 * 1000,
    absoluteTimeoutMs: 12 * 60 * 60 * 1000,
    warningMs: 60 * 1000,
  },
} as const;

export const LOGIN_START_KEY = 'diriyalanka_login_start';
