import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase
    .from('store_memberships')
    .select('role, user_id, profiles(display_name, first_name, last_name)')
    .eq('status', 'active');
  console.log(JSON.stringify({ data, error }, null, 2));
}
run();
