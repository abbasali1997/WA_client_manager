import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration from './config/configuration';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsappService } from './services/whatsapp.service';
import { ClientService } from './services/client.service';
import { EntitiesService } from './services/entities.service';
import { QrGateway } from './services/qr.service';
import { RemoteAuthService } from './services/remoteAuth.service';
import { SessionService } from './services/session.service';
import { Entity, EntitySchema } from './schemas/entity.schema';
import { User, UserSchema } from './schemas/user.schema';
import { WhatsAppSession, WhatsAppSessionSchema } from './schemas/whatsapp-session.schema';
import { EntityType, EntityTypeSchema } from './schemas/entity-type.schema';
import { WhatsappController } from './controllers/whatsapp.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configuration,
      envFilePath: ['.env'],
    }),

    // Database
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        // useNewUrlParser and useUnifiedTopology are deprecated in the MongoDB driver 4.x
        // They have no effect and should be omitted to avoid deprecation warnings.
        return {
          uri: configService.get<string>("database.mongodbUri"),
        };
      },
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: Entity.name, schema: EntitySchema },
      { name: User.name, schema: UserSchema },
      { name: WhatsAppSession.name, schema: WhatsAppSessionSchema },
      { name: EntityType.name, schema: EntityTypeSchema },
    ]),
  ],
  providers: [WhatsappService, ClientService, EntitiesService, QrGateway, RemoteAuthService, SessionService],
  controllers: [WhatsappController]
})
export class AppModule {}