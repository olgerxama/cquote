import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://ohhguhvapjjwcwtphctd.supabase.co';

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oaGd1aHZhcGpqd2N3dHBoY3RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4Njk4MjQsImV4cCI6MjA5MTQ0NTgyNH0.JMSWUyfBsd6IJM-GDicM-zKfZwemg3ogVwWjppUAi8Y';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
