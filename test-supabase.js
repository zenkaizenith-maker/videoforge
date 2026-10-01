const fs = require('fs');
const path = require('path');
const envFile = path.resolve('.env.local');
const envBuffer = fs.readFileSync(envFile);
const envLines = envBuffer.toString().split('\n');
for (const line of envLines) {
  const [key, value] = line.split('=');
  if (key && value) {
    process.env[key.trim()] = value.trim();
  }
}
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
supabase.from('assets').select('*').eq('project_id', 'b1805071-797a-4aa7-9bc4-199b0785440a').limit(1).then((result) => {
  if (result.error) console.error('Error:', result.error);
  else console.log('Success:', result.data);
});
