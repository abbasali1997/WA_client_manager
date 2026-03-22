import { registerAs } from '@nestjs/config';

export default registerAs('whatsapp', () => ({
  remoteAuthBackupSyncIntervalMs: parseInt(
    process.env.WHATSAPP_REMOTE_AUTH_BACKUP_SYNC_INTERVAL_MS || '60000',
    10,
  ),
  sessionLockRefreshIntervalMs: parseInt(
    process.env.WHATSAPP_SESSION_LOCK_REFRESH_INTERVAL_MS || '60000',
    10,
  ),
  sessionLockTtlMs: parseInt(
    process.env.WHATSAPP_SESSION_LOCK_TTL_MS || '300000',
    10,
  ),
  clientInitTimeoutMs: parseInt(
    process.env.WHATSAPP_CLIENT_INIT_TIMEOUT_MS || '120000',
    10,
  ),
  authPath: process.env.WWEBJS_AUTH_PATH || `${process.cwd()}/.wwebjs_auth`,
  chromePath: process.env.CHROME_PATH || '',
}));