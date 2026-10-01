const { createClient } = require('C:\\Users\\devil\\OneDrive\\Documents\\FARM FOLDER\\videoforge\\node_modules\\@supabase\\supabase-js');

const supabase = createClient(
  'https://ejvoirqfkhrpwrlqsygm.supabase.co',
  'sb_publishable_Ng0-3b6IiiYSpp8tCL_KLw_DDN29yVf'
);

async function test() {
  const { data, error } = await supabase.rpc('exec_sql', { query: 'SELECT 1' });
  console.log('data:', JSON.stringify(data));
  console.log('error:', JSON.stringify(error));
}

test();
