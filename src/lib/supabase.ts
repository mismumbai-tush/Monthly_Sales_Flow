import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || (import.meta as any).env?.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!supabaseUrl && 
                                   supabaseUrl !== 'undefined' && 
                                   supabaseUrl !== '' &&
                                   !!supabaseAnonKey && 
                                   supabaseAnonKey !== 'undefined' &&
                                   supabaseAnonKey !== '';

console.group('Supabase Configuration Check');
console.log('URL Present:', !!supabaseUrl && supabaseUrl !== 'undefined');
console.log('Key Present:', !!supabaseAnonKey && supabaseAnonKey !== 'undefined');
console.log('Configured State:', isSupabaseConfigured);
if (!isSupabaseConfigured) {
  console.warn('Supabase is NOT configured. Ensure secrets are set in the platform settings.');
}
console.groupEnd();

let client: SupabaseClient | null = null;

const createSafeDummy = (prop: string | symbol) => {
  console.warn(`Accessing Supabase property '${String(prop)}' while client is uninitialized or config is invalid.`);
  
  if (prop === 'auth') {
    return {
      getSession: async () => {
        console.log('Dummy getSession called');
        return { data: { session: null }, error: null };
      },
      onAuthStateChange: (callback: any) => {
        console.log('Dummy onAuthStateChange registered');
        // Trigger a fake null session after a tiny delay to help app states advance
        setTimeout(() => callback('SIGNED_OUT', null), 10);
        return { data: { subscription: { unsubscribe: () => console.log('Dummy unsubscribe') } } };
      },
      onAuthStateChanged: (callback: any) => {
        console.log('Dummy onAuthStateChanged registered');
        setTimeout(() => callback('SIGNED_OUT', null), 10);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: new Error('Supabase not configured') }),
      signUp: async () => ({ data: { user: null, session: null }, error: new Error('Supabase not configured') }),
      signOut: async () => ({ error: null })
    };
  }
  
  if (prop === 'from') {
    return (table: string) => {
      console.log(`Dummy 'from' called for table: ${table}`);
      const chain = {
        select: () => chain,
        insert: () => chain,
        update: () => chain,
        delete: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        single: async () => ({ data: null, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
        then: (onfulfilled: any) => Promise.resolve({ data: [], error: null }).then(onfulfilled)
      };
      return chain;
    };
  }
  
  return undefined;
};

export const supabase = new Proxy({} as SupabaseClient, {
  get(target, prop, receiver) {
    if (!isSupabaseConfigured) {
      return createSafeDummy(prop);
    }
    
    if (!client) {
      try {
        console.log('Attempting to initialize Supabase client...');
        client = createClient(supabaseUrl!, supabaseAnonKey!, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false
          }
        });
        console.log('Supabase client initialized successfully.');
      } catch (e) {
        console.error('CRITICAL: Supabase createClient failed:', e);
        return createSafeDummy(prop);
      }
    }
    
    return Reflect.get(client, prop, receiver);
  }
});
