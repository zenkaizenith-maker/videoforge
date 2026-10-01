const dns = require('dns');

const hostnames = [
  'db.ejvoirqfkhrpwrlqsygm.supabase.co',
  'aws-0-us-west-1.pooler.supabase.com',
  'aws-0-us-east-1.pooler.supabase.com',
  'aws-0-eu-west-1.pooler.supabase.com',
  'aws-0-ap-southeast-1.pooler.supabase.com'
];

async function testHostnames() {
  for (const hostname of hostnames) {
    try {
      await new Promise((resolve, reject) => {
        dns.lookup(hostname, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      console.log('Resolved:', hostname);
    } catch (e) {
      console.log('Failed:', hostname, '-', e.message);
    }
  }
}

testHostnames();
