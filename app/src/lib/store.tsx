import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { DEMO } from './config'
import { demoGames } from './demo'
import { load, save } from './storage'
import { supabase } from './supabase'
import type { Alert, AlertDraft, AlertEvent, Game, Profile } from './types'

const DEFAULT_PROFILE: Profile = {
  display_name: null,
  teams: ['LAL', 'LAC'],
  ticket_count: 2,
  max_price: null,
  notify_push: true,
  notify_email: true,
  weekly_digest: true,
  founding_member: false,
}

/** Something the person tried to do before signing in; replayed after sign-in. */
export type Pending =
  | { type: 'watch'; gameId: string }
  | { type: 'alert'; gameId: string }

interface Store {
  demo: boolean
  ready: boolean
  games: Game[] | null
  gamesError: string | null
  gameById: (id: string) => Game | undefined
  refreshGames: () => Promise<void>

  onboarded: boolean
  finishOnboarding: (teams: string[], ticketCount: number) => void

  session: Session | null
  email: string | null
  signedIn: boolean
  signInOpen: boolean
  signInReason: string | null
  openSignIn: (reason?: string, pending?: Pending) => void
  closeSignIn: () => void
  signInWithEmail: (email: string) => Promise<{ error?: string }>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  takePending: () => Pending | null
  resume: Pending | null
  clearResume: () => void

  profile: Profile
  updateProfile: (patch: Partial<Profile>) => Promise<void>

  watches: Set<string>
  toggleWatch: (gameId: string) => Promise<void>

  alerts: Alert[]
  alertFor: (gameId: string) => Alert | undefined
  saveAlert: (draft: AlertDraft) => Promise<boolean>
  setAlertActive: (id: string, active: boolean) => Promise<void>
  deleteAlert: (id: string) => Promise<void>

  events: AlertEvent[]
  dismissEvent: (id: string) => Promise<void>

  pushPromptOpen: boolean
  setPushPromptOpen: (open: boolean) => void
}

