import { supabase } from './supabase'

export async function apiFetch(path, options = {}) {
  const { data: { session }, error } = supabase
    ? await supabase.auth.getSession()
    : { data: { session: null }, error: new Error('Supabase Auth is not configured.') }
  if (error) throw error

  const headers = new Headers(options.headers || {})
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`)

  return fetch(path, { ...options, headers })
}
