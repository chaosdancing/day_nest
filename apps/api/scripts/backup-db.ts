import { PrismaClient } from '@prisma/client';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Snapshot the current SQLite database to `prisma/backups/dev-<ts>.db`.
 *
 * Uses SQLite's `VACUUM INTO`, which is an *online* backup: safe to run
 * even while the dev API server is writing to the database. The output
 * file is a self-contained copy you can restore by simply replacing
 * `prisma/dev.db` with it (stop the API first).
 *
 * Designed to be hooked into `pretest` / `predev` / manual runs. To avoid
 * spamming dozens of identical snapshots when tests are run in a tight
 * loop, the script skips silently if the most recent backup is younger
 * than BACKUP_MIN_INTERVAL_MS (default 1 hour). Pass `--force` or set
 * BACKUP_MIN_INTERVAL_MS=0 to force a snapshot.
 *
 * Env:
 *   BACKUP_DIR=prisma/backups    where to write
 *   BACKUP_KEEP=30               how many backups to retain
 *   BACKUP_MIN_INTERVAL_MS       skip if last backup is newer than this
 *                                (ms); default 3600000 (1 hour)
 */

const BACKUP_DIR = process.env.BACKUP_DIR ?? 'prisma/backups';
const BACKUP_KEEP = Number(process.env.BACKUP_KEEP ?? 30);
const BACKUP_MIN_INTERVAL_MS = Number(
  process.env.BACKUP_MIN_INTERVAL_MS ?? 60 * 60 * 1000
);
const FORCE = process.argv.includes('--force');

function ts(): string {
  // YYYYMMDD-HHMMSS, sortable alphanumerically.
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function listBackups(dir: string) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith('dev-') && f.endsWith('.db'))
    .map((f) => ({
      name: f,
      path: join(dir, f),
      mtime: statSync(join(dir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
}

function rotate(dir: string, keep: number) {
  const entries = listBackups(dir);
  for (const e of entries.slice(keep)) {
    unlinkSync(e.path);
    console.log(`[backup] rotated out ${e.name}`);
  }
}

async function main() {
  const dir = resolve(process.cwd(), BACKUP_DIR);
  mkdirSync(dir, { recursive: true });

  // Skip when invoked from a tight loop (pretest etc.) and we already
  // snapshotted recently. The `--force` flag and explicit
  // BACKUP_MIN_INTERVAL_MS=0 always override.
  if (!FORCE && BACKUP_MIN_INTERVAL_MS > 0) {
    const latest = listBackups(dir)[0];
    if (latest && Date.now() - latest.mtime < BACKUP_MIN_INTERVAL_MS) {
      const ageMin = Math.round((Date.now() - latest.mtime) / 60000);
      console.log(
        `[backup] last snapshot ${ageMin}m old (${latest.name}); skipping. Pass --force to override.`
      );
      return;
    }
  }

  const filename = `dev-${ts()}.db`;
  const dest = resolve(dir, filename);

  const prisma = new PrismaClient();
  try {
    // VACUUM INTO is the safe, online backup path. The destination must
    // not exist beforehand (SQLite refuses to overwrite).
    await prisma.$executeRawUnsafe(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  } finally {
    await prisma.$disconnect();
  }

  const sz = statSync(dest).size;
  console.log(`[backup] wrote ${dest} (${(sz / 1024).toFixed(1)} KB)`);

  rotate(dir, Math.max(1, BACKUP_KEEP));

  console.log(
    `[backup] to restore later, stop the API and run:\n  cp '${dest}' prisma/dev.db`
  );
}

void main();
