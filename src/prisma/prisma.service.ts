import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const url = process.env.DATABASE_URL || 'mysql://notesapp:notesapp@localhost:3306/notesapp';
    const parsed = new URL(url);

    const adapter = new PrismaMariaDb({
      host: parsed.hostname,
      port: Number(parsed.port) || 3306,
      user: parsed.username,
      password: parsed.password,
      database: parsed.pathname.replace('/', ''),
      connectionLimit: 10,
    });

    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
