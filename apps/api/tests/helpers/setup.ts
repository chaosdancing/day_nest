import { beforeAll } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';

beforeAll(() => {
  config({ path: resolve(process.cwd(), '.env.test') });
});
