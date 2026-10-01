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
  // Try various queries to infer schema
  const queries = [
    { name: 'select *', query: supabase.from('assets').select('*').limit(1) },
    { name: 'select id', query: supabase.from('assets').select('id').limit(1) },
    { name: 'select id, assigned_scene_id', query: supabase.from('assets').select('id,assigned_scene_id').limit(1) },
    { name: 'count', query: supabase.from('assets').select('*', { count: 'exact', head: true }) },
  ];

  for (const q of queries) {
    try {
      const { data, error, count } = await q.query;
      console.log(`${q.name}:`, JSON.stringify({ data: data?.slice(0, 1), error, count }).substring(0, 200));
    } catch (e) {
      console.log(`${q.name}: ERROR - ${e.message}`);
    }
  }
}

test().catch(e => console.error('Fatal:', e));
