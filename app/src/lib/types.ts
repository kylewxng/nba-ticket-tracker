export type Verdict = 'buy' | 'wait' | 'watch'

export interface PricePoint { t: string; p: number }

export interface Reason {
  kind: 'listings' | 'calendar' | 'injury' | 'history'
  tone: Verdict
  title: string
  detail: string
}

export interface Injury { team: string; player: string; status: string | null; comment?: string | null }

export interface Game {
  game_id: string
  starts_at: string
  home_tricode: string
  away_tricode: string
  home_team: string | null
  away_team: string | null
  arena: string | null
  national_tv: string | null
  price_now: number | null
  price_source: 'seatgeek' | 'ticketmaster' | null
  buy_url: string | null
  listing_count: number | null
  history: PricePoint[]
  verdict: Verdict
  headline: string | null
  odds_label: string | null
  odds_pct: number | null
  risk_label: string | null
  risk_pct: number | null
  range_label: string | null
  range_low: number | null
  range_high: number | null
  reasons: Reason[]
  injuries: Injury[]
  model: string
  updated_at: string
}

export interface Profile {
  display_name: string | null
  teams: string[]
  ticket_count: number
  max_price: number | null
  notify_push: boolean
  notify_email: boolean
  weekly_digest: boolean
  founding_member: boolean
  created_at?: string
}

export interface Alert {
  id: string
  game_id: string
  target_price: number | null
  on_buy_signal: boolean
  channel: 'push' | 'email'
  active: boolean
  created_at: string
}

export interface AlertEvent {
  id: string
  game_id: string
  kind: 'target_hit' | 'buy_signal'
  price: number | null
  message: string | null
  created_at: string
  dismissed_at: string | null
}

export type AlertDraft = Pick<Alert, 'game_id' | 'target_price' | 'on_buy_signal' | 'channel'>
