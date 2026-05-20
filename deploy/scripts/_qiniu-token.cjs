#!/usr/bin/env node
// Tiny helper: generate a Qiniu upload token for a single key.
// Usage: node _qiniu-token.cjs <accessKey> <secretKey> <bucket> <key>
const crypto = require('node:crypto');

const [, , ak, sk, bucket, key] = process.argv;
if (!ak || !sk || !bucket || !key) {
  console.error('usage: _qiniu-token.cjs <ak> <sk> <bucket> <key>');
  process.exit(1);
}

const policy = {
  scope: `${bucket}:${key}`,
  deadline: Math.floor(Date.now() / 1000) + 60 * 30,
  returnBody: JSON.stringify({ key: '$(key)', hash: '$(etag)', size: '$(fsize)' }),
};
const encodedPolicy = Buffer.from(JSON.stringify(policy))
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');
const sign = crypto
  .createHmac('sha1', sk)
  .update(encodedPolicy)
  .digest('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');
const token = `${ak}:${sign}:${encodedPolicy}`;

process.stdout.write(JSON.stringify({ token, key }));
