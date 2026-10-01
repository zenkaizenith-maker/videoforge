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
supabase.from('information_schema.tables').select('table_name').eq('table_schema', 'public').eq('table_name', 'assets').then((result) => {
  if (result.error) console.error('Error:', result.error);
  else console.log('Tables found:', result.data.length > 0 ? result.data : 'None');
});
