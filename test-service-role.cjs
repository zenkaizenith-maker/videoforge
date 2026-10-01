const { createClient } = require('@supabase/supabase-js');

// Read the key from .env.local directly
const fs = require('fs');
const envContent = fs.readFileSync('C:\\Users\\devil\\OneDrive\\Documents\\FARM FOLDER\\videoforge\\.env.local', 'utf8');
const secretKeyLine = envContent.split('\n').find(l => l.startsWith('SUPABASE_SECRET_KEY='));
const secretKey = secretKeyLine ? secretKeyLine.split('=')[1] : null;

console.log('Key prefix:', secretKey ? secretKey.substring(0, 15) + '...' : 'NOT FOUND');

const supabase = createClient(
  'https://ejvoirqfkhrpwrlqsygm.supabase.co',
  secretKey
);

async function test() {
  // Try to read from auth.users - only service role can do this
  const { data, error } = await supabase.from('auth.users').select('id').limit(1);
  console.log('auth.users data:', JSON.stringify(data));
  console.log('auth.users error:', JSON.stringify(error));
}

test();
