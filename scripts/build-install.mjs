// build-install.mjs — regenerate supabase/install.sql from supabase/migrations/*.sql
//
// This is the SOURCE OF TRUTH for install.sql. Never hand-edit install.sql; run
// `npm run build:install-sql` after any migration change.
//
// Guarantees:
//   * migrations ordered NUMERICALLY by leading NNN (not alphabetically — so a
//     future 010 can never sort before 002 if zero-padding ever slips)
//   * the NNN sequence is contiguous 1..N (no missing migration, no duplicate)
//   * header block + `CREATE EXTENSION "uuid-ossp" WITH SCHEMA public;` prepended
//   * migrations concatenated VERBATIM, in order — no de-dup, no reordering. The
//     duplicate CREATE EXTENSION lines and repeated policy names across 001<->012
//     are INTENTIONAL LAYERING (012 swaps auth.uid() -> app_owner_id()).
//   * line endings normalized to LF. Windows core.autocrlf gives CRLF working
//     copies; without this the generator would emit CRLF while the committed
//     LF blob (git-normalized) says LF, and they would never match. Only the
//     EOL representation is normalized — no SQL content is altered.
//   * written UTF-8 WITHOUT BOM. Node's fs write of a Buffer emits exactly those
//     bytes — no BOM is ever prepended (confirmed: Node has no BOM behavior).
//   * the write path is Node ONLY. PowerShell is what created the BOM bug; it
//     must never touch this file.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const OUT = join(ROOT, 'supabase', 'install.sql');
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

// Header + explicit extension line. Normalized to LF so the generator's output
// is byte-stable even if this .mjs is ever checked out with CRLF line endings.
const HEADER = `-- ============================================================================
-- install.sql — FULL SCHEMA for ONE client's fresh Supabase project
-- ============================================================================
-- WaCRM / Replora — white-label WhatsApp CRM. This file provisions the entire
-- database schema (tables, indexes, RLS policies, functions, triggers, storage
-- bucket, realtime) for a single client on a brand-new, empty Supabase project.
--
-- It is migrations 001..014 concatenated IN EXACT ORDER, verbatim, plus this
-- header and the explicit uuid-ossp line below. Nothing was dropped, merged, or
-- de-duplicated. The duplicate CREATE EXTENSION lines and the repeated policy
-- names across 001..012 are INTENTIONAL LAYERING: migration 012 deliberately
-- recreates policies first defined in 001/006/009 to swap the RLS predicate
-- auth.uid() -> app_owner_id(). Do NOT "clean up" those duplicates.
--
-- HOW TO RUN
--   Paste this whole file into the Supabase SQL Editor and run it. It needs the
--   \`postgres\` role (which the SQL Editor uses): it creates a trigger on
--   auth.users and sets function owners (ALTER FUNCTION ... OWNER TO postgres).
--   The file is fully idempotent — running it twice will not error.
--
-- REQUIRES A REAL SUPABASE PROJECT (not vanilla Postgres)
--   It relies on Supabase-managed objects that do not exist on bare Postgres:
--     * the \`supabase_realtime\` publication
--     * the \`storage.buckets\` / \`storage.objects\` schema (avatars bucket)
--     * the \`anon\`, \`authenticated\`, and \`service_role\` roles
--
-- CLIENT ONBOARDING — ORDER OF OPERATIONS
--   1. Run THIS file (install.sql) first. No auth user is needed yet.
--   2. Supabase Dashboard -> Authentication -> Add User (create the client).
--      NOTE: set the new user's User Metadata to {"full_name": "<Client Name>"}
--      so the auto-created profiles row is not saved with an empty name.
--   3. Run seed_tour_travel.sql (with the CLIENT_USER_ID placeholder replaced
--      by the auth user id from step 2).
--
-- seed_tour_travel.sql is a SEPARATE file (data: custom fields, pipeline stages,
-- tags, destinations, workflows). It is intentionally NOT folded in here —
-- install.sql is SCHEMA ONLY.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

`.replace(/\r\n/g, '\n');

// Migrations sorted NUMERICALLY by leading NNN, with a contiguity assertion.
export function orderedMigrations() {
  const parsed = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .map((f) => ({ n: parseInt(f.match(/^(\d+)_/)[1], 10), f }))
    .sort((a, b) => a.n - b.n);

  if (parsed.length === 0) {
    throw new Error(`No migrations found in ${MIGRATIONS_DIR}`);
  }
  parsed.forEach((m, i) => {
    const expected = i + 1;
    if (m.n !== expected) {
      throw new Error(
        `Migration sequence broken: expected ${String(expected).padStart(3, '0')}_*, ` +
          `found ${m.f}. Migrations must be contiguous 001..N with no gaps or duplicates.`
      );
    }
  });
  return parsed.map((m) => m.f);
}

// Build install.sql as a Buffer — byte-exact, verbatim migration bytes.
export function buildInstallSql() {
  const parts = [Buffer.from(HEADER, 'utf8')];
  for (const f of orderedMigrations()) {
    const bytes = readFileSync(join(MIGRATIONS_DIR, f)); // raw bytes
    if (bytes.subarray(0, 3).equals(BOM)) {
      throw new Error(`Refusing to build: BOM in source migration ${f}. Run npm run check:bom.`);
    }
    // Normalize CRLF -> LF (see header note) so output is byte-stable and matches
    // the git-normalized LF blob regardless of the checkout's line endings.
    parts.push(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8'));
  }
  return Buffer.concat(parts);
}

// Run directly → write the file. Robust main-module check on Windows + POSIX.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = buildInstallSql();
  writeFileSync(OUT, out); // Buffer write: exact bytes, no BOM, no EOL rewrite
  console.log(`✅ Wrote supabase/install.sql (${out.length} bytes, ${orderedMigrations().length} migrations)`);
}
