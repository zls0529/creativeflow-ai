import { copyFileSync, existsSync, readFileSync, mkdirSync, closeSync, openSync } from 'node:fs';
import path from 'node:path';
if (!existsSync('.env')) copyFileSync('.env.example', '.env');
// Prisma's Windows schema engine can fail when the SQLite file does not yet exist.
const url = process.env.DATABASE_URL || readFileSync('.env', 'utf8').match(/^DATABASE_URL\s*=\s*["']?([^\r\n"']+)/m)?.[1];
if (url?.startsWith('file:') && !url.includes('?')) {
  const file = path.resolve('prisma', url.slice(5));
  mkdirSync(path.dirname(file), { recursive: true });
  if (!existsSync(file)) closeSync(openSync(file, 'wx'));
}
