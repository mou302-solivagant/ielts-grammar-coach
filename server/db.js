import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    '警告：SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 未設定，資料庫相關功能會失敗。請檢查 server/.env'
  );
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

export default supabase;
