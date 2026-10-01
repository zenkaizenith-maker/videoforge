const { Client } = require('pg');

async function test() {
  const client = new Client({ 
    host: 'localhost', 
    port: 5432, 
    user: 'postgres', 
    password: 'postgres' 
  });
  
  try {
    await client.connect();
    const result = await client.query("SELECT datname FROM pg_database WHERE datistemplate = false AND datname LIKE '%supabase%'");
    console.log('Databases:', result.rows);
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await client.end();
  }
}

test();
