const dns = require('dns');
const net = require('net');

async function test() {
  const hostname = 'ejvoirqfkhrpwrlqsygm.supabase.co';
  
  try {
    const addresses = await dns.promises.lookup(hostname);
    console.log('Resolved:', addresses);
    
    // Try to connect to port 5432
    await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: hostname, port: 5432 });
      socket.setTimeout(5000);
      socket.on('connect', () => {
        console.log('Port 5432 is open');
        socket.end();
        resolve();
      });
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Timeout'));
      });
      socket.on('error', (e) => {
        reject(e);
      });
    });
  } catch (e) {
    console.log('Failed:', e.message);
  }
}

test();
