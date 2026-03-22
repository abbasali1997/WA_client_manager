import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { SessionStatus, WhatsAppSession } from '@/schemas/whatsapp-session.schema';
import { User, WhatsAppConnectionStatus } from '@/schemas/user.schema';
import { Model, Types } from 'mongoose';
import WAWebJS, { Client, WAState } from 'whatsapp-web.js';
import * as QRCode from "qrcode";
import { SessionService } from './session.service';
import { RemoteAuthService } from './remoteAuth.service';
import { killProcessTree } from '../tools/process-functions.tool';
import { Message, MessageDirection, MessageStatus, MessageType } from '../schemas/message.schema';
import { EntitiesService } from './entities.service';
import { QrGateway } from './qr.service';

@Injectable()
export class ClientService {
  private readonly logger = new Logger(ClientService.name);
  public clients: Map<string, Client> = new Map();

  constructor(
    @InjectModel(WhatsAppSession.name)
    private sessionModel: Model<WhatsAppSession>,
    @InjectModel(User.name)
    private userModel: Model<User>,
    @InjectModel(Message.name)
    private messageModel: Model<Message>,
    private readonly sessionService: SessionService,
    private remoteAuthService: RemoteAuthService,
    private entityService: EntitiesService,
    private qrGateway: QrGateway,
  ) {}

