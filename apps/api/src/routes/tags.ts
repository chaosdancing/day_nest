import type { FastifyInstance } from 'fastify';

export async function registerTagRoutes(app: FastifyInstance) {
  app.get(
    '/api/tags',
    { onRequest: [app.requireUser] },
    async () => {
      const tags = await app.deps.prisma.tag.findMany({
        include: {
          _count: { select: { photos: true, collections: true } },
        },
      });
      return tags
        .map((t) => ({
          id: t.id,
          name: t.name,
          displayName: t.displayName,
          photoCount: t._count.photos,
          collectionCount: t._count.collections,
        }))
        .sort(
          (a, b) =>
            b.collectionCount + b.photoCount - (a.collectionCount + a.photoCount)
        );
    }
  );
}
