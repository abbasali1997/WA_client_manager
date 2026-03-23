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
  healthCheckIntervalMs:
    parseInt(process.env.WHATSAPP_HEALTHCHECK_INTERVAL_MS || '300000', 10) ||
    30000,
  healthCheckFailureThreshold:
    parseInt(process.env.WHATSAPP_HEALTHCHECK_FAILURE_THRESHOLD || '3', 10) ||
    3,
  healthAlertCooldownMs:
    parseInt(process.env.WHATSAPP_HEALTH_ALERT_COOLDOWN_MS || '3600000') ||
    '3600000',
}));
