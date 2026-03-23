import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ClientService } from './client.service';
import os from 'os';
import { InjectModel } from '@nestjs/mongoose';
import {
  SessionStatus,
  WhatsAppSession,
} from '@/schemas/whatsapp-session.schema';
import { Model } from 'mongoose';
import { User, WhatsAppConnectionStatus } from '@/schemas/user.schema';
import { RemoteAuthService } from './remoteAuth.service';
import fsSync from 'fs';
import fs from 'fs/promises';
import { killProcessTree } from '../tools/process-functions.tool';
import { QrGateway } from './qr.service';
import { ConfigService } from '@nestjs/config';
import { WAState } from 'whatsapp-web.js';
import { WhatsAppHealthService } from '@/services/whatsapp-health.service';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  readonly readySessions: Set<string> = new Set();
  // Track sessions currently initializing to avoid idle cleanup during long startups
  readonly initializingSessions: Set<string> = new Set();
  readonly disconnectingWithPreserve: Set<string> = new Set();
  private readonly sessionLockRefreshTimers: Map<string, NodeJS.Timeout> =
    new Map();
  private readonly connectionOwnerId =
    process.env.POD_NAME || process.env.HOSTNAME || os.hostname();

  // Expose state for gateway guards (read-only)
  public isInitializing = (sessionId: string): boolean =>
    this.initializingSessions.has(sessionId);

  constructor(
    @Inject(forwardRef(() => ClientService))
    private readonly clientService: ClientService,
    private readonly remoteAuthService: RemoteAuthService,
    @InjectModel(WhatsAppSession.name)
    private sessionModel: Model<WhatsAppSession>,
    @InjectModel(User.name)
    private userModel: Model<User>,
    private qrGateway: QrGateway,
    private configService: ConfigService,
    @Inject(forwardRef(() => WhatsAppHealthService))
    private heathService: WhatsAppHealthService,
  ) {}

  async disconnectSession(
    sessionId: string,
    options?: {
      preserveStatus?: boolean;
      /**
       * When true, deletes local auth/session folders under `.wwebjs_auth`.
       * WARNING: this will effectively unlink the WhatsApp session and will require a new QR.
       *
       * Default: false (disconnect should NOT wipe auth; this avoids losing sessions on restart).
       */
      cleanupSessionFiles?: boolean;
    },
  ): Promise<void> {
    try {
      if (options?.preserveStatus) {
        this.disconnectingWithPreserve.add(sessionId);
      }

      const client = this.clientService.clients.get(sessionId);
      if (client) {
        const pid = this.clientService.getClientBrowserPid(client);
        // Remove from active clients map first to prevent event handlers from interfering
        this.clientService.clients.delete(sessionId);
        this.stopSessionLockRefresh(sessionId);

        // Remove all listeners to prevent 'disconnected' event from triggering handleDisconnected
        // which would incorrectly update the session status in DB when we want to preserve it
        client.removeAllListeners();

        // Destroy browser safely; do not crash on puppeteer “session closed” errors
        try {
          await client.destroy();
          this.logger.log(
            `Successfully destroyed WhatsApp client for session ${sessionId}`,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to destroy client for session ${sessionId}: ${error instanceof Error ? error.message : error}`,
          );
        }

        // Best-effort: ensure underlying Chrome process tree is dead (Windows can keep locks briefly)
        try {
          if (pid) {
            await killProcessTree(pid);
          }
        } catch (error) {
          this.logger.debug(error.message);
        }

        // IMPORTANT:
        // Do NOT delete RemoteAuth/session folders on a normal disconnect.
        // Doing so would wipe stored auth and makes sessions disappear on server restart.
        if (options?.cleanupSessionFiles) {
          try {
            const cleaned = await this.cleanupSessionFilesForSession(sessionId);
            if (!cleaned) {
              this.logger.warn(
                `[SERVICE] Requested cleanupSessionFiles but could not fully clean auth dir for sessionId=${sessionId}`,
              );
            }
          } catch (cleanupError) {
            this.logger.warn(
              `Failed to clean session files for ${sessionId}: ${cleanupError instanceof Error ? cleanupError.message : cleanupError}`,
            );
          }
        }
      }

      if (!options?.preserveStatus) {
        try {
          const session = await this.sessionModel
            .findOneAndUpdate(
              { sessionId },
              {
                status: SessionStatus.DISCONNECTED,
                disconnectedAt: new Date(),
                qrCode: null,
                qrCodeGeneratedAt: null,
                qrCodeExpiresAt: null,
              },
              { returnDocument: 'after' },
            )
            .select('userId')
            .lean();

          if ((session as any)?.userId) {
            await this.userModel.findByIdAndUpdate((session as any).userId, {
              whatsappConnectionStatus: WhatsAppConnectionStatus.DISCONNECTED,
            });
          }

          this.logger.log(`Session disconnected successfully: ${sessionId}`);
        } catch (dbError) {
          this.logger.error(
            `Failed to update session status: ${dbError.message}`,
          );
        }
      } else {
        this.logger.debug(
          `Session ${sessionId} disconnected with preserveStatus=true; skipping status update.`,
        );
      }
    } catch (error) {
      // Even if cleanup fails, ensure session is marked as disconnected
      if (!options?.preserveStatus) {
        try {
          const session = await this.sessionModel
            .findOneAndUpdate(
              { sessionId },
              {
                status: SessionStatus.DISCONNECTED,
                disconnectedAt: new Date(),
                lastError: error.message,
                lastErrorAt: new Date(),
              },
              { returnDocument: 'after' },
            )
            .select('userId')
            .lean();

          if ((session as any)?.userId) {
            await this.userModel.findByIdAndUpdate((session as any).userId, {
              whatsappConnectionStatus: WhatsAppConnectionStatus.DISCONNECTED,
            });
          }
        } catch (dbError) {
          this.logger.error(
            `Failed to update session status: ${dbError.message}`,
          );
        }
      }

      // Remove from clients map even if cleanup failed
      this.clientService.clients.delete(sessionId);

      this.logger.error(
        `Error during session disconnect for ${sessionId}:`,
        error,
      );
      // Do not rethrow to avoid crashing the process on disconnect paths
    } finally {
      // Always clear the marker to avoid leaks
      if (options?.preserveStatus) {
        this.disconnectingWithPreserve.delete(sessionId);
      }
      if (!this.clientService.clients.has(sessionId)) {
        this.stopSessionLockRefresh(sessionId);
        await this.releaseSessionLock(sessionId);
      }
    }
  }

  /**
   * Explicit "unlink" behavior: destroy client + remove persisted auth data so next init requires a new QR.
   * This is intentionally separate from `disconnectSession` to avoid wiping sessions on shutdown/restart.
   */
  async removeSession(sessionId: string): Promise<void> {
    const client = this.clientService.clients.get(sessionId);

    // Best-effort: WhatsApp logout so the mobile app removes it from "Linked devices".
    if (client) {
      try {
        const logoutTimeoutMs =
          Number(process.env.WHATSAPP_LOGOUT_TIMEOUT_MS) || 15000;
        await Promise.race([
          client.logout(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('WhatsApp logout timeout')),
              logoutTimeoutMs,
            ),
          ),
        ]);
      } catch (error) {
        this.logger.warn(
          `[SERVICE] removeSession: logout failed for sessionId=${sessionId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    // Disconnect client resources but DO NOT rely on disconnectSession to wipe auth.
    await this.disconnectSession(sessionId, { cleanupSessionFiles: false });

    // Remove persisted RemoteAuth backup(s) from MongoStore + local `.wwebjs_auth` folders.
    try {
      const store = this.remoteAuthService.ensureRemoteAuthStore();
      const clientId =
        await this.remoteAuthService.ensureAuthClientId(sessionId);
      const candidates = Array.from(new Set([clientId, sessionId])).filter(
        Boolean,
      );
      for (const id of candidates) {
        try {
          await store.delete({ session: `RemoteAuth-${id}` });
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }

    // Remove local session folders (RemoteAuth-*/session-*) and clear authClientId so future inits start clean.
    await this.cleanupSessionFilesForSession(sessionId);
    await this.sessionModel.updateOne(
      { sessionId },
      {
        $unset: { authClientId: '' },
        $set: {
          status: SessionStatus.DISCONNECTED,
          disconnectedAt: new Date(),
          qrCode: null,
          qrCodeGeneratedAt: null,
          qrCodeExpiresAt: null,
        },
      },
    );
  }

  startSessionLockRefresh(sessionId: string): void {
    if (this.sessionLockRefreshTimers.has(sessionId)) {
      return;
    }
    const intervalMs = this.getSessionLockRefreshIntervalMs();
    const timer = setInterval(() => {
      if (!this.clientService.clients.has(sessionId)) {
        this.stopSessionLockRefresh(sessionId);
        return;
      }
      void this.refreshSessionLock(sessionId).catch((error) => {
        this.logger.warn(
          `[SERVICE] Failed to refresh session lock: sessionId=${sessionId}, error=${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }, intervalMs);
    this.sessionLockRefreshTimers.set(sessionId, timer);
  }

  stopSessionLockRefresh(sessionId: string): void {
    const timer = this.sessionLockRefreshTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.sessionLockRefreshTimers.delete(sessionId);
    }
  }

  async releaseSessionLock(sessionId: string): Promise<void> {
    await this.sessionModel.updateOne(
      { sessionId, connectionOwner: this.connectionOwnerId },
      {
        $unset: {
          connectionOwner: '',
          connectionOwnerExpiresAt: '',
          connectionOwnerHeartbeatAt: '',
        },
      },
    );
  }

  async cleanupSessionFilesForSession(sessionId: string): Promise<boolean> {
    const currentClientId =
      await this.remoteAuthService.ensureAuthClientId(sessionId);
    const candidates = Array.from(new Set([currentClientId, sessionId])).filter(
      Boolean,
    );

    let allClean = true;
    for (const clientId of candidates) {
      const ok = await this.cleanupSessionFilesByClientId(clientId);
      if (!ok) allClean = false;
    }
    return allClean;
  }

  async updateSessionStatus(
    sessionId: string,
    status: SessionStatus,
    message?: string,
    failureReason?: string,
  ): Promise<void> {
    await this.sessionModel.findOneAndUpdate(
      { sessionId },
      {
        status,
        lastActivityAt: new Date(),
        failureReason,
      },
    );
    this.qrGateway.emitStatus(sessionId, { status, message });
  }

  async acquireSessionLock(sessionId: string): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.getSessionLockTtlMs());
    const owner = this.connectionOwnerId;
    const updated = await this.sessionModel.findOneAndUpdate(
      {
        sessionId,
        $or: [
          { connectionOwnerExpiresAt: { $exists: false } },
          { connectionOwnerExpiresAt: null },
          { connectionOwnerExpiresAt: { $lt: now } },
          { connectionOwner: owner },
        ],
      },
      {
        $set: {
          connectionOwner: owner,
          connectionOwnerExpiresAt: expiresAt,
          connectionOwnerHeartbeatAt: now,
        },
      },
      { returnDocument: 'after' },
    );

    if (!updated) {
      this.logger.warn(
        `[SERVICE] Session lock already held by another pod; skipping init: sessionId=${sessionId}`,
      );
      return false;
    }
    return true;
  }

  async getSessionStatus(sessionId: string): Promise<any> {
    const session = await this.sessionModel.findOne({ sessionId });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Get health check status
    let healthStatus = this.heathService.healthChecks.get(sessionId);
    if (!healthStatus) {
      healthStatus = {
        lastCheck: new Date(),
        lastStatus: 'success',
        consecutiveFailures: 0,
        successRate: 100,
        recentChecks: 0,
      };
      this.heathService.healthChecks.set(sessionId, healthStatus);
    }

    // Check current status
    const client = this.clientService.clients.get(sessionId);
    if (client) {
      const failureThreshold =
        Number(
          this.configService.get<string>(
            'whatsapp.healthCheckFailureThreshold',
            process.env.WHATSAPP_HEALTHCHECK_FAILURE_THRESHOLD || '3',
          ),
        ) || 3;
      const activityGraceMs =
        Number(
          this.configService.get<string>(
            'whatsapp.healthActivityGraceMs',
            process.env.WHATSAPP_HEALTH_ACTIVITY_GRACE_MS || '120000',
          ),
        ) || 120000; // default: 2 minutes
      const lastActivityAtMs = session.lastActivityAt
        ? new Date(session.lastActivityAt as any).getTime()
        : 0;
      const isRecentlyActive =
        lastActivityAtMs > 0 &&
        Date.now() - lastActivityAtMs <= activityGraceMs;
      try {
        const state = await client.getState();
        // whatsapp-web.js states can be transient (e.g., OPENING) even while messages still flow.
        // Treat only persistent failures as "failed"; treat transient states as "warning".
        const normalizedState = String(state || '').toUpperCase();
        const transientProblemStates = new Set([
          'DISCONNECTED',
          'CONFLICT',
          'PAIRING',
        ]);
        const hardFailStates = new Set(['UNLAUNCHED', 'TIMEOUT', 'UNPAIRED']);

        if (normalizedState === WAState.CONNECTED) {
          healthStatus.lastStatus = 'success';
          healthStatus.consecutiveFailures = 0;
        } else if (isRecentlyActive) {
          // If messages are still flowing recently, avoid false "unstable" caused by transient states.
          healthStatus.lastStatus = 'success';
          healthStatus.consecutiveFailures = 0;
        } else if (hardFailStates.has(normalizedState)) {
          // Hard failures should count towards the threshold.
          healthStatus.consecutiveFailures++;
          healthStatus.lastStatus =
            healthStatus.consecutiveFailures >= failureThreshold
              ? 'failed'
              : 'warning';
        } else if (transientProblemStates.has(normalizedState)) {
          // Transient states can happen without impacting message flow; do not increment failures.
          healthStatus.lastStatus = 'warning';
        } else {
          // OPENING / RESUMING / etc
          healthStatus.lastStatus = 'warning';
        }
        healthStatus.lastCheck = new Date();
        healthStatus.recentChecks++;
        healthStatus.successRate =
          ((healthStatus.recentChecks - healthStatus.consecutiveFailures) /
            healthStatus.recentChecks) *
          100;
        this.heathService.healthChecks.set(sessionId, healthStatus);
      } catch (error) {
        this.logger.error(`Failed to get client state: ${error.message}`);
        if (isRecentlyActive) {
          // If the client is still active, don't mark it unstable just because getState failed.
          healthStatus.lastStatus = 'warning';
        } else {
          healthStatus.consecutiveFailures++;
          healthStatus.lastStatus =
            healthStatus.consecutiveFailures >= failureThreshold
              ? 'failed'
              : 'warning';
        }
        healthStatus.lastCheck = new Date();
        healthStatus.recentChecks++;
        healthStatus.successRate =
          ((healthStatus.recentChecks - healthStatus.consecutiveFailures) /
            healthStatus.recentChecks) *
          100;
        this.heathService.healthChecks.set(sessionId, healthStatus);
      }
    }

    return {
      ...session.toObject(),
      healthStatus: {
        ...healthStatus,
        // IMPORTANT: this is persisted and updated only by the periodic scheduler.
        // Manual/dedicated checks may run, but must not change this value.
        nextCheck: (session as any).nextHealthCheckAt,
      },
    };
  }

  private async refreshSessionLock(sessionId: string): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.getSessionLockTtlMs());
    await this.sessionModel.updateOne(
      { sessionId, connectionOwner: this.connectionOwnerId },
      {
        $set: {
          connectionOwnerExpiresAt: expiresAt,
          connectionOwnerHeartbeatAt: now,
        },
      },
    );
  }

  private getSessionLockTtlMs(): number {
    return (
      Number(
        this.configService.get<string>(
          'whatsapp.sessionLockTtlMs',
          process.env.WHATSAPP_SESSION_LOCK_TTL_MS || '300000',
        ),
      ) || 300000
    );
  }

  private getSessionLockRefreshIntervalMs(): number {
    return (
      Number(
        this.configService.get<string>(
          'whatsapp.sessionLockRefreshIntervalMs',
          process.env.WHATSAPP_SESSION_LOCK_REFRESH_INTERVAL_MS || '60000',
        ),
      ) || 60000
    );
  }

  private async cleanupSessionFilesByClientId(
    clientId: string,
    maxRetries = os.platform() === 'win32' ? 12 : 5,
    retryDelay = os.platform() === 'win32' ? 2000 : 2000,
  ): Promise<boolean> {
    const authPath =
      process.env.WWEBJS_AUTH_PATH || `${process.cwd()}/.wwebjs_auth`;
    const sessionPaths = [
      // RemoteAuth naming (current)
      `${authPath}/RemoteAuth-${clientId}`,
      // Legacy LocalAuth naming (pre-migration) - keep cleaning it to avoid stale locks/files
      `${authPath}/session-${clientId}`,
    ];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const existing = sessionPaths.filter((p) => fsSync.existsSync(p));
        if (!existing.length) {
          this.logger.debug(
            `Session directory does not exist, nothing to clean: ${sessionPaths.join(
              ', ',
            )}`,
          );
          return true;
        }

        for (const sessionPath of existing) {
          await fs.rm(sessionPath, {
            recursive: true,
            force: true,
            maxRetries: 3,
          });
        }
        this.logger.log(
          `Successfully cleaned up session files for clientId=${clientId} on attempt ${attempt}`,
        );
        return true;
      } catch (error: any) {
        const isRetryable =
          error?.code === 'EBUSY' ||
          error?.code === 'EPERM' ||
          error?.code === 'ENOTEMPTY';

        if (isRetryable && attempt < maxRetries) {
          this.logger.warn(
            `Cleanup attempt ${attempt} failed (${error.code}) for clientId=${clientId}, retrying in ${retryDelay}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        } else {
          this.logger.warn(
            `Could not fully clean up session files for clientId=${clientId} after ${attempt} attempts: ${error?.message || error}. ` +
              `Files may need manual cleanup under: ${authPath}`,
          );
          return false;
        }
      }
    }
    return false;
  }
}
