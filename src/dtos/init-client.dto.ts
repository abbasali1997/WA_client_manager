// src/modules/whatsapp/dto/init-client.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class InitClientDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;
}