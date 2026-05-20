import { PrismaClient } from '@prisma/client';

let _prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient({
      log: ['warn', 'error'],
    });
  }
  return _prisma;
}

export async function disconnectPrisma() {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}
