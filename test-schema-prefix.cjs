const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('C:\\Users\\devil\\OneDrive\\Documents\\FARM FOLDER\\videoforge\\.env.local', 'utf8');
const secretKeyLine = envContent.split('\n').find(l => l.startsWith('SUPABASE_SECRET_KEY='));
const secretKey = secretKeyLine ? secretKeyLine.split('=')[1] : null;

const supabase = createClient(
  'https://ejvoirqfkhrpwrlqsygm.supabase.co',
  secretKey,
  { auth: { persistSession: false } }
);

async function test() {
  // Try with explicit schema in the table name
  const tableNames = [
    'public.assets',
    'auth.assets',
    'storage.assets'
  ];

  for (const table of tableNames) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      console.log(`Table ${table}:`, JSON.stringify({ data: data?.slice(0, 1), error }).substring(0, 200));
    } catch (e) {
      console.log(`Table ${table}: ERROR - ${e.message}`);
    }
  }
}

test().catch(e => console.error('Fatal:', e));