const Ctx = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore must be used inside <StoreProvider>')
  return s
}

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function fail(action: string, message?: string) {
  toast.error(`Couldn't ${action}`, { description: message ?? 'Check your connection and try again.' })
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [games, setGames] = useState<Game[] | null>(null)
  const [gamesError, setGamesError] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(DEMO)
  const [onboarded, setOnboarded] = useState<boolean>(() => load('onboarded', false))
  const [profile, setProfile] = useState<Profile>(() => ({ ...DEFAULT_PROFILE, ...load<Partial<Profile>>('prefs', {}) }))
  const [watches, setWatches] = useState<Set<string>>(() => new Set(DEMO ? load<string[]>('watches', []) : []))
  const [alerts, setAlerts] = useState<Alert[]>(() => (DEMO ? load<Alert[]>('alerts', []) : []))
  const [events, setEvents] = useState<AlertEvent[]>(() => (DEMO ? load<AlertEvent[]>('events', []) : []))
  const [signInOpen, setSignInOpen] = useState(false)
  const [signInReason, setSignInReason] = useState<string | null>(null)
  const [pushPromptOpen, setPushPromptOpen] = useState(false)
  const [resume, setResume] = useState<Pending | null>(null)
  const userId = session?.user.id ?? null
  const signedIn = DEMO || !!userId
  const pendingRef = useRef<Pending | null>(load<Pending | null>('pending', null))

  // ---- games ---------------------------------------------------------------
  const refreshGames = useCallback(async () => {
    if (DEMO || !supabase) {
      setGames(demoGames())
      return
    }
    const since = new Date(Date.now() - 3 * 3600_000).toISOString()
    const { data, error } = await supabase.from('app_games').select('*').gte('starts_at', since).order('starts_at')
    if (error) {
      setGamesError(error.message)
      setGames((g) => g ?? [])
      return
    }
    setGamesError(null)
    setGames((data ?? []) as Game[])
  }, [])

  useEffect(() => {
    void refreshGames()
    const onFocus = () => document.visibilityState === 'visible' && void refreshGames()
    document.addEventListener('visibilitychange', onFocus)
    const timer = window.setInterval(() => void refreshGames(), 5 * 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.clearInterval(timer)
    }
  }, [refreshGames])

  const gameById = useCallback((id: string) => games?.find((g) => g.game_id === id), [games])

  // ---- auth ----------------------------------------------------------------
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // Load the signed-in person's data, and carry over choices made before signing in.
  useEffect(() => {
    if (!supabase || !userId) {
      if (!DEMO) {
        setWatches(new Set())
        setAlerts([])
        setEvents([])
      }
      return
    }
    const db = supabase
    let cancelled = false
    ;(async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString()
      const [p, w, a, e] = await Promise.all([
        db.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
        db.from('watches').select('game_id'),
        db.from('alerts').select('*').order('created_at'),
        db.from('alert_events').select('*').is('dismissed_at', null).gte('created_at', weekAgo).order('created_at', { ascending: false }),
      ])
      if (cancelled) return
      if (p.data) {
        const local = load<Partial<Profile>>('prefs', {})
        const merged = { ...DEFAULT_PROFILE, ...p.data, ...(load('prefs_dirty', false) ? local : {}) } as Profile
        setProfile(merged)
        if (load('prefs_dirty', false)) {
          await db.from('profiles').update({ teams: merged.teams, ticket_count: merged.ticket_count }).eq('user_id', userId)
          save('prefs_dirty', undefined)
        }
      }
      const watched = new Set((w.data ?? []).map((r: { game_id: string }) => r.game_id))
      setAlerts((a.data ?? []) as Alert[])
      setEvents((e.data ?? []) as AlertEvent[])
      // Finish whatever the person was doing when we asked them to sign in.
      const pending = pendingRef.current
      pendingRef.current = null
      save('pending', undefined)
      if (pending?.type === 'watch' && !watched.has(pending.gameId)) {
        const { error } = await db.from('watches').upsert({ user_id: userId, game_id: pending.gameId })
        if (!error) {
          watched.add(pending.gameId)
          toast('Watching this game', { description: "It's on Home now." })
        }
      }
      if (pending?.type === 'alert') setResume(pending)
      setWatches(watched)
      setSignInOpen(false)
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  // Persist demo-mode data on this device.
  useEffect(() => {
    if (!DEMO) return
    save('watches', [...watches])
    save('alerts', alerts)
    save('events', events)
  }, [watches, alerts, events])

  const openSignIn = useCallback((reason?: string, pending?: Pending) => {
    pendingRef.current = pending ?? null
    save('pending', pending ?? undefined)
    setSignInReason(reason ?? null)
    setSignInOpen(true)
  }, [])

  const takePending = useCallback(() => {
    const p = pendingRef.current
    pendingRef.current = null
    save('pending', undefined)
    return p
  }, [])

  const signInWithEmail = useCallback(async (email: string) => {
    if (!supabase) return { error: 'Sign-in is off in demo mode.' }
    const redirect = window.location.origin + window.location.pathname + window.location.hash
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } })
    return error ? { error: error.message } : {}
  }, [])

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return
    const redirect = window.location.origin + window.location.pathname + window.location.hash
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirect } })
    if (error) fail('open Google sign-in', error.message)
  }, [])

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
    toast('Signed out')
  }, [])

  // ---- profile -------------------------------------------------------------
  const finishOnboarding = useCallback((teams: string[], ticketCount: number) => {
    setProfile((p) => ({ ...p, teams, ticket_count: ticketCount }))
    save('prefs', { teams, ticket_count: ticketCount })
    save('prefs_dirty', true)
    save('onboarded', true)
    setOnboarded(true)
  }, [])

  const updateProfile = useCallback(async (patch: Partial<Profile>) => {
    setProfile((p) => {
      const next = { ...p, ...patch }
      save('prefs', { teams: next.teams, ticket_count: next.ticket_count })
      return next
    })
    if (supabase && userId) {
      const { founding_member: _ignored, ...rest } = patch
      void _ignored
      const { error } = await supabase.from('profiles').update(rest).eq('user_id', userId)
      if (error) fail('save your settings', error.message)
    }
  }, [userId])

  // ---- watches -------------------------------------------------------------
  const toggleWatch = useCallback(async (gameId: string) => {
    const on = !watches.has(gameId)
    setWatches((prev) => {
      const next = new Set(prev)
      if (on) next.add(gameId)
      else next.delete(gameId)
      return next
    })
    if (supabase && userId) {
      const { error } = on
        ? await supabase.from('watches').upsert({ user_id: userId, game_id: gameId })
        : await supabase.from('watches').delete().eq('game_id', gameId)
      if (error) {
        setWatches((prev) => {
          const next = new Set(prev)
          if (on) next.delete(gameId)
          else next.add(gameId)
          return next
        })
        fail(on ? 'watch this game' : 'stop watching this game', error.message)
        return
      }
    }
    toast(on ? 'Watching this game' : 'Stopped watching', {
      description: on ? "It's on Home now. Set an alert to hear when the price moves." : undefined,
    })
  }, [watches, userId])

  // ---- alerts --------------------------------------------------------------
  const alertFor = useCallback((gameId: string) => alerts.find((a) => a.game_id === gameId), [alerts])

  const saveAlert = useCallback(async (draft: AlertDraft): Promise<boolean> => {
    const existing = alerts.find((a) => a.game_id === draft.game_id)
    let saved: Alert
    if (supabase && userId) {
      const { data, error } = await supabase
        .from('alerts')
        .upsert({ ...draft, user_id: userId, active: true, target_fired_at: null, buy_fired_at: null, updated_at: new Date().toISOString() }, { onConflict: 'user_id,game_id' })
        .select()
        .single()
      if (error || !data) {
        fail('save this alert', error?.message)
        return false
      }
      saved = data as Alert
      if (!watches.has(draft.game_id)) {
        await supabase.from('watches').upsert({ user_id: userId, game_id: draft.game_id })
      }
    } else {
      saved = { id: existing?.id ?? uid(), created_at: existing?.created_at ?? new Date().toISOString(), active: true, ...draft }
      // Demo mode has no alert job, so fire right away when the condition is already true.
      const game = games?.find((g) => g.game_id === draft.game_id)
      if (game?.price_now != null) {
        const hit = draft.target_price != null && game.price_now <= draft.target_price
        const buy = draft.on_buy_signal && game.verdict === 'buy'
        if (hit || buy) {
          setEvents((ev) => [
            { id: uid(), game_id: game.game_id, kind: hit ? 'target_hit' : 'buy_signal', price: game.price_now, message: null, created_at: new Date().toISOString(), dismissed_at: null },
            ...ev.filter((x) => x.game_id !== game.game_id),
          ])
        }
      }
    }
    setAlerts((list) => [...list.filter((a) => a.game_id !== draft.game_id), saved])
    setWatches((prev) => new Set(prev).add(draft.game_id))
    const firstAlert = alerts.length === 0 && !load('push_prompted', false)
    toast(existing ? 'Alert updated' : 'Alert saved', {
      description: draft.target_price != null ? `We'll tell you at $${draft.target_price} or less.` : "We'll tell you when Tixcast says Buy now.",
    })
    if (firstAlert) {
      save('push_prompted', true)
      window.setTimeout(() => setPushPromptOpen(true), 450)
    }
    return true
  }, [alerts, games, userId, watches])

  const setAlertActive = useCallback(async (id: string, active: boolean) => {
    setAlerts((list) => list.map((a) => (a.id === id ? { ...a, active } : a)))
    if (supabase && userId) {
      const { error } = await supabase.from('alerts').update({ active, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) {
        setAlerts((list) => list.map((a) => (a.id === id ? { ...a, active: !active } : a)))
        fail(active ? 'turn on this alert' : 'pause this alert', error.message)
      }
    }
  }, [userId])

  const deleteAlert = useCallback(async (id: string) => {
    const before = alerts
    setAlerts((list) => list.filter((a) => a.id !== id))
    if (supabase && userId) {
      const { error } = await supabase.from('alerts').delete().eq('id', id)
      if (error) {
        setAlerts(before)
        fail('delete this alert', error.message)
        return
      }
    }
    toast('Alert deleted')
  }, [alerts, userId])

  const dismissEvent = useCallback(async (id: string) => {
    setEvents((ev) => ev.filter((e) => e.id !== id))
    if (supabase && userId) {
      await supabase.from('alert_events').update({ dismissed_at: new Date().toISOString() }).eq('id', id)
    }
  }, [userId])

  const value = useMemo<Store>(() => ({
    demo: DEMO,
    ready: authReady && games !== null,
    games, gamesError, gameById, refreshGames,
    onboarded, finishOnboarding,
    session, email: session?.user.email ?? null, signedIn,
    signInOpen, signInReason, openSignIn, closeSignIn: () => setSignInOpen(false),
    signInWithEmail, signInWithGoogle, signOut, takePending,
    resume, clearResume: () => setResume(null),
    profile, updateProfile,
    watches, toggleWatch,
    alerts, alertFor, saveAlert, setAlertActive, deleteAlert,
    events, dismissEvent,
    pushPromptOpen, setPushPromptOpen,
  }), [authReady, games, gamesError, gameById, refreshGames, onboarded, finishOnboarding, session, signedIn,
    signInOpen, signInReason, openSignIn, signInWithEmail, signInWithGoogle, signOut, takePending, resume, profile,
    updateProfile, watches, toggleWatch, alerts, alertFor, saveAlert, setAlertActive, deleteAlert, events,
    dismissEvent, pushPromptOpen])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
