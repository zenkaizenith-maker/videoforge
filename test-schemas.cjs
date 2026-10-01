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
  // Try different schemas
  const schemas = ['public', 'auth', 'storage', 'graphql'];
  for (const schema of schemas) {
    try {
      const { data, error } = await supabase
        .schema(schema)
        .from('assets')
        .select('*')
        .limit(1);
      
      if (!error || error.code !== 'PGRST205') {
        console.log(`FOUND in ${schema}:`, JSON.stringify(data).substring(0, 200));
      } else {
        console.log(`NOT FOUND in ${schema}: ${error.message}`);
      }
    } catch (e) {
      console.log(`ERROR in ${schema}: ${e.message}`);
    }
  }
}

test().catch(e => console.error('Fatal:', e));
