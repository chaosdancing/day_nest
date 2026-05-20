import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { upsertTags, normalizeTagName } from '../src/services/tags.js';

describe('tag normalization', () => {
  it('normalizes case and whitespace', () => {
    expect(normalizeTagName('  Sakura  ')).toBe('sakura');
    expect(normalizeTagName('FUJI 山')).toBe('fuji 山');
  });
});

describe('upsertTags', () => {
  it('idempotently creates tags', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({
      data: { username: 'm', displayName: 'M', passwordHash: 'x' },
    });
    const a = await upsertTags(ctx.prisma, u.id, ['Sakura', '富士山']);
    const b = await upsertTags(ctx.prisma, u.id, ['sakura', '富士山']);
    expect(a.map((t) => t.id).sort()).toEqual(b.map((t) => t.id).sort());
    expect(await ctx.prisma.tag.count()).toBe(2);
    await ctx.cleanup();
  });

  it('ignores blank entries', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({
      data: { username: 'm', displayName: 'M', passwordHash: 'x' },
    });
    const tags = await upsertTags(ctx.prisma, u.id, ['  ', '', 'spring']);
    expect(tags).toHaveLength(1);
    expect(tags[0]!.name).toBe('spring');
    await ctx.cleanup();
  });
});
