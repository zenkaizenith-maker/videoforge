const https = require('https');

const options = {
  hostname: 'api.supabase.com',
  path: '/v1/profiles/me',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer sb_publishable_Ng0-3b6IiiYSpp8tCL_KLw_DDN29yVf'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => console.log('status:', res.statusCode, 'body:', data));
});

req.on('error', (e) => console.error('Error:', e.message));
req.end();
