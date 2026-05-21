-- Add a denormalized photoCount column to Collection so list endpoints
-- can render stacked previews + count without loading every photo row.
-- Maintained at the service layer (createCollection / appendToCollection
-- increment, DELETE /api/photos/:id decrements).

ALTER TABLE "Collection" ADD COLUMN "photoCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows from the join table. Wrapped in a subquery
-- so the UPDATE works on SQLite (no UPDATE ... FROM in our version).
UPDATE "Collection"
SET "photoCount" = (
  SELECT COUNT(*)
  FROM "Photo"
  WHERE "Photo"."collectionId" = "Collection"."id"
);

-- Apply the tag-inheritance rule retroactively: for any collection
-- that currently has zero direct CollectionTag rows, promote the
-- union of its photos' tags up to the collection level. This keeps
-- timeline cards showing the same tags they did before this release
-- while letting the API treat "collection tags" as the canonical
-- source of truth for the new scoped Tags views.
INSERT INTO "CollectionTag" ("collectionId", "tagId")
SELECT DISTINCT p."collectionId", pt."tagId"
FROM "Photo" p
JOIN "PhotoTag" pt ON pt."photoId" = p."id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "CollectionTag" ct
  WHERE ct."collectionId" = p."collectionId"
);
