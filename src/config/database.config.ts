// src/config/database.config.ts
import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
  mongodbUri: string;
  cosmosDbName: string;
  maxPoolSize: number;
  minPoolSize: number;
}

export default registerAs(
  'database',
  (): DatabaseConfig => ({
    mongodbUri:
      process.env.MONGODB_URI || 'mongodb://localhost:27017/unicx-integration',

    cosmosDbName: process.env.COSMOS_DB_NAME || 'unicx-integration',

    maxPoolSize: Number(process.env.DATABASE_MAX_POOL_SIZE || 50),

    minPoolSize: Number(process.env.DATABASE_MIN_POOL_SIZE || 10),
  }),
);
