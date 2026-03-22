import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueMessage, QueueService } from '@/common/messaging/queue.service';
import {
  WHATSAPP_QUEUE_NAME,
  WhatsAppQueueEvent,
} from '@/modules/whatsapp-queue/whatsapp-queue.service';
import * as os from 'os';
import fsSync from 'fs';
import { Client, RemoteAuth } from 'whatsapp-web.js';
import {
  SessionStatus,
  WhatsAppSession,
} from '@/schemas/whatsapp-session.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RemoteAuthService } from './remoteAuth.service';
import { SessionService } from './session.service';
import { ClientService } from './client.service';
import { killProcessTree } from '../tools/process-functions.tool';

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappService.name);
  // Prevent concurrent initialization of the same session (e.g., queue + direct)
  private initLocks: Map<string, Promise<void>> = new Map();
  readonly cleanupFailed: Set<string> = new Set();
  // Track cleanup state to avoid re-init while session files are locked
  private readonly cleanupInProgress: Set<string> = new Set();
  private readonly connectionOwnerId =
    process.env.POD_NAME || process.env.HOSTNAME || os.hostname();

  public isCleanupInProgress = (sessionId: string): boolean =>
    this.cleanupInProgress.has(sessionId);

  constructor(
    @InjectModel(WhatsAppSession.name)
    private sessionModel: Model<WhatsAppSession>,
    private configService: ConfigService,
    // private readonly queueService: QueueService,
    private readonly remoteAuthService: RemoteAuthService,
    private readonly sessionService: SessionService,
    private clientService: ClientService,
  ) {}

  /**
   * Check if running on localhost
   * @returns true if running on localhost, false otherwise
   */
  private isLocalhost(): boolean {
    const nodeEnv = this.configService.get<string>(
      'app.nodeEnv',
      'development',
    );
    const baseUrl = this.configService.get<string>(
      'app.baseUrl',
      'http://localhost:3000',
    );
    return (
      nodeEnv === 'development' ||
      baseUrl.includes('localhost') ||
      baseUrl.includes('127.0.0.1')
    );
  }

  async onModuleInit() {
    // Skip starting receiver on localhost (WhatsApp sessions are initialized directly, not queued)
    if (this.isLocalhost()) {
      this.logger.log(
        `[LOCALHOST] WhatsApp queue processor skipped - sessions are initialized directly, not queued`,
      );
      return;
    }

    this.logger.log(
      `[PROCESSOR] Initializing WhatsApp queue processor for queue: ${WHATSAPP_QUEUE_NAME}`,
    );
    try {
      // Start receiver for WhatsApp events
      this.logger.debug(
        `[PROCESSOR] Starting receiver with options: maxConcurrentCalls=2, autoCompleteMessages=true`,
      );
      await this.queueService.startReceiver(
        WHATSAPP_QUEUE_NAME,
        async (message, payload: QueueMessage<{ sessionId: string }>) => {
          const messageId = message.messageId || 'unknown';
          const correlationId =
            message.correlationId || payload.correlationId || 'unknown';
          const receivedAt = new Date().toISOString();
          const startTime = Date.now();

          this.logger.debug(
            `[PROCESSOR] Message received: messageId=${messageId}, correlationId=${correlationId}, receivedAt=${receivedAt}, queue=${WHATSAPP_QUEUE_NAME}`,
          );
          this.logger.debug(
            `[PROCESSOR] Message payload: eventType=${payload.eventType}, timestamp=${payload.timestamp}, userId=${payload.userId}, tenantId=${payload.tenantId}`,
          );
          this.logger.debug(
            `[PROCESSOR] Message application properties: ${JSON.stringify(message.applicationProperties || {})}`,
          );

          try {
            const { eventType, data } = payload;
            this.logger.debug(
              `[PROCESSOR] Parsed payload: eventType=${eventType}, data=${JSON.stringify(data)}`,
            );

            const sessionId = data?.sessionId;
            if (!sessionId) {
              this.logger.warn(
                `[PROCESSOR] Received WhatsApp queue event without sessionId: messageId=${messageId}, correlationId=${correlationId}, payload=${JSON.stringify(payload)}`,
              );
              return;
            }

            this.logger.debug(
              `[PROCESSOR] Processing event: eventType=${eventType}, sessionId=${sessionId}, messageId=${messageId}, correlationId=${correlationId}`,
            );

            switch (eventType) {
              case WhatsAppQueueEvent.SESSION_INIT: {
                this.logger.log(
                  `[PROCESSOR] Processing SESSION_INIT: sessionId=${sessionId}, messageId=${messageId}, correlationId=${correlationId}`,
                );
                const initStartTime = Date.now();
                try {
                  await this.initializeClient(sessionId);
                  const initDuration = Date.now() - initStartTime;
                  this.logger.log(
                    `[PROCESSOR] Successfully processed SESSION_INIT: sessionId=${sessionId}, messageId=${messageId}, correlationId=${correlationId}, duration=${initDuration}ms`,
                  );
                } catch (initError) {
                  const initDuration = Date.now() - initStartTime;
                  this.logger.error(
                    `[PROCESSOR] Failed to process SESSION_INIT: sessionId=${sessionId}, messageId=${messageId}, correlationId=${correlationId}, duration=${initDuration}ms, error=${initError instanceof Error ? initError.message : String(initError)}`,
                    initError instanceof Error ? initError.stack : undefined,
                  );
                  throw initError;
                }
                break;
              }
              case WhatsAppQueueEvent.SESSION_RECONNECT: {
                this.logger.log(
                  `[PROCESSOR] Processing SESSION_RECONNECT: sessionId=${sessionId}, messageId=${messageId}, correlationId=${correlationId}`,
                );
                const reconnectStartTime = Date.now();
                try {
                  await this.initializeClient(sessionId);
                  const reconnectDuration = Date.now() - reconnectStartTime;
                  this.logger.log(
                    `[PROCESSOR] Successfully processed SESSION_RECONNECT: sessionId=${sessionId}, messageId=${messageId}, correlationId=${correlationId}, duration=${reconnectDuration}ms`,
                  );
                } catch (reconnectError) {
                  const reconnectDuration = Date.now() - reconnectStartTime;
                  this.logger.error(
                    `[PROCESSOR] Failed to process SESSION_RECONNECT: sessionId=${sessionId}, messageId=${messageId}, correlationId=${correlationId}, duration=${reconnectDuration}ms, error=${reconnectError instanceof Error ? reconnectError.message : String(reconnectError)}`,
                    reconnectError instanceof Error
                      ? reconnectError.stack
                      : undefined,
                  );
                  throw reconnectError;
                }
                break;
              }
              case WhatsAppQueueEvent.SESSION_DISCONNECT: {
                this.logger.log(
                  `[PROCESSOR] Processing SESSION_DISCONNECT: sessionId=${sessionId}, messageId=${messageId}, correlationId=${correlationId}`,
                );
                const disconnectStartTime = Date.now();
                try {
                  await this.sessionService.disconnectSession(sessionId);
                  const disconnectDuration = Date.now() - disconnectStartTime;
                  this.logger.log(
                    `[PROCESSOR] Successfully processed SESSION_DISCONNECT: sessionId=${sessionId}, messageId=${messageId}, correlationId=${correlationId}, duration=${disconnectDuration}ms`,
                  );
                } catch (disconnectError) {
                  const disconnectDuration = Date.now() - disconnectStartTime;
                  this.logger.error(
                    `[PROCESSOR] Failed to process SESSION_DISCONNECT: sessionId=${sessionId}, messageId=${messageId}, correlationId=${correlationId}, duration=${disconnectDuration}ms, error=${disconnectError instanceof Error ? disconnectError.message : String(disconnectError)}`,
                    disconnectError instanceof Error
                      ? disconnectError.stack
                      : undefined,
                  );
                  throw disconnectError;
                }
                break;
              }
              default:
                this.logger.warn(
                  `[PROCESSOR] Unknown WhatsApp queue event: eventType=${eventType}, messageId=${messageId}, correlationId=${correlationId}, sessionId=${sessionId}`,
                );
            }

            const totalDuration = Date.now() - startTime;
            this.logger.debug(
              `[PROCESSOR] Message processing completed: messageId=${messageId}, correlationId=${correlationId}, sessionId=${sessionId}, eventType=${eventType}, totalDuration=${totalDuration}ms`,
            );
          } catch (error) {
            const totalDuration = Date.now() - startTime;
            this.logger.error(
              `[PROCESSOR] Failed to process WhatsApp queue message: messageId=${messageId}, correlationId=${correlationId}, sessionId=${payload.data?.sessionId || 'unknown'}, eventType=${payload.eventType}, totalDuration=${totalDuration}ms, error=${error instanceof Error ? error.message : String(error)}`,
              error instanceof Error ? error.stack : undefined,
            );
            throw error;
          }
        },
        {
          maxConcurrentCalls: 2,
          autoCompleteMessages: true,
        },
      );
      this.logger.log(
        `[PROCESSOR] Successfully started receiver for queue: ${WHATSAPP_QUEUE_NAME}`,
      );
    } catch (error) {
      this.logger.error(
        `[PROCESSOR] Failed to start receiver for queue ${WHATSAPP_QUEUE_NAME}: error=${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async onModuleDestroy() {
    // Skip stopping receiver on localhost (receiver was never started)
    if (this.isLocalhost()) {
      return;
    }

    this.logger.log(
      `[PROCESSOR] Stopping receiver for queue: ${WHATSAPP_QUEUE_NAME}`,
    );
    try {
      await this.queueService.stopReceiver(WHATSAPP_QUEUE_NAME);
      this.logger.log(
        `[PROCESSOR] Successfully stopped receiver for queue: ${WHATSAPP_QUEUE_NAME}`,
      );
    } catch (error) {
      this.logger.error(
        `[PROCESSOR] Failed to stop receiver for queue ${WHATSAPP_QUEUE_NAME}: error=${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async initializeClient(sessionId: string): Promise<void> {
    const initStartTime = Date.now();
    this.logger.debug(
      `[SERVICE] initializeClient called: sessionId=${sessionId}`,
    );

    // Prevent concurrent initialization for the same session
    const existingLock = this.initLocks.get(sessionId);
    if (existingLock) {
      this.logger.debug(
        `[SERVICE] initializeClient already in progress for ${sessionId}, waiting for existing init`,
      );
      await existingLock;
      return;
    }

    const initPromise = (async () => {
      this.sessionService.initializingSessions.add(sessionId);
      if (
        this.cleanupInProgress.has(sessionId)
      ) {
        this.logger.warn(
          `[SERVICE] Cleanup in progress for ${sessionId}; delaying init`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (this.cleanupFailed.has(sessionId)) {
        this.logger.warn(
          `[SERVICE] Cleanup previously failed for ${sessionId}; skipping init to avoid launch errors (retry later)`,
        );
        return;
      }

      let lockAcquired = false;
      try {
        lockAcquired = await this.acquireSessionLock(sessionId);
        if (!lockAcquired) {
          return;
        }

        if (this.clientService.clients.has(sessionId)) {
          this.sessionService.startSessionLockRefresh(sessionId);
          this.logger.warn(
            `[SERVICE] Client already exists for session: sessionId=${sessionId}. Skipping initialization.`,
          );
          return;
        }

        // Step 1: Detect Chrome path
        const platform = os.platform();
        this.logger.log(`Detecting Chrome path for platform: ${platform}`);

        const windowsPaths = [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          process.env.CHROME_PATH, // Allow override via env var
        ];

        const linuxPaths = [
          '/usr/bin/google-chrome',
          '/usr/bin/chromium-browser',
          '/usr/bin/chromium',
          process.env.CHROME_PATH,
        ];

        const macPaths = [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
          process.env.CHROME_PATH,
        ];

        const paths =
          platform === 'win32'
            ? windowsPaths
            : platform === 'linux'
              ? linuxPaths
              : platform === 'darwin'
                ? macPaths
                : [];

        // Find first existing Chrome path
        let chromePath;
        for (const path of paths) {
          try {
            if (path && fsSync.existsSync(path)) {
              chromePath = path;
              this.logger.log(`Found Chrome at: ${path}`);
              break;
            }
          } catch (error) {
            this.logger.warn(
              `Error checking Chrome path ${path}: ${error.message}`,
            );
          }
        }

        // if (!chromePath) {
        //   throw new Error(
        //     "Chrome not found. Please install Chrome or set CHROME_PATH environment variable.",
        //   );
        // }

        const dataPath =
          process.env.WWEBJS_AUTH_PATH || `${process.cwd()}/.wwebjs_auth`;
        const authClientId =
          await this.remoteAuthService.ensureAuthClientId(sessionId);
        const remoteStore = this.remoteAuthService.ensureRemoteAuthStore();

        // Diagnostics: confirm whether a RemoteAuth backup exists in Mongo (GridFS) for this session/clientId.
        // If no backup exists, whatsapp-web.js will emit a fresh QR on restart.
        try {
          const candidateClientIds = Array.from(
            new Set([authClientId, sessionId]).values(),
          ).filter(Boolean);
          const candidateSessions = candidateClientIds.map(
            (id) => `RemoteAuth-${id}`,
          );
          for (const s of candidateSessions) {
            try {
              const exists = await remoteStore.sessionExists({ session: s });
              this.logger.debug(
                `[SERVICE] RemoteAuth Mongo backup exists? session=${s} -> ${exists}`,
              );
              if (exists) {
                await this.remoteAuthService.logRemoteAuthGridFsInfo(s);
              }
            } catch (e) {
              this.logger.warn(
                `[SERVICE] Failed checking RemoteAuth Mongo backup existence for session=${s}: ${
                  e instanceof Error ? e.message : String(e)
                }`,
              );
            }
          }
        } catch {
          // ignore
        }
        const backupSyncIntervalMsRaw =
          this.configService.get<string>(
            'whatsapp.remoteAuthBackupSyncIntervalMs',
            process.env.WHATSAPP_REMOTE_AUTH_BACKUP_SYNC_INTERVAL_MS || '60000',
          ) || '60000';
        const parsedBackupSyncIntervalMs =
          Number.parseInt(String(backupSyncIntervalMsRaw), 10) || 60000;
        // whatsapp-web.js RemoteAuth enforces a minimum of 60000ms (1 minute).
        const backupSyncIntervalMs = Math.max(
          60000,
          parsedBackupSyncIntervalMs,
        );
        if (backupSyncIntervalMs !== parsedBackupSyncIntervalMs) {
          this.logger.warn(
            `[SERVICE] RemoteAuth backupSyncIntervalMs=${parsedBackupSyncIntervalMs} is below the minimum 60000ms; clamping to ${backupSyncIntervalMs}`,
          );
        }
        this.logger.debug(
          `[SERVICE] RemoteAuth backupSyncIntervalMs=${backupSyncIntervalMs} (sessionId=${sessionId})`,
        );

        // Step 3: Initialize WhatsApp client
        this.logger.log(
          `Initializing WhatsApp client for session: ${sessionId}`,
        );
        const puppeteerArgs = [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-crashpad',
          // Note: we intentionally do NOT use "--single-process" here.
          // It is unstable/unsupported on many Chrome builds and can cause
          // the browser to exit immediately, leading to "Target closed" errors.
        ];

        const buildClient = (clientId: string) =>
          new Client({
            authStrategy: new RemoteAuth({
              clientId,
              dataPath,
              store: remoteStore,
              backupSyncIntervalMs,
            } as any),
            puppeteer: {
              executablePath: chromePath,
              // Keep headless true in container environments to avoid Chrome launch failures
              headless: true,
              timeout: 300000,
              args: puppeteerArgs,
            },
          });

        let client = buildClient(authClientId);
        this.attachHandlers(client, sessionId);

        // Step 5: Initialize the client with guarded retry if Chrome launch fails
        this.logger.log(
          `Starting WhatsApp client initialization for session: ${sessionId}`,
        );
        this.clientService.clients.set(sessionId, client);
        this.sessionService.startSessionLockRefresh(sessionId);

        const initTimeoutMs =
          Number(process.env.WHATSAPP_CLIENT_INIT_TIMEOUT_MS) || 120000;
        const tryInit = async (label: string) => {
          await Promise.race([
            client.initialize(),
            new Promise((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(
                      `WhatsApp init timeout after ${initTimeoutMs}ms (label=${label})`,
                    ),
                  ),
                initTimeoutMs,
              ),
            ),
          ]);
          this.logger.log(
            `WhatsApp client initialization completed (${label}) for session: ${sessionId}`,
          );
          const totalDuration = Date.now() - initStartTime;
          this.logger.debug(
            `[SERVICE] initializeClient success (${label}): sessionId=${sessionId}, duration=${totalDuration}ms`,
          );
        };

        try {
          await tryInit('first');

          // Post-init diagnostic: check whether we actually reach CONNECTED soon after init.
          // This helps differentiate "client never connected" from "connected but no messages".
          setTimeout(() => {
            const activeClient = this.clientService.clients.get(sessionId);
            if (!activeClient) return;
            void activeClient
              .getState()
              .then((state) => {
                this.logger.debug(
                  `[SERVICE] Post-init state probe: sessionId=${sessionId}, state=${String(
                    state,
                  )}`,
                );

                // If we are CONNECTED but never received a "ready" event, force the same initialization
                // that the ready handler would do (status=READY, phone mismatch enforcement, etc).
                // This makes session loading consistent across restarts even when wwebjs misses "ready".
                if (
                  String(state) === 'CONNECTED' &&
                  !this.sessionService.readySessions.has(sessionId)
                ) {
                  const info = (activeClient as any)?.info;
                  const wid =
                    info?.wid?._serialized || info?.wid?.user || 'unknown';
                  const pushname = info?.pushname || 'unknown';
                  this.logger.warn(
                    `[SERVICE] Session is CONNECTED but "ready" event was not observed; forcing handleReady: sessionId=${sessionId}, wid=${String(
                      wid,
                    )}, pushname=${String(pushname)}`,
                  );
                  void this.clientService
                    .handleReady(sessionId, activeClient)
                    .catch((e) => {
                      this.logger.warn(
                        `[SERVICE] Forced handleReady failed: sessionId=${sessionId}, error=${
                          e instanceof Error ? e.message : String(e)
                        }`,
                      );
                    });
                }
              })
              .catch((e) => {
                this.logger.warn(
                  `[SERVICE] Post-init state probe failed: sessionId=${sessionId}, error=${
                    e instanceof Error ? e.message : String(e)
                  }`,
                );
              });
          }, 15000);
        } catch (error) {
          const msg = (error && error.message) || '';
          const isLaunchError =
            msg.includes('Failed to launch the browser process') ||
            msg.includes('WhatsApp init timeout');
          this.logger.error(
            `Failed to initialize WhatsApp client for session ${sessionId}:`,
            error,
          );
          this.clientService.clients.delete(sessionId);
          this.sessionService.stopSessionLockRefresh(sessionId);
          await this.sessionService.updateSessionStatus(
            sessionId,
            SessionStatus.FAILED,
            '',
            `${error.message} - timestamp: ${new Date().toISOString()}`,
          );

          if (isLaunchError) {
            this.logger.warn(
              `[SERVICE] Launch failed; attempting to clean session files and retry: ${sessionId}`,
            );
            this.cleanupInProgress.add(sessionId)
            try {
              const pid = this.getClientBrowserPid(client);
              if (pid) {
                await killProcessTree(pid).catch(e => {
                  this.logger.error(e.message)
                });
              }
              const cleaned =
                await this.sessionService.cleanupSessionFilesForSession(
                  sessionId,
                );
              if (!cleaned) {
                this.cleanupFailed.add(sessionId);
              } else {
                this.cleanupFailed.delete(sessionId);
              }
            } catch (cleanupError) {
              this.logger.warn(
                `[SERVICE] Cleanup after launch failure failed for ${sessionId}: ${cleanupError instanceof Error ? cleanupError.message : cleanupError}`,
              );
              this.cleanupFailed.add(sessionId);
            } finally {
              this.cleanupInProgress.delete(sessionId)
            }
            await new Promise((resolve) => setTimeout(resolve, 1500));

            // If cleanup failed (common on Windows EBUSY), rotate auth profile to avoid locked dir.
            if (this.cleanupFailed.has(sessionId)) {
              const rotated =
                await this.remoteAuthService.rotateAuthClientId(sessionId);
              this.logger.warn(
                `[SERVICE] Cleanup did not fully complete; rotating RemoteAuth clientId and retrying: sessionId=${sessionId}, authClientId=${rotated}`,
              );
              try {
                client.removeAllListeners();
              } catch {
                // ignore
              }
              try {
                await client.destroy();
              } catch {
                // ignore
              }
              client = buildClient(rotated);
              this.attachHandlers(client, sessionId);
            }

            // Re-add client to map before retry so event handlers remain active
            this.clientService.clients.set(sessionId, client);
            this.sessionService.startSessionLockRefresh(sessionId);
            try {
              await tryInit('retry-after-cleanup');
              return;
            } catch (retryError) {
              this.logger.error(
                `[SERVICE] Retry after cleanup failed for session ${sessionId}:`,
                retryError,
              );
              this.clientService.clients.delete(sessionId);
              this.sessionService.stopSessionLockRefresh(sessionId);
              await this.sessionService.updateSessionStatus(
                sessionId,
                SessionStatus.FAILED,
                '',
                `${error.message} - timestamp: ${new Date().toISOString()}`,
              );
            }
          }
        }
      } catch (error) {
        const totalDuration = Date.now() - initStartTime;
        this.logger.error(
          `Critical error during client initialization for session ${sessionId}:`,
          error,
        );
        this.logger.debug(
          `[SERVICE] initializeClient errored: sessionId=${sessionId}, duration=${totalDuration}ms`,
        );
        await this.sessionService.updateSessionStatus(
          sessionId,
          SessionStatus.FAILED,
          '',
          `${error.message} - timestamp: ${new Date().toISOString()}`,
        );
        throw error;
      } finally {
        if (lockAcquired && !this.clientService.clients.has(sessionId)) {
          this.sessionService.stopSessionLockRefresh(sessionId);
          await this.sessionService.releaseSessionLock(sessionId);
        }
        this.initLocks.delete(sessionId);

        this.sessionService.initializingSessions.delete(sessionId);
      }
    })();

    this.initLocks.set(sessionId, initPromise);
    await initPromise;
  }

  private async acquireSessionLock(sessionId: string): Promise<boolean> {
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
      { new: true },
    );

    if (!updated) {
      this.logger.warn(
        `[SERVICE] Session lock already held by another pod; skipping init: sessionId=${sessionId}`,
      );
      return false;
    }
    return true;
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

  private getClientBrowserPid(client: Client | undefined): number | undefined {
    try {
      const pid = (client as any)?.pupBrowser?.process?.()?.pid;
      return typeof pid === 'number' ? pid : undefined;
    } catch {
      return undefined;
    }
  }

  private attachHandlers = (c: Client, sessionId: string) => {
    c.on('qr', async (qr) => {
      try {
        this.logger.log(
          `QR Code received for session: ${sessionId} (length: ${qr.length})`,
        );
        this.logger.debug(`QR Data: ${qr.substring(0, 20)}...`);
        await this.clientService.handleQRCode(sessionId, qr);
      } catch (error) {
        this.logger.error(
          `Error handling QR code for session ${sessionId}:`,
          error,
        );
        await this.sessionService.updateSessionStatus(
          sessionId,
          SessionStatus.FAILED,
          '',
          `${error.message} - timestamp: ${new Date().toISOString()}`,
        );
      }
    });

    // Useful when diagnosing sessions that show "authenticated" but never become truly CONNECTED/READY.
    c.on('change_state', (state) => {
      this.logger.debug(
        `[EVENT] change_state: sessionId=${sessionId}, state=${String(state)}`,
      );
    });

    c.on('remote_session_saved', async () => {
      // Emitted by RemoteAuth after it stores the compressed session into the remote store (Mongo GridFS here)
      this.logger.log(
        `[SERVICE] RemoteAuth session saved to MongoDB (GridFS): sessionId=${sessionId}, authClientId=${await this.remoteAuthService.ensureAuthClientId(
          sessionId,
        )}`,
      );
    });

    c.on('ready', async () => {
      try {
        this.sessionService.readySessions.add(sessionId);
        this.logger.log(`WhatsApp client ready for session: ${sessionId}`);
        await this.clientService.handleReady(sessionId, c);
      } catch (error) {
        this.logger.error(
          `Error handling ready event for session ${sessionId}:`,
          error,
        );
        await this.sessionService.updateSessionStatus(
          sessionId,
          SessionStatus.FAILED,
          '',
          `${error.message} - timestamp: ${new Date().toISOString()}`,
        );
      }
    });

    c.on('authenticated', async () => {
      try {
        this.logger.log(
          `WhatsApp client authenticated for session: ${sessionId}`,
        );
        await this.sessionService.updateSessionStatus(sessionId, SessionStatus.AUTHENTICATED);
      } catch (error) {
        this.logger.error(
          `Error handling authentication for session ${sessionId}:`,
          error,
        );
        await this.sessionService.updateSessionStatus(
          sessionId,
          SessionStatus.FAILED,
          '',
          `${error.message} - timestamp: ${new Date().toISOString()}`,
        );
      }
    });

    c.on('disconnected', async (reason) => {
      try {
        this.logger.warn(
          `WhatsApp client disconnected for session: ${sessionId}. Reason: ${reason}`,
        );
        await this.clientService.handleDisconnected(sessionId, reason);
      } catch (error) {
        this.logger.error(
          `Error handling disconnect for session ${sessionId}:`,
          error,
        );
        await this.sessionService.updateSessionStatus(
          sessionId,
          SessionStatus.FAILED,
          '',
          `${error.message} - timestamp: ${new Date().toISOString()}`,
        );
      }
    });

    c.on('auth_failure', async (msg) => {
      try {
        const errorMsg = `Authentication failed for session ${sessionId}: ${msg}`;
        this.logger.error(errorMsg);
        await this.sessionService.updateSessionStatus(
          sessionId,
          SessionStatus.FAILED,
          '',
          `${errorMsg} - timestamp: ${new Date().toISOString()}`,
        );
        await this.clientService.handleDisconnected(
          sessionId,
          `Authentication failed: ${msg}`,
        );
      } catch (error) {
        this.logger.error(
          `Error handling auth failure for session ${sessionId}:`,
          error,
        );
      }
    });

    c.on('message', async (message) => {
      try {
        await this.clientService.handleIncomingMessage(sessionId, message);
      } catch (error) {
        this.logger.error(
          `Error handling incoming message for session ${sessionId}:`,
          error,
        );
      }
    });

    c.on('message_create', async (message) => {
      try {
        if (message.fromMe) {
          await this.clientService.handleOutgoingMessage(sessionId, message);
        }
      } catch (error) {
        this.logger.error(
          `Error handling outgoing message for session ${sessionId}:`,
          error,
        );
      }
    });

    c.on('message_ack', async (message, ack) => {
      try {
        await this.clientService.handleMessageAck(sessionId, message, ack);
      } catch (error) {
        this.logger.error(
          `Error handling message ack for session ${sessionId}:`,
          error,
        );
      }
    });

    c.on('call', async (call) => {
      try {
        await this.clientService.handleCallEvent(sessionId, call);
      } catch (error) {
        this.logger.error(
          `Error handling call event for session ${sessionId}:`,
          error,
        );
      }
    });
  };
}
