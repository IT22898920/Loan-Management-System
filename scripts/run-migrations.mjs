import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));

// Session mode pooler (port 5432) uses plain 'postgres' username
const client = new Client({
  host: 'aws-0-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'Dinuka@2002!',
  ssl: { rejectUnauthorized: false },
});

async function run() {
  console.log('Connecting to Supabase PostgreSQL...');
  await client.connect();
  console.log('Connected!');

  const migrations = [
    join(__dirname, '../supabase/migrations/001_schema.sql'),
    join(__dirname, '../supabase/migrations/002_rls_policies.sql'),
  ];

  for (const file of migrations) {
    const name = file.split('/').pop() || file.split('\\').pop();
    console.log(`\nRunning migration: ${name}`);
    const sql = readFileSync(file, 'utf8');
    try {
      await client.query(sql);
      console.log(`✓ ${name} completed`);
    } catch (err) {
      console.error(`✗ ${name} failed:`, err.message);
    }
  }

  await client.end();
  console.log('\nMigrations finished!');
}

run().catch(console.error);
