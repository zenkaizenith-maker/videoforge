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
  // Try common RPC functions that might allow SQL execution
  const functions = [
    'exec_sql',
    'run_sql',
    'sql',
    'query',
    'pg_query',
    'eval_sql'
  ];

  for (const fn of functions) {
    try {
      const { data, error } = await supabase.rpc(fn, { query: 'SELECT 1' });
      console.log(`Function ${fn}:`, JSON.stringify(data), JSON.stringify(error));
    } catch (e) {
      console.log(`Function ${fn}: ERROR - ${e.message}`);
    }
  }
}

test().catch(e => console.error('Fatal:', e));
