// Apply migrations to Supabase via Management API.
// Reads each .sql file, POSTs to /v1/projects/<ref>/database/query.
//
// Usage (PowerShell):
//   $env:SUPABASE_PAT = "sbp_..."
//   $env:SUPABASE_PROJECT_REF = "uuzrslowxcubzkrxxnag"
//   node scripts/apply-migrations.mjs

import fs from 'node:fs';
import path from 'node:path';

const PAT = process.env.SUPABASE_PAT;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;

if (!PAT) {
  console.error('Missing SUPABASE_PAT environment variable.');
  console.error('Create a Personal Access Token at https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}
if (!PROJECT_REF) {
  console.error('Missing SUPABASE_PROJECT_REF environment variable.');
  process.exit(1);
}

const API = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

const FILES = [
  '021_payment_attempts.sql',
  '022_audit_log.sql',
];

async function runSql(query, label) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`✗ ${label} FAILED (HTTP ${res.status}):`);
    console.error(text.slice(0, 500));
    return false;
  }
  console.log(`✓ ${label} applied (${text.slice(0, 80).replace(/\n/g, ' ')}…)`);
  return true;
}

const dir = path.resolve('supabase/migrations');
let okCount = 0;
let failCount = 0;

for (const file of FILES) {
  const full = path.join(dir, file);
  const sql = fs.readFileSync(full, 'utf8');
  const ok = await runSql(sql, file);
  if (ok) okCount++;
  else { failCount++; break; }
}

console.log(`\n=== Summary ===\nApplied: ${okCount}/${FILES.length}\nFailed:  ${failCount}`);
process.exit(failCount === 0 ? 0 : 1);
