const { createServiceRoleClient } = require('./src/lib/supabase/server-service-role.ts');

// Actually we can't require TS directly. Let me use the same logic.
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

async function inspectSchema() {
  // Query columns
  const { data: columns, error: colsError } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type, is_nullable, column_default')
    .eq('table_schema', 'public')
    .eq('table_name', 'assets')
    .order('ordinal_position');

  console.log('Columns error:', JSON.stringify(colsError));
  console.log('Columns:', JSON.stringify(columns, null, 2));

  // Query constraints
  const { data: constraints, error: constError } = await supabase
    .from('information_schema.table_constraints')
    .select('constraint_name, constraint_type')
    .eq('table_schema', 'public')
    .eq('table_name', 'assets');

  console.log('Constraints error:', JSON.stringify(constError));
  console.log('Constraints:', JSON.stringify(constraints, null, 2));

  // Query key column usage
  const { data: keyCols, error: keyError } = await supabase
    .from('information_schema.key_column_usage')
    .select('constraint_name, column_name')
    .eq('table_schema', 'public')
    .eq('table_name', 'assets');

  console.log('Key cols error:', JSON.stringify(keyError));
  console.log('Key cols:', JSON.stringify(keyCols, null, 2));

  // Query indexes
  const { data: indexes, error: idxError } = await supabase
    .from('pg_indexes')
    .select('indexname, indexdef')
    .eq('schemaname', 'public')
    .eq('tablename', 'assets');

  console.log('Indexes error:', JSON.stringify(idxError));
  console.log('Indexes:', JSON.stringify(indexes, null, 2));
}

inspectSchema().catch(e => console.error('Fatal:', e));
