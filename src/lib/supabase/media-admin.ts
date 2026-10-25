import 'server-only';
import { createClient } from '@supabase/supabase-js';
// Restricted to finalizing media that the route has downloaded with the user's RLS client.
export function mediaVerifier(){if(!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Media verification is not configured. Add the server-only key locally; text requests still work.');return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});}
