async function test() {
  const response = await fetch('https://api.supabase.com/v1/projects/ejvoirqfkhrpwrlqsygm/database/conn-string', {
    headers: {
      'Authorization': 'Bearer sb_publishable_Ng0-3b6IiiYSpp8tCL_KLw_DDN29yVf',
      'apikey': 'sb_publishable_Ng0-3b6IiiYSpp8tCL_KLw_DDN29yVf'
    }
  });
  const text = await response.text();
  console.log('status:', response.status);
  console.log('body:', text);
}

test();
