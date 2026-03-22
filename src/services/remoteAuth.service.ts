import { MongoStore } from 'wwebjs-mongo';
import fsSync from 'fs';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { WhatsAppSession } from '@/schemas/whatsapp-session.schema';
import mongoose, { Connection, Model } from 'mongoose';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class RemoteAuthService {
  private readonly logger = new Logger(RemoteAuthService.name);
  remoteAuthStore: any | null = null;

  private remoteAuthStoreInstrumented = false;

  constructor(
    @InjectModel(WhatsAppSession.name)
    private sessionModel: Model<WhatsAppSession>,
    @InjectConnection()
    private readonly mongooseConnection: Connection,
  ) {}

  async logRemoteAuthGridFsInfo(session: string): Promise<void> {
    try {
      if (!this.mongooseConnection.db) {
        this.logger.error('Database connection is not initialized')
        throw new Error('Database connection is not initialized');
      }

      const filesCollection = this.mongooseConnection.db.collection(
        `whatsapp-${session}.files`,
      );
      const count = await filesCollection.countDocuments();
      const latest = await filesCollection
        .find({})
        .sort({ uploadDate: -1 })
        .limit(1)
        .toArray();
      const latestDoc = latest?.[0];
      const uploadDate = latestDoc?.uploadDate;
      const length = latestDoc?.length;
      this.logger.debug(
        `[SERVICE] RemoteAuth GridFS info: session=${session}, filesCount=${count}, latestUploadDate=${
          uploadDate ? new Date(uploadDate).toISOString() : "none"
        }${typeof length === "number" ? `, latestSize=${length}` : ""}`,
      );
    } catch (e) {
      this.logger.warn(
        `[SERVICE] Failed to read RemoteAuth GridFS info for session=${session}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  async ensureAuthClientId(sessionId: string): Promise<string> {
    const doc = await this.sessionModel
      .findOne({ sessionId })
      .select("authClientId")
      .lean();
    return (doc as any)?.authClientId || sessionId;
  }

  ensureRemoteAuthStore(): any {
    if (this.remoteAuthStore) return this.remoteAuthStore;

    // IMPORTANT: In NestJS, `MongooseModule.forRoot*` uses `mongoose.createConnection()`,
    // so the active DB is NOT necessarily available at `mongoose.connection`.
    // `wwebjs-mongo` expects an object with `.connection.db` and `.mongo.GridFSBucket`.
    const mongooseLike = {
      connection: this.mongooseConnection as any,
      mongo: (mongoose as any).mongo,
    };

    this.remoteAuthStore = new MongoStore({ mongoose: mongooseLike as any });
    this.instrumentRemoteAuthStore(this.remoteAuthStore);
    this.logger.log("[SERVICE] RemoteAuth store initialized (MongoStore)");
    return this.remoteAuthStore;
  }

  private instrumentRemoteAuthStore(store: any): void {
    if (this.remoteAuthStoreInstrumented) return;
    if (!store) return;
    this.remoteAuthStoreInstrumented = true;

    try {
      const originalSave =
        typeof store.save === "function" ? store.save.bind(store) : null;
      if (originalSave) {
        store.save = async (options: any) => {
          const sessionName = options?.session;
          const zipPath = `${sessionName}.zip`;
          const startedAt = Date.now();
          try {
            const exists = fsSync.existsSync(zipPath);
            const size = exists ? fsSync.statSync(zipPath).size : undefined;
            this.logger.log(
              `[REMOTE_AUTH_STORE] save(start) session=${sessionName}, zipExists=${exists}${
                typeof size === "number" ? `, zipSize=${size}` : ""
              }`,
            );
          } catch {
            this.logger.log(
              `[REMOTE_AUTH_STORE] save(start) session=${sessionName}`,
            );
          }

          try {
            const res = await originalSave(options);
            const durationMs = Date.now() - startedAt;
            this.logger.log(
              `[REMOTE_AUTH_STORE] save(done) session=${sessionName}, durationMs=${durationMs}`,
            );
            return res;
          } catch (e) {
            const durationMs = Date.now() - startedAt;
            this.logger.error(
              `[REMOTE_AUTH_STORE] save(failed) session=${sessionName}, durationMs=${durationMs}, error=${
                e instanceof Error ? e.message : String(e)
              }`,
              e instanceof Error ? e.stack : undefined,
            );
            throw e;
          }
        };
      }

      const originalExtract =
        typeof store.extract === "function" ? store.extract.bind(store) : null;
      if (originalExtract) {
        store.extract = async (options: any) => {
          const sessionName = options?.session;
          const destPath = options?.path;
          const startedAt = Date.now();
          this.logger.log(
            `[REMOTE_AUTH_STORE] extract(start) session=${sessionName}, dest=${destPath}`,
          );
          try {
            const res = await originalExtract(options);
            const durationMs = Date.now() - startedAt;
            this.logger.log(
              `[REMOTE_AUTH_STORE] extract(done) session=${sessionName}, durationMs=${durationMs}`,
            );
            return res;
          } catch (e) {
            const durationMs = Date.now() - startedAt;
            this.logger.error(
              `[REMOTE_AUTH_STORE] extract(failed) session=${sessionName}, durationMs=${durationMs}, error=${
                e instanceof Error ? e.message : String(e)
              }`,
              e instanceof Error ? e.stack : undefined,
            );
            throw e;
          }
        };
      }
    } catch (e) {
      this.logger.warn(
        `[REMOTE_AUTH_STORE] Failed to instrument MongoStore: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  async rotateAuthClientId(sessionId: string): Promise<string> {
    const prev = await this.ensureAuthClientId(sessionId);
    const next = this.generateAuthClientId(sessionId);
    await this.sessionModel.updateOne(
      { sessionId },
      { $set: { authClientId: next } },
    );

    // Best-effort: delete old RemoteAuth backup to avoid orphaned sessions in Mongo.
    // RemoteAuth uses `RemoteAuth-${clientId}` as the session name.
    try {
      if (prev && prev !== next) {
        const store = this.ensureRemoteAuthStore();
        await store.delete({ session: `RemoteAuth-${prev}` });
      }
    } catch {
      // ignore
    }
    return next;
  }

  private generateAuthClientId(sessionId: string): string {
    return `${sessionId}-${Date.now()}`;
  }
}