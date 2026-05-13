import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || supabaseUrl === 'undefined' || !supabaseAnonKey || supabaseAnonKey === 'undefined') {
    console.error("SUPABASE ERROR: Credenciais não encontradas no ambiente.");
    console.log("Variáveis esperadas: VITE_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL");
}

export const supabase = createClient(
  supabaseUrl && supabaseUrl !== 'undefined' ? supabaseUrl : 'https://placeholder.supabase.co',
  supabaseAnonKey && supabaseAnonKey !== 'undefined' ? supabaseAnonKey : 'placeholder'
);
