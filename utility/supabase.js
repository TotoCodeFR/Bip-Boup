import { createClient } from '@supabase/supabase-js';

let supabase = null;

export function getSupabaseClient() {
    if (!supabase) {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Supabase URL and Key must be set in environment variables');
        }
        
        supabase = createClient(supabaseUrl, supabaseKey, {
            // optional config:
            auth: {
                persistSession: false,  // depends on your needs
            },
            // You can add other options here if needed
        });
    }
    return supabase;
}
