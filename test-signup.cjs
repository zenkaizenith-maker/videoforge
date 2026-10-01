const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ejvoirqfkhrpwrlqsygm.supabase.co',
  'sb_publishable_Ng0-3b6IiiYSpp8tCL_KLw_DDN29yVf'
);

async function test() {
  // Try signup with auto-confirm
  const { data, error } = await supabase.auth.signUp({
    email: 'test2@example.com',
    password: 'testpass123',
    options: {
      emailRedirectTo: 'http://localhost:3000/auth/callback'
    }
  });
  
  console.log('Signup data:', JSON.stringify(data));
  console.log('Signup error:', JSON.stringify(error));
  
  if (data.user && !data.session) {
    console.log('User created but email confirmation required');
  } else if (data.session) {
    console.log('User created and logged in automatically');
  }
}

test().catch(e => console.error('Fatal:', e));
