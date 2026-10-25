import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export async function serverDB(){const jar=await cookies();if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)throw new Error('Supabase has not been configured');return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>jar.getAll(),setAll:values=>values.forEach(({name,value,options})=>jar.set(name,value,options))}});}
