import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function main() {
  const email = 'testadmin' + Date.now() + '@example.com';
  const { data: user, error } = await supabase.auth.admin.createUser({
    email,
    password: 'password123',
    email_confirm: true,
    user_metadata: { full_name: 'Test Admin' }
  });
  if (error) throw error;
  
  await supabase.from('profiles').update({ role: 'admin' }).eq('id', user.user.id);
  console.log("Created admin:", email);
}

main().catch(console.error);
