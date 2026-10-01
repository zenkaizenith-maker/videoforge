const { Client } = require('pg');

const passwords = [
  'postgres', 'admin', 'password', '1234', 'root', 
  'devil', 'P@ssw0rd', '', 'postgres123', 'admin123',
  'password123', '123456', 'postgres1', 'admin1'
];

async function tryPasswords() {
  for (const pwd of passwords) {
    const client = new Client({ 
      host: 'localhost', 
      port: 5432, 
      user: 'postgres', 
      password: pwd 
    });
    
    try {
      await client.connect();
      console.log('SUCCESS! Password found:', pwd);
      await client.end();
      return;
    } catch (e) {
      // Ignore
    }
  }
  console.log('No password found');
}

tryPasswords();
