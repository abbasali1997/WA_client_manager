import { Document, Types } from 'mongoose';
export type WhatsAppQR = {
  qrCode: string;
  expiresAt: Date;
  sessionId: string;
};
export type UserDocument = User &
  Document & {
    whatsappQR?: WhatsAppQR;
  };
export declare enum UserRole {
  SYSTEM_ADMIN = 'SystemAdmin',
  TENANT_ADMIN = 'TenantAdmin',
  USER = 'User',
}
export declare enum RegistrationStatus {
  PENDING = 'pending',
  INVITED = 'invited',
  REGISTERED = 'registered',
  CANCELLED = 'cancelled',
}
export declare enum WhatsAppConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  FAILED = 'failed',
}
export declare class UserPreferences {
  language: string;
  timezone: string;
  emailNotifications: boolean;
  whatsappNotifications: boolean;
}
export declare class QRInvitationHistory {
  qrCodeId: string;
  sentAt: Date;
  attemptCount: number;
  scannedAt: Date;
  expiredAt: Date;
  isExpired: boolean;
}
export declare class User {
  _id: Types.ObjectId;
  phoneNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  registrationStatus: RegistrationStatus;
  role: UserRole;
  entity: Record<string, unknown>;
  entityId: Types.ObjectId;
  entityPath: string;
  entityIdPath: Types.ObjectId[];
  tenantId: Types.ObjectId;
  companyId: Types.ObjectId;
  whatsappConnectionStatus: WhatsAppConnectionStatus;
  whatsappConnectedAt: Date;
  qrInvitationHistory: QRInvitationHistory[];
  preferences: UserPreferences;
  avatar: string;
  initials: string;
  isOnline: boolean;
  lastSeenAt: Date;
  isActive: boolean;
  createdBy?: string;
  updatedBy?: string;
  deletedBy?: string;
  deletedAt?: Date;
  anonymizedAt?: Date;
  pseudonym?: string;
  resetPasswordToken: string;
  resetPasswordExpires: Date;
  emailVerificationToken: string;
  emailVerificationExpires: Date;
  emailVerified: boolean;
  pendingEmail: string;
  mustChangePassword: boolean;
  passwordChangedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
export declare const UserSchema: import('mongoose').Schema<
  User,
  import('mongoose').Model<
    User,
    any,
    any,
    any,
    Document<unknown, any, User, any, {}> &
      User &
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
  User,
  Document<
    unknown,
    {},
    import('mongoose').FlatRecord<User>,
    {},
    import('mongoose').ResolveSchemaOptions<
      import('mongoose').DefaultSchemaOptions
    >
  > &
    import('mongoose').FlatRecord<User> &
    Required<{
      _id: Types.ObjectId;
    }> & {
      __v: number;
    }
>;
