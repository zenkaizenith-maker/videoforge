const { Client } = require('pg');

async function test() {
  const hostname = 'aws-0-us-west-1.pooler.supabase.com';
  
  const configs = [
    { options: '-c search_path=public' },
    { options: 'project=ejvoirqfkhrpwrlqsygm' },
    { options: 'external_id=ejvoirqfkhrpwrlqsygm' },
    { application_name: 'ejvoirqfkhrpwrlqsygm' }
  ];

  for (const config of configs) {
    const client = new Client({ 
      host: hostname, 
      port: 6543, 
      user: 'postgres', 
      password: 'sb_publishable_Ng0-3b6IiiYSpp8tCL_KLw_DDN29yVf',
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      ...config
    });
    
    try {
      await client.connect();
      console.log('SUCCESS with config:', JSON.stringify(config));
      await client.end();
      return;
    } catch (e) {
      console.log('Failed with config', JSON.stringify(config), ':', e.message);
    }
  }
}

test();
