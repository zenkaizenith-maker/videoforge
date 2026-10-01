const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ejvoirqfkhrpwrlqsygm.supabase.co',
  'sb_publishable_Ng0-3b6IiiYSpp8tCL_KLw_DDN29yVf'
);

async function test() {
  // Try to sign up a test user
  const { data, error } = await supabase.auth.signUp({
    email: 'test@example.com',
    password: 'testpass123'
  });
  console.log('Sign up data:', JSON.stringify(data));
  console.log('Sign up error:', JSON.stringify(error));

  if (data.session) {
    // Now try to query assets with the session
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('*')
      .limit(1);
    console.log('Assets data:', JSON.stringify(assets));
    console.log('Assets error:', JSON.stringify(assetsError));
  }
}

test().catch(e => console.error('Fatal:', e));
