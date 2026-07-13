import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  const { data: admin } = await supabase
    .from('profiles')
    .select('email, role')
    .eq('role', 'admin')
    .limit(1);
  console.log("Admin:", admin);
}

main().catch(console.error);
