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

const full = env.MONGODB_URI;
const userPassHost = full.match(/^mongodb:\/\/([^@]+)@([^/?,]+)/);
if (!userPassHost) {
  console.error('cannot parse uri');
  process.exit(1);
}
const uri = `mongodb://${userPassHost[1]}@${userPassHost[2]}/DBEZALLOW?tls=true&authSource=admin&directConnection=true`;
console.log('direct probe', uri.replace(/:[^:@/]+@/, ':***@'));

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log('OK', mongoose.connection.name);
  await mongoose.disconnect();
  process.exit(0);
} catch (e) {
  console.error('FAIL', e.message);
  process.exit(1);
}
