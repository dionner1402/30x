import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(resolve(process.cwd(), 'apps/api/package.json'));
const mongoose = require('mongoose');

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const uri = env.MONGODB_URI?.replace('ssl=true', 'tls=true');
const proxyHost = env.MONGODB_PROXY_HOST;
const proxyPort = env.MONGODB_PROXY_PORT ? Number(env.MONGODB_PROXY_PORT) : undefined;

if (!uri) {
  console.error('FAIL missing MONGODB_URI');
  process.exit(1);
}

const opts = { serverSelectionTimeoutMS: 30000 };
if (proxyHost && proxyPort) {
  opts.proxyHost = proxyHost;
  opts.proxyPort = proxyPort;
  console.log(`Using SOCKS proxy ${proxyHost}:${proxyPort}`);
}

console.log('Connecting', uri.replace(/:[^:@/]+@/, ':***@'));

try {
  await mongoose.connect(uri, opts);
  console.log('OK db=' + mongoose.connection.name);
  await mongoose.disconnect();
  process.exit(0);
} catch (e) {
  console.error('FAIL', e.message);
  if (e.reason?.servers) {
    for (const [k, v] of e.reason.servers) {
      console.error('server', k, '→', v?.error?.message || v?.type);
    }
  }
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
}
