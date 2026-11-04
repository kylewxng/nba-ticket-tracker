// Build-time settings. Vite replaces import.meta.env at build time; other
// bundlers (the single-file preview) leave it undefined, which means demo mode.
const env: Record<string, string | undefined> = (() => {
  try {
    return (import.meta as unknown as { env?: Record<string, string> }).env ?? {}
  } catch {
    return {}
  }
})()

export const SUPABASE_URL = env.VITE_SUPABASE_URL
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY
export const VAPID_PUBLIC_KEY = env.VITE_VAPID_PUBLIC_KEY

/** No Supabase keys: run on sample games and keep everything on this device. */
export const DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY

/** Hash URLs where the host can't serve every path (previews, file://). */
export const USE_HASH_ROUTER =
  typeof window !== 'undefined' &&
  !/^(tixcast\.app|www\.tixcast\.app|.+\.vercel\.app|localhost|127\.0\.0\.1)$/.test(window.location.hostname)
