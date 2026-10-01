const { Client } = require('pg');

async function test() {
  // Try connecting to Supabase pooler with service role key as password
  const client = new Client({ 
    host: 'db.ejvoirqfkhrpwrlqsygm.supabase.co', 
    port: 6543, 
    user: 'postgres', 
    password: 'sb_publishable_Ng0-3b6IiiYSpp8tCL_KLw_DDN29yVf',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('Connected!');
    await client.end();
  } catch (e) {
    console.error('Error:', e.message);
  }
}

test();
