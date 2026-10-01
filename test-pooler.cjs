const { Client } = require('pg');

async function test() {
  const hostnames = [
    'aws-0-us-west-1.pooler.supabase.com',
    'aws-0-us-east-1.pooler.supabase.com',
    'aws-0-eu-west-1.pooler.supabase.com'
  ];

  for (const hostname of hostnames) {
    const client = new Client({ 
      host: hostname, 
      port: 6543, 
      user: 'postgres', 
      password: 'sb_publishable_Ng0-3b6IiiYSpp8tCL_KLw_DDN29yVf',
      database: 'postgres',
      ssl: { rejectUnauthorized: false }
    });
    
    try {
      await client.connect();
      console.log('SUCCESS with', hostname);
      await client.end();
      return;
    } catch (e) {
      console.log('Failed with', hostname, ':', e.message);
    }
  }
}

test();
