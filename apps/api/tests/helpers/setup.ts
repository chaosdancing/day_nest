import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load .env.test at module load time (BEFORE any test file imports run, so
// PrismaClient initialisers and loadConfig() pick up the test database).
//
// IMPORTANT — `override: true`: Vitest auto-loads `.env` from the project
// root before our setup file runs, so DATABASE_URL is already set to the
// dev URL by the time we get here. Without override, the .env.test values
// silently lose, and every test run wipes the dev SQLite file. (We've been
// bitten by this — see the commit history.) Force overwrite so tests are
// fully isolated from the dev environment.
config({ path: resolve(process.cwd(), '.env.test'), override: true });
