import { Document, Types } from 'mongoose';
export type WhatsAppSessionDocument = WhatsAppSession & Document;
export declare enum SessionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  QR_REQUIRED = 'qr_required',
  AUTHENTICATED = 'authenticated',
  READY = 'ready',
  FAILED = 'failed',
}
export declare class WhatsAppSession {
  _id: Types.ObjectId;
  sessionId: string;
  authClientId?: string;
  userId: Types.ObjectId;
  entityId: Types.ObjectId;
  entityIdPath: Types.ObjectId[];
  tenantId: Types.ObjectId;
  phoneNumber: string;
  whatsappName: string;
  whatsappId: string;
  status: SessionStatus;
  qrCode: string;
  qrCodeUrl: string;
  qrCodeGeneratedAt: Date;
  qrCodeExpiresAt: Date;
  connectedAt: Date;
  disconnectedAt: Date;
  lastActivityAt: Date;
  connectionOwner?: string;
  connectionOwnerExpiresAt?: Date;
  connectionOwnerHeartbeatAt?: Date;
  reconnectAttempts: number;
  sessionData: string;
  messagesSent: number;
  messagesReceived: number;
  messagesDelivered: number;
  messagesFailed: number;
  settings: Record<string, any>;
  isActive: boolean;
  autoReconnect: boolean;
  lastError: string;
  lastErrorAt: Date;
  lastHealthStatus?: string;
  lastHealthCheckAt?: Date;
  nextHealthCheckAt?: Date;
  consecutiveHealthFailures?: number;
  lastHealthError?: string;
  lastHealthAlertAt?: Date;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
  failureReason: string;
}
export declare const WhatsAppSessionSchema: import('mongoose').Schema<
  WhatsAppSession,
  import('mongoose').Model<
    WhatsAppSession,
    any,
    any,
    any,
    Document<unknown, any, WhatsAppSession, any, {}> &
      WhatsAppSession &
      Required<{
        _id: Types.ObjectId;
      }> & {
        __v: number;
      },
    any
  >,
  {},
  {},
  {},
  {},
  import('mongoose').DefaultSchemaOptions,
  WhatsAppSession,
  Document<
    unknown,
    {},
    import('mongoose').FlatRecord<WhatsAppSession>,
    {},
    import('mongoose').ResolveSchemaOptions<
      import('mongoose').DefaultSchemaOptions
    >
  > &
    import('mongoose').FlatRecord<WhatsAppSession> &
    Required<{
      _id: Types.ObjectId;
    }> & {
      __v: number;
    }
>;
