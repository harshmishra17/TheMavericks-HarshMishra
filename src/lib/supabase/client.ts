'use client';
import { createBrowserClient } from '@supabase/ssr';
export const configured=Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
let client:ReturnType<typeof createBrowserClient>|undefined;
export function browserDB(){if(!configured)throw new Error('Connect Supabase using .env.local first.');return client??=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);}
