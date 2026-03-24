import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import configuration from '../config/configuration';
import { ScheduleModule } from '@nestjs/schedule';
import { Scheduler } from './scheduler/scheduler';
import { Entity, EntitySchema } from '@/schemas/entity.schema';
import { User, UserSchema } from '@/schemas/user.schema';
import {
  WhatsAppSession,
  WhatsAppSessionSchema,
} from '@/schemas/whatsapp-session.schema';
import { EntityType, EntityTypeSchema } from '@/schemas/entity-type.schema';
import { Message, MessageSchema } from '@/schemas/message.schema';
import { WhatsappService } from '@/services/whatsapp.service';
import { ClientService } from '@/services/client.service';
import { SessionService } from '@/services/session.service';
import { WhatsappScheduler } from '@/worker/scheduler/whatsapp/whatsapp.scheduler';
import { WhatsAppHealthService } from '@/services/whatsapp-health.service';
import { RemoteAuthService } from '@/services/remoteAuth.service';
import { EmailService } from '@/services/email.service';
import { EntitiesService } from '@/services/entities.service';
import { QrGateway } from '@/services/qr.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configuration,
      envFilePath: ['.env'],
    }),

    // Scheduling
    ScheduleModule.forRoot(),

    // Database
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        // useNewUrlParser and useUnifiedTopology are deprecated in the MongoDB driver 4.x
        // They have no effect and should be omitted to avoid deprecation warnings.
        return {
          uri: configService.get<string>('database.mongodbUri'),
        };
      },
      inject: [ConfigService],
    }),

    MongooseModule.forFeature([
      { name: Entity.name, schema: EntitySchema },
      { name: User.name, schema: UserSchema },
      { name: WhatsAppSession.name, schema: WhatsAppSessionSchema },
      { name: EntityType.name, schema: EntityTypeSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
  ],
  providers: [
    Scheduler,
    EmailService,
    WhatsappService,
    ClientService,
    SessionService,
    WhatsAppHealthService,
    WhatsappScheduler,
    RemoteAuthService,
    EntitiesService,
    QrGateway,
  ],
})
export class WorkerModule {}
