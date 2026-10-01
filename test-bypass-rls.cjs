const { createServiceRoleClient } = require('C:\\Users\\devil\\OneDrive\\Documents\\FARM FOLDER\\videoforge\\src\\lib\\supabase\\server-service-role.ts');

// Actually, this is a TypeScript file, so let me just recreate the logic
const { createClient } = require('@supabase/supabase-js');

// Read the key from .env.local
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
  const { data, error } = await supabase.from('projects').select('id,title').limit(1);
  console.log('projects data:', JSON.stringify(data));
  console.log('projects error:', JSON.stringify(error));
}

test();