  async handleQRCode(
    sessionId: string,
    qrData: string,
    _shouldSendEmail: boolean = false,
  ): Promise<void> {
    try {
      this.logger.debug(
        `[QR_HANDLER] Processing QR code for session: ${sessionId}`,
      );

      // Read current session status first
      const existingSession = await this.sessionModel.findOne({ sessionId });

      if (!existingSession) {
        this.logger.error(
          `[QR_HANDLER] Session not found in database: ${sessionId}`,
        );
        return;
      }

      this.logger.debug(
        `[QR_HANDLER] Existing session status: ${existingSession.status}, userId: ${existingSession.userId}`,
      );

      // IMPORTANT: Only ignore QR code events if session is actually connected
      // Check if client exists and is actually connected before ignoring QR code
      // WhatsApp-web.js can emit QR events during reconnections even when authenticated,
      // but if the client is not actually connected, we should accept the QR code
      const client = this.clients.get(sessionId);
      let isActuallyConnected = false;
      let state: string | null = null;

      if (
        existingSession.status === SessionStatus.READY ||
        existingSession.status === SessionStatus.AUTHENTICATED
      ) {
        if (client) {
          try {
            console.log(client);
            state = await client.getState();
            isActuallyConnected = state === WAState.CONNECTED;
            this.logger.debug(
              `[QR_HANDLER] Client exists for session ${sessionId}, state: ${state}, isActuallyConnected: ${isActuallyConnected}`,
            );
          } catch (error) {
            this.logger.warn(
              `[QR_HANDLER] Failed to get client state for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
            );
            isActuallyConnected = false;
            state = null;
          }
        } else {
          this.logger.debug(
            `[QR_HANDLER] Client not found in clients map for session ${sessionId}, accepting QR code`,
          );
          isActuallyConnected = false;
        }

        if (isActuallyConnected) {
          this.logger.warn(
            `[QR_HANDLER] Ignoring QR code for actually connected session: ${sessionId} (status: ${existingSession.status}, client state: CONNECTED). This is normal during reconnections.`,
          );
          return;
        } else {
          this.logger.warn(
            `[QR_HANDLER] Session status is ${existingSession.status} but client is not actually connected. Accepting QR code and updating status to QR_REQUIRED.`,
          );
          this.logger.warn(
            `[QR_HANDLER] This typically means RemoteAuth has no saved session to restore yet (or it was deleted). Note: whatsapp-web.js RemoteAuth only saves backups every backupSyncIntervalMs (min 60000ms). If the server restarts soon after linking, you'll need to scan QR again.`,
          );
          // Continue to process QR code and update status
        }
      }

      // Generate QR code as base64 image
      const qrCodeDataUrl = await QRCode.toDataURL(qrData);
      const qrCodeBase64 = qrCodeDataUrl.split(",")[1]; // Remove data:image/png;base64, prefix

      const expiresAt = new Date(Date.now() + 60000); // 1 minute expiry
      const session = await this.sessionModel.findOneAndUpdate(
        { sessionId },
        {
          status: SessionStatus.QR_REQUIRED,
          qrCode: qrCodeBase64,
          qrCodeGeneratedAt: new Date(),
          qrCodeExpiresAt: expiresAt,
        },
        { new: true },
      );

      if (!session) {
        this.logger.error(
          `[QR_HANDLER] Failed to update session with QR code: ${sessionId}`,
        );
        return;
      }

      // If a session requires QR, it is not connected anymore.
      // Keep user-level connection status in sync for UI/filters.
      if ((session as any).userId) {
        try {
          await this.userModel.findByIdAndUpdate((session as any).userId, {
            whatsappConnectionStatus: WhatsAppConnectionStatus.DISCONNECTED,
          });
        } catch (error) {
          this.logger.warn(
            `[QR_HANDLER] Failed to mark user WhatsApp status DISCONNECTED on QR_REQUIRED: sessionId=${sessionId}, userId=${String(
              (session as any).userId,
            )}, error=${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.logger.log(
        `[QR_HANDLER] QR Code generated and saved for session: ${sessionId}`,
      );

      this.qrGateway.emitQrUpdate(sessionId, {
        qrCode: session.qrCode,
        expiresAt,
      });
      this.qrGateway.emitStatus(sessionId, {
        status: SessionStatus.QR_REQUIRED,
      });

      this.logger.debug(
        `[QR_HANDLER] QR ready for session ${sessionId}; awaiting user to scan.`,
      );
    } catch (error) {
      this.logger.error(
        `[QR_HANDLER] Failed to handle QR code for session: ${sessionId}`,
        error,
      );
      this.qrGateway.emitStatus(sessionId, {
        status: SessionStatus.FAILED,
        message:
          error instanceof Error ? error.message : "QR generation failed",
      });
    }
  }

  async handleReady(sessionId: string, client: Client): Promise<void> {
    try {
      const info = client.info;

      // Enforce: connected WhatsApp phone must match the owning user's phone number
      const connectedDigits = this.normalizePhoneDigits(info?.wid?.user);
      const connectedE164 = connectedDigits ? `+${connectedDigits}` : null;

      const existingSession = await this.sessionModel
        .findOne({ sessionId })
        .select("userId")
        .lean();

      const sessionUserId = (existingSession as any)?.userId;
      if (sessionUserId) {
        const user = await this.userModel
          .findById(sessionUserId)
          .select("phoneNumber")
          .lean();

        const expectedE164 = (user as any)?.phoneNumber || null;
        const expectedDigits = this.normalizePhoneDigits(expectedE164);

        if (
          expectedDigits &&
          connectedDigits &&
          expectedDigits !== connectedDigits
        ) {
          await this.failSessionWithPhoneMismatch({
            sessionId,
            userId: sessionUserId,
            expectedPhone: expectedE164,
            connectedPhone: connectedE164,
          });
          return;
        }
      }

      const session = await this.sessionModel.findOneAndUpdate(
        { sessionId },
        {
          status: SessionStatus.READY,
          phoneNumber: connectedE164 || info?.wid?.user,
          whatsappName: info.pushname,
          whatsappId: info.wid._serialized,
          connectedAt: new Date(),
          lastActivityAt: new Date(),
          qrCode: null, // Clear QR code
        },
        { new: true },
      );

      if (session && session.userId) {
        // Update user's WhatsApp connection status to CONNECTED
        const now = new Date();
        await this.userModel.findByIdAndUpdate(
          session.userId,
          {
            whatsappConnectionStatus: WhatsAppConnectionStatus.CONNECTED,
            whatsappConnectedAt: now,
          },
          { new: true },
        );

        // Best-effort: mark last QR invitation as "scanned" when connection completes
        try {
          const user = await this.userModel
            .findById(session.userId)
            .select("qrInvitationHistory")
            .lean();
          const history = (user as any)?.qrInvitationHistory;
          if (Array.isArray(history) && history.length > 0) {
            const lastIndex = history.length - 1;
            const last = history[lastIndex];
            if (last && !last.scannedAt) {
              await this.userModel.updateOne(
                { _id: session.userId },
                {
                  $set: { [`qrInvitationHistory.${lastIndex}.scannedAt`]: now },
                },
              );
            }
          }
        } catch {
          // ignore
        }
        this.logger.log(
          `Updated user ${session.userId} WhatsApp connection status to CONNECTED`,
        );
      }

      this.logger.log(
        `Session ready: ${sessionId} - ${info.pushname} (${info.wid.user})`,
      );
      this.qrGateway.emitStatus(sessionId, { status: SessionStatus.READY });

      // Post-ready diagnostic: after RemoteAuth's 60s initial stability delay, the backup should be updated.
      // This lets us verify whether backups are actually being written (and if the uploadDate changes).
      try {
        const authClientId = await this.remoteAuthService.ensureAuthClientId(sessionId);
        const sessionName = `RemoteAuth-${authClientId}`;
        setTimeout(() => {
          void this.remoteAuthService.logRemoteAuthGridFsInfo(sessionName);
        }, 70000);
      } catch {
        // ignore
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle ready event for session: ${sessionId}`,
        error,
      );
    }
  }

  async handleDisconnected(sessionId: string, reason: string): Promise<void> {
    // If we initiated a disconnect with preserveStatus, ignore destroy-triggered events
    if (this.sessionService.disconnectingWithPreserve.has(sessionId)) {
      this.logger.debug(
        `[SERVICE] Ignoring disconnected event for ${sessionId} (preserveStatus in effect)`,
      );
      this.sessionService.disconnectingWithPreserve.delete(sessionId);
      this.clients.delete(sessionId);
      this.sessionService.stopSessionLockRefresh(sessionId);
      await this.sessionService.releaseSessionLock(sessionId);
      return;
    }

    const normalizedReason = String(reason || "").toUpperCase();
    const client = this.clients.get(sessionId);

    const session = await this.sessionModel.findOneAndUpdate(
      { sessionId },
      {
        status: SessionStatus.DISCONNECTED,
        disconnectedAt: new Date(),
        lastError: reason,
        lastErrorAt: new Date(),
      },
      { new: true },
    );



    // TODO: Configure Telemetry
    // const isBlocked =
    //   normalizedReason.includes("BLOCK") ||
    //   normalizedReason.includes("BANNED") ||
    //   normalizedReason.includes("BAN");
    // recordWhatsAppAlertEvent({
    //   eventType: isBlocked ? "blocked" : "disconnected",
    //   sessionId,
    //   tenantId: session?.tenantId?.toString?.(),
    //   phoneNumber: session?.phoneNumber,
    //   reason,
    //   status: SessionStatus.DISCONNECTED,
    // });

    if (session && session.userId) {
      // Update user's WhatsApp connection status to DISCONNECTED
      await this.userModel.findByIdAndUpdate(
        session.userId,
        {
          whatsappConnectionStatus: WhatsAppConnectionStatus.DISCONNECTED,
        },
        { new: true },
      );
      this.logger.log(
        `Updated user ${session.userId} WhatsApp connection status to DISCONNECTED`,
      );
    }

    // On LOGOUT or similar, attempt to clean up session files so next init won't fail on locks
    if (
      normalizedReason.includes("LOGOUT") ||
      normalizedReason.includes("UNPAIRED")
    ) {
      try {
        // Best-effort: force-kill browser process tree to release file locks (Windows EBUSY)
        const pid = this.getClientBrowserPid(client);
        try {
          if (client) {
            client.removeAllListeners();
            await client.destroy();
          }
        } catch {
          // ignore
        }
        if (pid) {
          killProcessTree(pid).catch(e => {
            this.logger.error(e.message)
          });
        }

        const cleaned = await this.sessionService.cleanupSessionFilesForSession(sessionId);
        if (!cleaned) {
          const rotated = await this.remoteAuthService.rotateAuthClientId(sessionId);
          this.logger.warn(
            `[SERVICE] Session files still locked after LOGOUT; rotating RemoteAuth clientId: sessionId=${sessionId}, authClientId=${rotated}`,
          );
        }
        this.logger.debug(
          `[SERVICE] Cleaned up session files after logout for ${sessionId}`,
        );
      } catch (cleanupError) {
        this.logger.warn(
          `[SERVICE] Failed to clean session files after logout for ${sessionId}: ${
            cleanupError instanceof Error ? cleanupError.message : cleanupError
          }`,
        );
      }
    }

    this.clients.delete(sessionId);
    this.sessionService.stopSessionLockRefresh(sessionId);
    await this.sessionService.releaseSessionLock(sessionId);
    this.qrGateway.emitStatus(sessionId, {
      status: SessionStatus.DISCONNECTED,
      message: reason,
    });
  }

  async handleIncomingMessage(sessionId: string, message: any): Promise<void> {
    try {
      const session = await this.sessionModel.findOne({ sessionId });
      if (!session) return;

      const isCallLog = this.isCallLogMessage(message);
      const hasContent = message.body && message.body.trim() !== "";
      const hasMedia = message.hasMedia;

      if (!hasContent && !hasMedia && !isCallLog) {
        return;
      }

      // Check if message already exists by whatsappMessageId
      const existingMessage = await this.messageModel.findOne({
        whatsappMessageId: message.id._serialized,
      });

      if (existingMessage) {
        return;
      }

      // Check for duplicate by content (from + to + content + timestamp within 5 seconds)
      const messageTimestamp = new Date(message.timestamp * 1000);
      const timeWindow = 5000;
      const duplicateByContent = await this.messageModel.findOne({
        from: message.from,
        to: message.to,
        content: message.body || "",
        sentAt: {
          $gte: new Date(messageTimestamp.getTime() - timeWindow),
          $lte: new Date(messageTimestamp.getTime() + timeWindow),
        },
      });

      if (duplicateByContent) {
        return;
      }

      // Get entity with path
      const entity = await this.entityService.findOne(
        session.entityId.toString()
      );
      if (!entity.entityIdPath || entity.entityIdPath.length === 0) {
        this.logger.warn(
          `Failed to get entity path for entity: ${session.entityId}`,
        );
      }

      // Check if message is a reply
      let quotedMessage;
      if (message.hasQuotedMsg) {
        try {
          // Get the quoted message
          quotedMessage = await message.getQuotedMessage() as WAWebJS.Message;
          this.logger.log(
            `Reply detected - Original message: ${quotedMessage.id._serialized} from ${quotedMessage.from}`,
          );
        } catch (error) {
          this.logger.warn(`Failed to fetch quoted message: ${error.message}`);
        }
      }

      let mediaUrl ;
      if (message.hasMedia) {
        mediaUrl = await this.handleMediaUpload(message);
      }

      // Check if sender is a registered user (external number detection)
      const cleanedPhoneNumber = this.cleanPhoneNumber(message.from);
      const registeredUser = await this.checkIfRegisteredUser(
        cleanedPhoneNumber,
        session.tenantId,
      );

      // Get contact info for sender (FROM)
      const fromContactInfo = await this.getContactInfo(message);

      // Get contact info for recipient (TO - session owner)
      const toPhoneNumber = this.getE164FromSession(sessionId);
      let toContactInfo ;
      try {
        // Get the session owner's contact from WhatsApp
        const client = this.clients.get(sessionId);
        if (client) {
          const toContact = await client.getContactById(toPhoneNumber);
          if (toContact) {
            toContactInfo = {
              name:
                toContact.pushname ||
                toContact.name ||
                toContact.shortName ||
                toPhoneNumber,
              phone: toContact.number || toPhoneNumber,
              avatarUrl: null,
              username: toContact.pushname || toContact.name || undefined,
            };
            try {
              const profilePicUrl = await toContact.getProfilePicUrl();
              toContactInfo.avatarUrl = profilePicUrl || undefined;
            } catch (error) {
              // Profile picture not available
            }
          }
        }
      } catch (error) {
        this.logger.debug(
          `Failed to get recipient contact info: ${error.message}`,
        );
      }

      // Fallback to session user info if contact info not available
      if (!toContactInfo) {
        const sessionUser = await this.userModel.findOne({
          phoneNumber: toPhoneNumber,
        });
        toContactInfo = {
          name: sessionUser
            ? `${sessionUser.firstName} ${sessionUser.lastName}`
            : toPhoneNumber,
          phone: toPhoneNumber,
          avatarUrl: undefined,
          username: undefined,
        };
      }

      const isExternalNumber = !registeredUser;

      this.logger.log(
        `Message from ${cleanedPhoneNumber}: ${isExternalNumber ? "EXTERNAL" : "REGISTERED"} - ${fromContactInfo.name}`,
      );

      const contact = await message.getContact();

      const fromPhoneNumber = this.cleanPhoneNumber(contact.number);
      const toPhoneNumberFinal = this.getE164FromSession(sessionId);

      // Determine conversation ID - use group name if group, otherwise use phone number
      const conversationId =
        fromContactInfo.isGroup && fromContactInfo.groupName
          ? `group-${fromContactInfo.groupName}`
          : message.from;

      // Determine names: use group name if group, otherwise use contact name
      const fromName =
        fromContactInfo.isGroup && fromContactInfo.groupName
          ? fromContactInfo.groupName
          : fromContactInfo.name || fromPhoneNumber;

      const toName = toContactInfo.name || toPhoneNumberFinal;

      const messageData = {
        _id: new Types.ObjectId(),
        whatsappMessageId: message.id._serialized,
        from: message.from,
        to: message.to,
        fromPhoneNumber,
        toPhoneNumber: toPhoneNumberFinal,
        // New fields: names and avatars
        fromName,
        toName,
        fromAvatarUrl: fromContactInfo.avatarUrl,
        toAvatarUrl: toContactInfo.avatarUrl,
        type: this.getMessageType(message.type),
        direction: MessageDirection.INBOUND,
        content: message.body || (isCallLog ? "Call log" : ""),
        mediaUrl,
        status: MessageStatus.DELIVERED,
        sentAt: new Date(message.timestamp * 1000),
        deliveredAt: new Date(),
        conversationId: conversationId,
        entityId: session.entityId,
        entityIdPath: entity.entityIdPath,
        tenantId: session.tenantId,
        // External number detection fields
        isExternalNumber,
        whatsappUsername: fromContactInfo.username || fromContactInfo.name,
        whatsappGroupName: fromContactInfo.groupName,
        isGroupMessage: fromContactInfo.isGroup || false,
        metadata: {
          hasMedia: message.hasMedia,
          isForwarded: message.isForwarded,
          isStarred: message.isStarred,
          mediaType: message.type,
          caption: message.caption,
          callLog: isCallLog,
          callLogType: message.type,
          callLogBody: message.body,
          // Add reply metadata
          isReply: message.hasQuotedMsg,
          quotedMessageId: quotedMessage?.id?._serialized,
          quotedMessageFrom: quotedMessage?.from,
          quotedMessageBody: quotedMessage?.body,
          // External number metadata
          senderContactName: fromContactInfo.name,
          senderContactPhone: fromContactInfo.phone,
          isExternalSender: isExternalNumber,
          registeredUserInfo: registeredUser
            ? {
              firstName: registeredUser.firstName,
              lastName: registeredUser.lastName,
              email: registeredUser.email,
              role: registeredUser.role,
            }
            : null,
        },
      };

      await this.messageModel.create(messageData);

      // Update session statistics
      await this.sessionModel.findOneAndUpdate(
        { sessionId },
        {
          $inc: { messagesReceived: 1 },
          lastActivityAt: new Date(),
        },
      );

      this.logger.log(`Incoming message saved: ${message.id._serialized}`);
    } catch (error) {
      this.logger.error(
        `Failed to handle incoming message: ${error.message}`,
        error,
      );
    }
  }

  async handleOutgoingMessage(sessionId: string, message: any): Promise<void> {
    try {
      const session = await this.sessionModel.findOne({ sessionId });
      if (!session) return;

      const isCallLog = this.isCallLogMessage(message);
      const hasContent = message.body && message.body.trim() !== "";
      const hasMedia = message.hasMedia;

      if (!hasContent && !hasMedia && !isCallLog) {
        return;
      }

      // Check if message already exists by whatsappMessageId
      const existingMessage = await this.messageModel.findOne({
        whatsappMessageId: message.id._serialized,
      });

      if (existingMessage) {
        return;
      }

      // Check for duplicate by content (from + to + content + timestamp within 5 seconds)
      const messageTimestamp = new Date(message.timestamp * 1000);
      const timeWindow = 5000;
      const duplicateByContent = await this.messageModel.findOne({
        from: message.from,
        to: message.to,
        content: message.body || "",
        sentAt: {
          $gte: new Date(messageTimestamp.getTime() - timeWindow),
          $lte: new Date(messageTimestamp.getTime() + timeWindow),
        },
      });

      if (duplicateByContent) {
        return;
      }

      // Get entity with path
      const entity = await this.entityService.findOne(session.entityId.toString());
      if (!entity.entityIdPath || entity.entityIdPath.length === 0) {
        this.logger.warn(
          `Failed to get entity path for entity: ${session.entityId}`,
        );
      }

      let mediaUrl;
      if (message.hasMedia) {
        mediaUrl = await this.handleMediaUpload(message);
      }

      // Get contact info for recipient (TO)
      const toContactInfo = await this.getContactInfo(message);
      // Get contact info for sender (FROM - session owner)
      const fromPhoneNumber = this.getE164FromSession(sessionId);
      let toPhoneNumber = message.to;
      const isGroupDestination =
        String(message?.to || "").includes("@g.us") ||
        String(toContactInfo?.phone || "").includes("@g.us") ||
        !!toContactInfo?.isGroup;

      // Best-effort: resolve group name for outbound group messages
      let resolvedGroupName: string | undefined = toContactInfo?.groupName;
      if (isGroupDestination && !resolvedGroupName) {
        try {
          const chat = await message.getChat();
          resolvedGroupName = chat?.name || undefined;
        } catch {
          // ignore
        }
      }

      let fromContactInfo;
      let toName = isGroupDestination
        ? resolvedGroupName || String(message?.to || "")
        : "Unknown";
      try {
        // Get the session owner's contact from WhatsApp
        const client = this.clients.get(sessionId);
        if (client) {
          const toContact = await client.getContactById(message.to);
          if (toContact) {
            // If this is a group destination, preserve the JID and prefer the group subject/name.
            if (isGroupDestination) {
              toPhoneNumber = message.to; // keep group JID (e.g., 123@g.us)
              toName =
                resolvedGroupName ||
                toContact.name ||
                toContact.pushname ||
                message.to;
            } else {
              toPhoneNumber = this.cleanPhoneNumber(toContact.number);
              toName = toContact.pushname || toContact.name || toPhoneNumber;
            }
          }
        }
        if (client) {
          const fromContact = await client.getContactById(fromPhoneNumber);
          if (fromContact) {
            fromContactInfo = {
              name:
                fromContact.pushname ||
                fromContact.name ||
                fromContact.shortName ||
                fromPhoneNumber,
              phone: fromContact.number || fromPhoneNumber,
              avatarUrl: null,
              username: fromContact.pushname || fromContact.name || undefined,
            };
            try {
              const profilePicUrl = await fromContact.getProfilePicUrl();
              fromContactInfo.avatarUrl = profilePicUrl || undefined;
            } catch (error) {
              // Profile picture not available
            }
          }
        }
      } catch (error) {
        this.logger.debug(
          `Failed to get sender contact info: ${error.message}`,
        );
      }

      // Fallback to session user info if contact info not available
      if (!fromContactInfo) {
        const sessionUser = await this.userModel.findOne({
          phoneNumber: fromPhoneNumber,
        });
        fromContactInfo = {
          name: sessionUser
            ? `${sessionUser.firstName} ${sessionUser.lastName}`
            : fromPhoneNumber,
          phone: fromPhoneNumber,
          avatarUrl: undefined,
          username: undefined,
        };
      }

      // Determine conversation ID
      const conversationId =
        isGroupDestination && resolvedGroupName
          ? `group-${resolvedGroupName}`
          : message.to;

      // Determine names: use group name if group, otherwise use contact name
      const fromName = fromContactInfo.name || fromPhoneNumber;

      const messageData = {
        _id: new Types.ObjectId(),
        whatsappMessageId: message.id._serialized,
        from: message.from,
        to: message.to,
        fromPhoneNumber,
        toPhoneNumber,
        // New fields: names and avatars
        fromName,
        toName,
        fromAvatarUrl: toContactInfo.avatarUrl,
        toAvatarUrl: fromContactInfo.avatarUrl,
        type: this.getMessageType(message.type),
        direction: MessageDirection.OUTBOUND,
        content: message.body || (isCallLog ? "Call log" : ""),
        mediaUrl,
        status: MessageStatus.SENT,
        sentAt: new Date(message.timestamp * 1000),
        conversationId: conversationId,
        entityId: session.entityId,
        entityIdPath: entity.entityIdPath,
        tenantId: session.tenantId,
        // WhatsApp contact information
        whatsappUsername: toContactInfo.username || toContactInfo.name,
        whatsappGroupName: resolvedGroupName,
        isGroupMessage: isGroupDestination,
        metadata: {
          hasMedia: message.hasMedia,
          isForwarded: message.isForwarded,
          isStarred: message.isStarred,
          mediaType: message.type,
          caption: message.caption,
          callLog: isCallLog,
          callLogType: message.type,
          callLogBody: message.body,
        },
      };

      await this.messageModel.create(messageData);

      // Update session statistics
      await this.sessionModel.findOneAndUpdate(
        { sessionId },
        {
          $inc: { messagesSent: 1 },
          lastActivityAt: new Date(),
        },
      );

      this.logger.log(`Outgoing message saved: ${message.id._serialized}`);
    } catch (error) {
      this.logger.error(
        `Failed to handle outgoing message: ${error.message}`,
        error,
      );
    }
  }

  async handleCallEvent(sessionId: string, call: any): Promise<void> {
    try {
      const session = await this.sessionModel.findOne({ sessionId });
      if (!session) return;

      const callId =
        call?.id?._serialized || call?.id || `${sessionId}-call-${Date.now()}`;
      const callIdStr = callId.toString();

      const entity = await this.entityService.findOne(session.entityId.toString());
      if (!entity.entityIdPath || entity.entityIdPath.length === 0) {
        this.logger.warn(
          `Failed to get entity path for entity: ${session.entityId}`,
        );
      }

      const sessionE164 = this.getE164FromSession(sessionId);
      const sessionJid = sessionE164
        ? `${sessionE164.replace(/\+/g, "")}@c.us`
        : sessionId;

      const sessionDigits = sessionE164
        ? sessionE164.replace(/[^\d]/g, "")
        : null;
      const jidMatchesSession = (jid?: string) => {
        if (!jid || !sessionDigits) return false;
        const digits = jid.replace(/[^\d]/g, "");
        return digits.endsWith(sessionDigits);
      };

      const isFromSession =
        jidMatchesSession(call?.from) || jidMatchesSession(call?.id?.from);
      const isFromMe = call?.fromMe ?? call?.id?.fromMe ?? isFromSession;

      // Resolve counterparty JID (not the session owner)
      const pickRemoteJid = (): string | null => {
        const candidates = [
          // Outbound typically has `to`
          call?.to,
          // Common peer fields
          call?.peerJid,
          call?.peer,
          call?.id?.remote,
          call?.id?.to,
          call?.id?.user,
          call?.id?.from,
          call?.from,
        ].filter(Boolean) as string[];

        for (const jid of candidates) {
          if (!jidMatchesSession(jid)) {
            return jid;
          }
        }
        return null;
      };

      const remoteJidOriginal = pickRemoteJid() || "";
      const normalizedRemoteJid =
        this.normalizeJid(remoteJidOriginal) || remoteJidOriginal;
      let resolvedRemoteJid = normalizedRemoteJid || remoteJidOriginal;

      // Resolve LID to actual phone number
      const isLid = remoteJidOriginal.endsWith("@lid");
      let resolvedE164FromLid: string | null = null;
      if (isLid) {
        try {
          const client = this.clients.get(sessionId);
          if (client) {
            const contact = await client.getContactById(remoteJidOriginal);
            if (contact && contact.number) {
              resolvedE164FromLid = this.cleanPhoneNumber(contact.number);
              resolvedRemoteJid = `${contact.number}@c.us`;
              this.logger.debug(
                `Resolved LID ${remoteJidOriginal} → ${resolvedE164FromLid}`,
              );
            }
          }
        } catch (error) {
          this.logger.debug(
            `Failed to resolve LID ${remoteJidOriginal}: ${error.message}`,
          );
        }
      }

      const direction = isFromMe
        ? MessageDirection.OUTBOUND
        : MessageDirection.INBOUND;

      const from =
        direction === MessageDirection.OUTBOUND
          ? sessionJid
          : resolvedRemoteJid || sessionJid;
      const to =
        direction === MessageDirection.OUTBOUND
          ? resolvedRemoteJid || sessionJid
          : sessionJid;

      // Use resolved E.164 from LID if available, otherwise try to clean the JID
      const remotePhoneNumber = resolvedE164FromLid
        ? resolvedE164FromLid
        : resolvedRemoteJid
          ? this.cleanPhoneNumber(resolvedRemoteJid)
          : null;

      const fromPhoneNumber =
        direction === MessageDirection.OUTBOUND
          ? sessionE164
          : remotePhoneNumber || sessionE164;

      const toPhoneNumber =
        direction === MessageDirection.OUTBOUND
          ? remotePhoneNumber || resolvedRemoteJid || sessionE164
          : sessionE164;

      const callTimestamp = call?.timestamp
        ? new Date(call.timestamp * 1000)
        : new Date();

      let remoteName = remotePhoneNumber || resolvedRemoteJid || "Unknown";
      let remoteAvatarUrl;
      try {
        const client = this.clients.get(sessionId);
        if (client && resolvedRemoteJid) {
          const contact = await client.getContactById(resolvedRemoteJid);
          if (contact) {
            remoteName =
              contact.pushname ||
              contact.name ||
              contact.shortName ||
              remoteName;
            try {
              const profilePicUrl = await contact.getProfilePicUrl();
              remoteAvatarUrl = profilePicUrl || undefined;
            } catch {
              // Profile picture not available
            }
          }
        }
      } catch (error) {
        this.logger.debug(
          `Failed to get contact info for call ${callId}: ${error.message}`,
        );
      }

      let sessionOwnerName =
        session.phoneNumber || sessionE164 || sessionId || "Me";
      try {
        const sessionUser = await this.userModel.findOne({
          phoneNumber: sessionE164,
        });
        if (sessionUser) {
          sessionOwnerName =
            `${sessionUser.firstName} ${sessionUser.lastName}`.trim();
        }
      } catch (error) {
        this.logger.debug(
          `Failed to load session owner for call ${callId}: ${error.message}`,
        );
      }

      const registrationCheckNumber =
        direction === MessageDirection.OUTBOUND
          ? toPhoneNumber
          : remotePhoneNumber;
      const registeredRemote =
        registrationCheckNumber && session.tenantId
          ? await this.checkIfRegisteredUser(
            registrationCheckNumber,
            session.tenantId,
          )
          : null;
      const isExternalNumber = !registeredRemote;

      const translationKey =
        direction === MessageDirection.OUTBOUND
          ? call?.isVideo
            ? "call.outgoing.video"
            : "call.outgoing.voice"
          : call?.isVideo
            ? "call.incoming.video"
            : "call.incoming.voice";

      const content =
        direction === MessageDirection.OUTBOUND
          ? call?.isVideo
            ? "Outgoing video call"
            : "Outgoing voice call"
          : call?.isVideo
            ? "Incoming video call"
            : "Incoming voice call";

      const conversationId = normalizedRemoteJid || sessionJid;

      const messageData = {
        whatsappMessageId: callIdStr,
        from,
        to,
        fromPhoneNumber: fromPhoneNumber || from,
        toPhoneNumber: toPhoneNumber || to,
        fromName:
          direction === MessageDirection.OUTBOUND
            ? sessionOwnerName
            : remoteName,
        toName:
          direction === MessageDirection.OUTBOUND
            ? remoteName
            : sessionOwnerName,
        fromAvatarUrl:
          direction === MessageDirection.OUTBOUND ? undefined : remoteAvatarUrl,
        toAvatarUrl:
          direction === MessageDirection.OUTBOUND ? remoteAvatarUrl : undefined,
        type: MessageType.CALL,
        direction,
        content,
        mediaUrl: '',
        status:
          direction === MessageDirection.OUTBOUND
            ? MessageStatus.SENT
            : MessageStatus.DELIVERED,
        sentAt: callTimestamp,
        deliveredAt:
          direction === MessageDirection.INBOUND ? new Date() : undefined,
        conversationId,
        entityId: session.entityId,
        entityIdPath: entity.entityIdPath,
        tenantId: session.tenantId,
        isExternalNumber,
        metadata: {
          isGroup: !!call?.isGroup,
          isVideo: !!call?.isVideo,
          isOnline: call?.isOnline,
          canHandle: call?.canHandle,
          isOffer: !!call?.isOffer,
          remoteJid: normalizedRemoteJid,
          remoteJidOriginal,
          duration: call?.duration ?? call?.time ?? call?.t,
          translationKey,
          translationParams: {
            direction,
            isVideo: !!call?.isVideo,
          },
          callPayload: {
            id: call?.id?._serialized || call?.id,
            from: call?.from,
            to: call?.to,
            timestamp: call?.timestamp,
            rawType: call?.type,
          },
        },
      };

      const existingCall = await this.messageModel.findOne({
        whatsappMessageId: callIdStr,
      });

      if (existingCall) {
        await this.messageModel.findOneAndUpdate(
          { whatsappMessageId: callId },
          { $set: messageData },
        );
        this.logger.log(`Call event updated: ${callId} (${direction})`);
        return;
      }

      await this.messageModel.create({
        _id: new Types.ObjectId(),
        ...messageData,
      });

      await this.sessionModel.findOneAndUpdate(
        { sessionId },
        {
          $inc:
            direction === MessageDirection.OUTBOUND
              ? { messagesSent: 1 }
              : { messagesReceived: 1 },
          lastActivityAt: new Date(),
        },
      );

      this.logger.log(`Call event saved: ${callId} (${direction})`);
    } catch (error) {
      this.logger.error(`Failed to handle call event: ${error.message}`, error);
    }
  }

  async handleMessageAck(
    sessionId: string,
    message: any,
    ack: number,
  ): Promise<void> {
    try {
      const statusMap = new Map<number, MessageStatus>([
        [0, MessageStatus.PENDING],
        [1, MessageStatus.SENT],
        [2, MessageStatus.DELIVERED],
        [3, MessageStatus.READ],
        [-1, MessageStatus.FAILED],
      ]);

      const status = statusMap.get(ack) || MessageStatus.PENDING;
      const updateData: any = { status };

      if (status === MessageStatus.SENT) updateData.sentAt = new Date();
      if (status === MessageStatus.DELIVERED)
        updateData.deliveredAt = new Date();
      if (status === MessageStatus.READ) updateData.readAt = new Date();
      if (status === MessageStatus.FAILED) updateData.failedAt = new Date();

      await this.messageModel.findOneAndUpdate(
        { whatsappMessageId: message.id._serialized },
        updateData,
      );

      // Update session statistics
      if (status === MessageStatus.DELIVERED) {
        await this.sessionModel.findOneAndUpdate(
          { sessionId },
          { $inc: { messagesDelivered: 1 } },
        );
      } else if (status === MessageStatus.FAILED) {
        await this.sessionModel.findOneAndUpdate(
          { sessionId },
          { $inc: { messagesFailed: 1 } },
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle message ack: ${error.message}`,
        error,
      );
    }
  }

  getClientBrowserPid(client: Client | undefined): number | undefined {
    try {
      const pid = (client as any)?.pupBrowser?.process?.()?.pid;
      return typeof pid === "number" ? pid : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Normalize a WhatsApp JID to the standard user format (e.g., 123@c.us).
   * Groups and broadcast JIDs are returned unchanged.
   */
  private normalizeJid(jid?: string): string | null {
    if (!jid) return null;
    const lower = jid.toLowerCase();
    const isGroup = lower.endsWith("@g.us") || lower.includes("@broadcast");
    if (isGroup) return jid;

    const digitsOnly = jid.replace(/[^\d]/g, "");
    if (!digitsOnly) return jid;

    return `${digitsOnly}@c.us`;
  }

  private getMessageType(type: string): MessageType {
    const typeMap: Record<string, MessageType> = {
      chat: MessageType.TEXT,
      image: MessageType.IMAGE,
      video: MessageType.VIDEO,
      audio: MessageType.AUDIO,
      ptt: MessageType.AUDIO,
      document: MessageType.DOCUMENT,
      location: MessageType.LOCATION,
      vcard: MessageType.CONTACT,
      sticker: MessageType.STICKER,
      call: MessageType.CALL,
      call_log: MessageType.CALL,
    };
    return typeMap[type] || MessageType.TEXT;
  }

  private async getContactInfo(message: any): Promise<{
    name: string;
    phone: string;
    avatarUrl?: string;
    username?: string;
    groupName?: string;
    isGroup?: boolean;
  }> {
    try {
      const fromJid = String(message?.from || "");
      const toJid = String(message?.to || "");
      const groupJid = fromJid.includes("@g.us")
        ? fromJid
        : toJid.includes("@g.us")
          ? toJid
          : null;

      // Try to get contact info from WhatsApp
      const contact = await message.getContact();
      const name = contact.pushname || contact.name || contact.shortName || "";
      // For group chats, prefer the group JID as the "phone" identifier
      const phone = groupJid || contact.number || fromJid;

      // Get profile picture URL
      let avatarUrl = null;
      try {
        const profilePicUrl = await contact.getProfilePicUrl();
        avatarUrl = profilePicUrl || null;
      } catch (error) {
        // Profile picture not available
        this.logger.debug(`No profile picture for ${phone}`);
      }

      // Check if message is from a group
      let groupName = null;
      let isGroup = false;
      try {
        if (groupJid) {
          isGroup = true;
          const chat = await message.getChat();
          groupName = chat.name || null;
        }
      } catch (error) {
        this.logger.debug(
          `Not a group message or failed to get group info: ${error.message}`,
        );
      }

      return {
        name: (isGroup ? (groupName || "").trim() : name.trim()) || "Unknown",
        phone,
        avatarUrl: avatarUrl || undefined,
        username: isGroup ? undefined : name.trim() || undefined,
        groupName: groupName || undefined,
        isGroup: isGroup,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to get contact info for ${message.from}:`,
        error,
      );
      return {
        name: "Unknown",
        phone: String(message?.to || message?.from || ""),
      };
    }
  }

  private async checkIfRegisteredUser(
    phoneNumber: string,
    tenantId: Types.ObjectId,
  ): Promise<any> {
    try {
      // Find user by phone number within the tenant
      const user = await this.userModel
        .findOne({
          phoneNumber: phoneNumber,
          tenantId: tenantId,
          isActive: true,
          registrationStatus: { $in: ["registered", "invited"] },
        })
        .select("firstName lastName email phoneNumber role");

      return user;
    } catch (error) {
      this.logger.error(
        `Error checking registered user for ${phoneNumber}:`,
        error,
      );
      return null;
    }
  }

  private getE164FromSession(sessionId: string): string {
    try {
      const e164 = sessionId.replace("whatsapp-", "+");
      return this.cleanPhoneNumber(e164);
    } catch (error) {
      this.logger.error(`Failed to get E164 from session ${sessionId}:`, error);
      return '';
    }
  }

  private cleanPhoneNumber(phoneNumber: string): string {
    // Remove any non-digit characters except +
    let cleaned = phoneNumber.replace(/[^\d+]/g, "");

    // If it doesn't start with +, assume it needs country code
    if (!cleaned.startsWith("+")) {
      // This is a simplified approach - in production you might want to use a library like libphonenumber
      // For now, we'll just return the original number
      cleaned = "+" + cleaned;
    }

    return cleaned;
  }

  private async handleMediaUpload(message: any): Promise<string | null> {
    try {
      const media = await message.downloadMedia();
      if (!media) return null;

      const { data, mimetype } = media;
      const extension = mimetype.split("/")[1];
      const fileName = `${message.id._serialized}.${extension}`;

      // Convert base64 to buffer
      const buffer = Buffer.from(data, "base64");

      // Upload to cloud storage using StorageService
      // TODO: Use Azure storage here
      const uploadResult = await this.storageService.uploadFile(
        buffer,
        fileName,
        mimetype,
        "whatsapp-media",
      );

      this.logger.log(`Media uploaded to cloud storage: ${uploadResult.url}`);
      // Return proxy URL instead of direct cloud storage URL
      return uploadResult.proxyUrl;
    } catch (error) {
      this.logger.error(`Failed to upload media: ${error.message}`, error);
      return null;
    }
  }

  private normalizePhoneDigits(value?: string | null): string {
    return String(value || "").replace(/[^0-9]/g, "");
  }

  private async failSessionWithPhoneMismatch(params: {
    sessionId: string;
    userId?: Types.ObjectId | string | null;
    expectedPhone?: string | null;
    connectedPhone?: string | null;
  }): Promise<void> {
    const now = new Date();
    const message =
      "Connected WhatsApp number does not match this user's phone number.";

    await this.sessionModel.findOneAndUpdate(
      { sessionId: params.sessionId },
      {
        status: SessionStatus.FAILED,
        lastError: "PHONE_MISMATCH",
        lastErrorAt: now,
        disconnectedAt: now,
        qrCode: null,
        qrCodeGeneratedAt: null,
        qrCodeExpiresAt: null,
      },
      { new: false },
    );

    if (params.userId) {
      try {
        await this.userModel.findByIdAndUpdate(params.userId, {
          whatsappConnectionStatus: WhatsAppConnectionStatus.FAILED,
          whatsappConnectedAt: null,
        });
      } catch (error) {
        this.logger.warn(
          `[SECURITY] Failed to mark user WhatsApp status FAILED on phone mismatch: sessionId=${params.sessionId}, userId=${String(
            params.userId,
          )}, error=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.warn(
      `[SECURITY] WhatsApp phone mismatch: sessionId=${params.sessionId}, expected=${this.maskPhoneDigits(
        params.expectedPhone,
      )}, connected=${this.maskPhoneDigits(params.connectedPhone)}`,
    );

    // Best-effort: explicitly LOGOUT so WhatsApp mobile app removes it from "Linked devices".
    // `destroy()` alone may leave the device listed as linked for a while.
    const client = this.clients.get(params.sessionId);
    if (client) {
      try {
        const logoutTimeoutMs =
          Number(process.env.WHATSAPP_LOGOUT_TIMEOUT_MS) || 15000;
        await Promise.race([
          client.logout(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("WhatsApp logout timeout")),
              logoutTimeoutMs,
            ),
          ),
        ]);
        this.logger.log(
          `[SECURITY] Logged out WhatsApp session due to phone mismatch: sessionId=${params.sessionId}`,
        );
      } catch (error) {
        this.logger.warn(
          `[SECURITY] Failed to logout WhatsApp session on phone mismatch (will still destroy client): sessionId=${params.sessionId}, error=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Preserve FAILED status while tearing down client resources
    await this.sessionService.disconnectSession(params.sessionId, { preserveStatus: true });

    this.qrGateway.emitStatus(params.sessionId, {
      status: SessionStatus.FAILED,
      message,
    });
  }

  private isCallLogMessage(message: any): boolean {
    return message?.type === "call_log";
  }

  private maskPhoneDigits(value?: string | null): string {
    const digits = this.normalizePhoneDigits(value);
    if (!digits) return "";
    if (digits.length <= 4) return `****${digits}`;
    return `****${digits.slice(-4)}`;
  }
}