import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || (import.meta as any).env?.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

console.log('Supabase Environment Check:', { 
  urlType: typeof supabaseUrl,
  keyType: typeof supabaseAnonKey,
  hasUrl: !!supabaseUrl && supabaseUrl !== 'undefined', 
  hasKey: !!supabaseAnonKey && supabaseAnonKey !== 'undefined'
});

// Create a dummy client or a proxy to prevent immediate crash
let client: SupabaseClient | null = null;

export const supabase = new Proxy({} as SupabaseClient, {
  get(target, prop, receiver) {
    const isValid = supabaseUrl && supabaseUrl !== 'undefined' && supabaseAnonKey && supabaseAnonKey !== 'undefined';
    
    if (!isValid) {
      console.warn(`Supabase property '${String(prop)}' accessed but config is invalid.`);
      return undefined;
    }
    
    if (!client) {
      try {
        client = createClient(supabaseUrl!, supabaseAnonKey!);
        console.log('Supabase client initialized successfully.');
      } catch (e) {
        console.error('Failed to initialize Supabase client:', e);
        return undefined;
      }
    }
    
    return Reflect.get(client, prop, receiver);
  }
});
