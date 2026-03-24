import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import IORedis, { RedisOptions } from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class Scheduler implements OnModuleDestroy {
  private readonly logger = new Logger(Scheduler.name);
  private connection: IORedis;
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();

  constructor(private readonly configService: ConfigService) {
    this.connection = new IORedis(this.buildRedisOptions());

    this.connection.on('connect', () => {
      this.logger.log(`REDIS connected`);
    });

    this.connection.on('ready', () => {
      this.logger.log(`REDIS ready`);
    });

    this.connection.on('reconnecting', (delay: number) => {
      this.logger.warn(`REDIS reconnecting in ${delay}ms`);
    });

    this.connection.on('close', () => {
      this.logger.warn(`REDIS connection closed`);
    });

    this.connection.on('end', () => {
      this.logger.error(`REDIS connection ended`);
    });

    this.connection.on('error', (error: Error) => {
      this.logger.error(`REDIS error: ${error.message}`, error.stack);
    });
  }

  /**
   * Parses REDIS_CONNECTION_STRING which may be either:
   *   - Standard URL:  redis://:password@host:port  or  rediss://...
   *   - Azure format:  host:6380,password=...,ssl=True,abortConnect=False
   */
  private buildRedisOptions(): RedisOptions {
    const redisCS =
      this.configService.get<string>(
        'app.redisConnectionString',
        process.env.REDIS_CONNECTION_STRING || 'redis://localhost:6379',
      ) || 'redis://localhost:6379';

    const cs = redisCS.trim();

    const baseOptions: RedisOptions = {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,

      // reconnect immediately, then back off slightly
      retryStrategy: (times: number) => {
        if (times <= 1) {
          return 0;
        }
        return Math.min(times * 200, 2000);
      },

      // reconnect on common connection errors
      reconnectOnError: () => true,
    };

    if (cs.startsWith('redis://') || cs.startsWith('rediss://')) {
      const url = new URL(cs);

      return {
        ...baseOptions,
        host: url.hostname,
        port: Number(url.port) || 6379,
        password: url.password || undefined,
        tls: cs.startsWith('rediss://') ? {} : undefined,
      };
    }

    const segments = cs.split(',');
    const [host, rawPort] = (segments[0] || 'localhost:6379').split(':');
    const port = Number(rawPort) || 6379;
    const passwordSeg = segments.find((s) =>
      s.trim().startsWith('password='),
    );
    const password = passwordSeg
      ? passwordSeg.trim().slice('password='.length)
      : undefined;
    const useTls = segments.some((s) => /ssl\s*=\s*true/i.test(s));

    return {
      ...baseOptions,
      host,
      port,
      password,
      tls: useTls ? {} : undefined,
    };
  }

  /**
   * Registers a new job queue and worker
   */
  registerWorker<T>(queueName: string, processFn: (data: T) => Promise<void>) {
    if (this.queues.has(queueName)) {
      return;
    }

    const queue = new Queue(queueName, {
      connection: this.connection as any,
    });

    const worker = new Worker(
      queueName,
      async (job: Job) => {
        await processFn(job.data);
      },
      {
        connection: this.connection as any,
      },
    );

    worker.on('completed', (job) => {
      this.logger.log(`Job ${job.name} completed`);
    });

    worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.name} failed:`, err);
    });

    this.queues.set(queueName, queue);
    this.workers.set(queueName, worker);
  }

  destroyWorker(): void {
    const keys = this.queues.keys();
    for (const key of keys) {
      if (this.queues.has(key)) {
        this.queues.delete(key);
      }
    }
  }

  /**
   * Adds job to queue
   */
  async addJob<T>(queueName: string, data: T) {
    const queue = this.queues.get(queueName);

    if (!queue) {
      throw new Error(`Queue ${queueName} is not registered`);
    }

    await queue.add(queueName, data);
  }

  /**
   * Register CRON job
   */
  async registerCronJob<T>(
    queueName: string,
    jobName: string,
    cronExpression: string,
    data: T,
  ) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not registered`);

    await queue.add(jobName, data, {
      repeat: {
        pattern: cronExpression,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  async onModuleDestroy() {
    for (const worker of this.workers.values()) {
      await worker.close();
    }

    for (const queue of this.queues.values()) {
      await queue.close();
    }

    await this.connection.quit();
  }
}
