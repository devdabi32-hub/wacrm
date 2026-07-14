// check-install-fresh.mjs — fail if supabase/install.sql is STALE.
//
// The landmine this guards: a new migration lands but nobody regenerated
// install.sql, so a client's fresh project gets a schema missing whatever the
// new migration added — silent, on day one. This rebuilds install.sql IN MEMORY
// from the current migrations and byte-compares it to the committed file.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { buildInstallSql } from './build-install.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'supabase', 'install.sql');

let committed;
try {
  committed = readFileSync(OUT);
} catch {
  console.error('❌ supabase/install.sql is missing. Run: npm run build:install-sql');
  process.exit(1);
}

const fresh = buildInstallSql();
if (!fresh.equals(committed)) {
  console.error('❌ install.sql is STALE. A migration changed but install.sql was not regenerated.');
  console.error(`   committed: ${committed.length} bytes   expected: ${fresh.length} bytes`);
  console.error('   Fix: npm run build:install-sql   (then commit supabase/install.sql)');
  process.exit(1);
}
console.log('✅ install.sql is up to date with supabase/migrations/');
