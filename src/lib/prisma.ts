/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { createMockPrisma } from './mockDb';

const USE_MOCK = process.env.USE_MOCK_DB === 'true';

let client: any;

if (USE_MOCK) {
  const g = globalThis as any;
  if (!g.__mockPrisma) g.__mockPrisma = createMockPrisma();
  client = g.__mockPrisma;
} else {
  const g = globalThis as any;
  if (!g.__prisma) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    g.__prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  }
  client = g.__prisma;
}

export const prisma = client;
export default prisma;
