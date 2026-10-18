import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(resolve(process.cwd(), 'apps/api/package.json'));
const mongoose = require('mongoose');

const uri = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
  .split(/\r?\n/)
  .find((l) => l.startsWith('MONGODB_URI='))
  .slice('MONGODB_URI='.length)
  .replace('ssl=true', 'tls=true');

console.log('safe', uri.replace(/:[^:@/]+@/, ':***@'));

mongoose.connection.on('error', (e) => console.error('conn error', e.message));

try {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 30000,
    family: 4,
  });
  console.log('OK', mongoose.connection.name);
  await mongoose.disconnect();
  process.exit(0);
} catch (e) {
  console.error('FAIL message:', e.message);
  console.error('FAIL name:', e.name);
  console.error('FAIL code:', e.code);
  if (e.reason?.servers) {
    for (const [k, v] of e.reason.servers) {
      console.error('server', k, '→', v?.error?.message || v?.type);
    }
  }
  process.exit(1);
}
