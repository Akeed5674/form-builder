import { createClient } from '@supabase/supabase-js';

// Use env when present; fall back to your values
const SUPABASE_URL =
  import.meta?.env?.VITE_SUPABASE_URL || 'https://yjaditzjjzniwokavpte.supabase.co';

const SUPABASE_ANON_KEY =
  import.meta?.env?.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqYWRpdHpqanpuaXdva2F2cHRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NTE2NTUsImV4cCI6MjA3MjIyNzY1NX0.NfGuXEo_u1c3J56dZExXuYaKuNvfLjbnA70NRLBmH18';

// HMR-safe singleton
const sb =
  globalThis.__sb ??
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Turn this OFF to avoid multiple tabs on corp machines fighting over refresh
      multiTab: false,
      detectSessionInUrl: true,
      // give this app its own storage key so other projects/extensions can't collide
      storageKey: 'my-form-builder-auth',
    },
  });

if (!globalThis.__sb) globalThis.__sb = sb;

export const supabase = sb;
