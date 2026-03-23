// src/modules/whatsapp/controllers/internal-whatsapp.controller.ts
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
  Headers,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsappService } from '@/services/whatsapp.service';
import { InitClientDto } from '../dtos/init-client.dto';

@Controller('clients')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly configService: ConfigService,
  ) {}

  @Post('init')
  @HttpCode(HttpStatus.ACCEPTED)
  initClient(
    @Body() dto: InitClientDto,
    @Headers('x-internal-api-key') apiKey?: string,
  ) {
    const expectedApiKey = this.configService.get<string>('app.internalApiKey');

    if (expectedApiKey && apiKey !== expectedApiKey) {
      throw new UnauthorizedException('Invalid internal API key');
    }

    this.logger.log(`Init request received for sessionId=${dto.sessionId}`);

    void this.whatsappService.initializeClient(dto.sessionId).catch((error) => {
      this.logger.error(error);
    });

    return {
      success: true,
      message: 'Client initialization started',
      sessionId: dto.sessionId,
    };
  }
}
