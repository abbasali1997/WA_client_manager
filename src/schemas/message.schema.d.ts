import { Document, Types } from 'mongoose';
export type MessageDocument = Message & Document;
export declare enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  LOCATION = 'location',
  CONTACT = 'contact',
  STICKER = 'sticker',
  CALL = 'call',
}
export declare enum MessageStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
}
export declare enum MessageDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}
export declare class Message {
  _id: Types.ObjectId;
  whatsappMessageId: string;
  from: string;
  to: string;
  fromPhoneNumber: string;
  toPhoneNumber: string;
  fromName: string;
  toName: string;
  fromAvatarUrl: string;
  toAvatarUrl: string;
  type: MessageType;
  direction: MessageDirection;
  content: string;
  mediaUrl: string;
  thumbnailUrl: string;
  metadata: Record<string, any>;
  status: MessageStatus;
  sentAt: Date;
  deliveredAt: Date;
  readAt: Date;
  failedAt: Date;
  failureReason: string;
  conversationId: string;
  replyToMessageId: Types.ObjectId;
  replyToMessage?: {
    id: Types.ObjectId;
    content: string;
    type: MessageType;
    mediaUrl?: string;
    from: string;
    senderName: string;
  };
  campaignId: Types.ObjectId;
  templateName: string;
  entityId: Types.ObjectId;
  entityIdPath: Types.ObjectId[];
  tenantId: Types.ObjectId;
  isExternalNumber: boolean;
  whatsappUsername: string;
  whatsappGroupName: string;
  isGroupMessage: boolean;
  isStarred: boolean;
  isArchived: boolean;
  isActive: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}
export declare const MessageSchema: import('mongoose').Schema<
  Message,
  import('mongoose').Model<
    Message,
    any,
    any,
    any,
    Document<unknown, any, Message, any, {}> &
      Message &
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
  Message,
  Document<
    unknown,
    {},
    import('mongoose').FlatRecord<Message>,
    {},
    import('mongoose').ResolveSchemaOptions<
      import('mongoose').DefaultSchemaOptions
    >
  > &
    import('mongoose').FlatRecord<Message> &
    Required<{
      _id: Types.ObjectId;
    }> & {
      __v: number;
    }
>;
