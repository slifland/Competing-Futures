import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
const missingSupabaseVars = [
  !supabaseUrl ? 'VITE_SUPABASE_URL' : null,
  !supabaseKey ? 'VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY' : null,
].filter(Boolean);

export const supabaseConfigError = missingSupabaseVars.length
  ? `Missing Supabase environment variables: ${missingSupabaseVars.join(', ')}.`
  : '';

export const supabase = supabaseConfigError
  ? null
  : createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        flowType: 'pkce',
      },
    });
