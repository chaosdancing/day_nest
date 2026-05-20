import type { Prisma, PrismaClient, Tag } from '@prisma/client';

type TagDb = PrismaClient | Prisma.TransactionClient;

export function normalizeTagName(input: string): string {
  return input.trim().toLocaleLowerCase();
}

export async function upsertTags(
  prisma: TagDb,
  creatorId: string,
  names: readonly string[]
): Promise<Tag[]> {
  const display = Array.from(
    new Set(names.map((n) => n.trim()).filter(Boolean))
  );
  if (display.length === 0) return [];
  const result: Tag[] = [];
  for (const d of display) {
    const normalized = normalizeTagName(d);
    const tag = await prisma.tag.upsert({
      where: { name: normalized },
      update: {},
      create: { name: normalized, displayName: d, createdById: creatorId },
    });
    result.push(tag);
  }
  return result;
}
