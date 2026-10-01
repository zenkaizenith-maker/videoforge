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
  // Test 1: select all columns
  console.log('Test 1: select *');
  const { data: allData, error: allError } = await supabase
    .from('assets')
    .select('*')
    .limit(1);
  console.log('data:', JSON.stringify(allData));
  console.log('error:', JSON.stringify(allError));

  // Test 2: select specific columns
  console.log('\nTest 2: select specific columns');
  const { data: specificData, error: specificError } = await supabase
    .from('assets')
    .select('id,project_id,original_filename,storage_path,mime_type,file_size,media_type,width,height,duration_seconds,assigned_scene_id,created_at,updated_at')
    .limit(1);
  console.log('data:', JSON.stringify(specificData));
  console.log('error:', JSON.stringify(specificError));

  // Test 3: check if table is empty
  console.log('\nTest 3: count');
  const { count, error: countError } = await supabase
    .from('assets')
    .select('*', { count: 'exact', head: true });
  console.log('count:', count);
  console.log('error:', JSON.stringify(countError));
}

test().catch(e => console.error('Fatal:', e));
