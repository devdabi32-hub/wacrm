// assert-no-bom.mjs — fail loudly if any supabase/**/*.sql starts with a UTF-8 BOM.
//
// Root cause this guards: Windows PowerShell 5.1 Out-File / Set-Content -Encoding
// utf8 writes UTF-8 WITH a BOM. A leading BOM is invisible when a migration is
// pasted standalone (the SQL editor strips it), but once migrations are
// concatenated into supabase/install.sql the BOM lands mid-file where Postgres
// does NOT strip it — a syntax error on a client's first single-paste run.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const walk = (d) =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const offenders = walk('supabase')
  .filter((p) => p.endsWith('.sql'))
  .filter((p) => readFileSync(p).subarray(0, 3).equals(BOM));

if (offenders.length) {
  console.error('❌ UTF-8 BOM in SQL source (breaks concatenated install.sql):');
  offenders.forEach((p) => console.error('   - ' + p));
  console.error('Fix: re-save UTF-8 without BOM →  [System.IO.File]::WriteAllText($path,$text)');
  process.exit(1);
}
console.log('✅ No BOM in supabase/**/*.sql');
