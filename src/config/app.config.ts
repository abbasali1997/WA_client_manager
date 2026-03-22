import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  baseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  port: parseInt(process.env.PORT || '3000', 10),
  internalApiKey: process.env.INTERNAL_API_KEY || '',
}));
