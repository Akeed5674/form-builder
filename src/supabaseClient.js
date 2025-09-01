import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://yjaditzjjzniwokavpte.supabase.co';    // Paste your Project URL here
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqYWRpdHpqanpuaXdva2F2cHRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NTE2NTUsImV4cCI6MjA3MjIyNzY1NX0.NfGuXEo_u1c3J56dZExXuYaKuNvfLjbnA70NRLBmH18'; // Paste your anon public key here

export const supabase = createClient(supabaseUrl, supabaseAnonKey);