import type { Game, PricePoint, Reason, Verdict } from './types'

// Sample games for demo mode (no Supabase keys). Dates are relative to today
// so the app always looks current. None of these prices are real.

interface Seed {
  away: string
  home: 'LAL' | 'LAC'
  days: number
  hourPT: number
  price: number
  verdict: Verdict
  tv?: string
  trend: number // total change over the history, as a fraction (-0.2 = fell 20%)
  listings: number
}

const SEEDS: Seed[] = [
  { away: 'SAC', home: 'LAC', days: 1, hourPT: 19.5, price: 29, verdict: 'wait', trend: -0.08, listings: 640 },
  { away: 'SAS', home: 'LAL', days: 3, hourPT: 19.5, price: 96, verdict: 'buy', trend: 0.09, listings: 310 },
  { away: 'UTA', home: 'LAL', days: 5, hourPT: 18.5, price: 47, verdict: 'wait', trend: -0.12, listings: 820 },
  { away: 'PHX', home: 'LAC', days: 7, hourPT: 19, price: 38, verdict: 'buy', trend: -0.2, listings: 280 },
  { away: 'BOS', home: 'LAL', days: 17, hourPT: 19.5, price: 211, verdict: 'watch', tv: 'ESPN', trend: 0.02, listings: 540 },
  { away: 'DEN', home: 'LAC', days: 19, hourPT: 18, price: 64, verdict: 'wait', trend: -0.06, listings: 700 },
  { away: 'NYK', home: 'LAL', days: 29, hourPT: 19.5, price: 188, verdict: 'buy', tv: 'TNT', trend: 0.14, listings: 260 },
  { away: 'GSW', home: 'LAL', days: 39, hourPT: 19.5, price: 142, verdict: 'wait', tv: 'ABC', trend: -0.1, listings: 900 },
  { away: 'MEM', home: 'LAC', days: 42, hourPT: 19.5, price: 33, verdict: 'watch', trend: 0.01, listings: 760 },
  { away: 'DAL', home: 'LAL', days: 48, hourPT: 19.5, price: 158, verdict: 'watch', trend: 0.03, listings: 480 },
]

const ARENA = { LAL: 'Crypto.com Arena', LAC: 'Intuit Dome' }
const FULL = { LAL: 'Los Angeles Lakers', LAC: 'LA Clippers' }

function rand(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** Tip-off `days` from today at `hourPT` Pacific, as UTC ISO. Pacific is UTC-8 in season. */
function tipoff(days: number, hourPT: number, now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  d.setUTCDate(d.getUTCDate() + days)
  d.setUTCMinutes(Math.round((hourPT + 8) * 60))
  return d.toISOString()
}

function history(seed: Seed, i: number, now: Date): PricePoint[] {
  const r = rand(1000 + i * 77)
  const pts: PricePoint[] = []
  const n = 30 * 4 // every 6 hours for 30 days
  const start = seed.price / (1 + seed.trend)
  for (let k = 0; k < n; k++) {
    const f = k / (n - 1)
    // Slow swings plus a little noise, shaped like a real listing history.
    const swing = Math.sin(f * Math.PI * (2 + (i % 3))) * 0.035 * seed.price
    const noise = (r() - 0.5) * 0.012 * seed.price
    const p = start + (seed.price - start) * f + (swing + noise) * (1 - f * 0.7)
    pts.push({ t: new Date(now.getTime() - (n - 1 - k) * 6 * 3600_000).toISOString(), p: Math.max(8, Math.round(p)) })
  }
  pts[pts.length - 1].p = seed.price
  return pts
}

function money(n: number) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

function build(seed: Seed, i: number, now: Date): Game {
  const starts = tipoff(seed.days, seed.hourPT, now)
  const p = seed.price
  const reasons: Reason[] = []
  let out: Partial<Game>
  if (seed.verdict === 'buy') {
    reasons.push(
      { kind: 'listings', tone: 'buy', title: `Listings dropped ${Math.round(18 + i * 2)}% in 3 days`, detail: 'Fewer seats for sale usually means higher prices.' },
      seed.tv
        ? { kind: 'calendar', tone: 'buy', title: `On national TV (${seed.tv})`, detail: 'Big-audience games usually hold their price close to tip-off.' }
        : { kind: 'calendar', tone: 'buy', title: 'Weekend night game', detail: 'Weekend games usually see more late buyers.' },
    )
    out = {
      headline: 'This is close to the low. Prices usually climb from here.',
      odds_label: 'Chance it gets more expensive', odds_pct: 74 + (i % 3) * 4,
      risk_label: 'Chance it drops another 10%', risk_pct: 12 + (i % 2) * 4,
      range_label: 'Expected at tip-off', range_low: Math.round(p * 1.08), range_high: Math.round(p * 1.24),
    }
  } else if (seed.verdict === 'wait') {
    const drop = Math.min(0.18, 0.04 + 0.0008 * seed.days * 24)
    reasons.push(
      { kind: 'listings', tone: 'wait', title: `Listings up ${12 + i}% this week`, detail: 'More sellers are competing for the same buyers, which pushes prices down.' },
      { kind: 'calendar', tone: 'wait', title: 'Weeknight game, regular matchup', detail: 'Across the league, weeknight prices tend to drift down in the final 48 hours.' },
    )
    out = {
      headline: 'Likely to get cheaper before tip-off.',
      odds_label: `Chance it drops below ${money(p * (1 - drop / 2))}`, odds_pct: 66 + (i % 3) * 3,
      risk_label: `Chance it climbs above ${money(p * 1.2)}`, risk_pct: 10 + (i % 2) * 3,
      range_label: 'Forecast low', range_low: Math.round(p * (1 - drop)), range_high: Math.round(p * (1 - drop / 2)),
    }
  } else {
    reasons.push({ kind: 'history', tone: 'watch', title: 'Price is holding steady', detail: 'The cheapest seat has moved less than 5% this week.' })
    out = {
      headline: "No clear move yet. We'll tell you when that changes.",
      odds_label: 'Chance it drops 10% before tip-off', odds_pct: 40,
      risk_label: 'Chance it climbs 10% before tip-off', risk_pct: 35,
      range_label: 'Likely at tip-off', range_low: Math.round(p * 0.9), range_high: Math.round(p * 1.12),
    }
  }
  const injuries = seed.away === 'GSW'
    ? [{ team: 'LAL', player: 'Starting guard', status: 'Questionable', comment: 'Listed questionable with an ankle sprain.' }]
    : []
  if (injuries.length) {
    reasons.push({ kind: 'injury', tone: 'wait', title: 'Starting guard listed questionable', detail: "If he sits, prices could fall further. We'll update the call when his status changes." })
  }
  return {
    game_id: `demo-${seed.home}-${seed.away}-${seed.days}`,
    starts_at: starts,
    home_tricode: seed.home,
    away_tricode: seed.away,
    home_team: FULL[seed.home],
    away_team: null,
    arena: ARENA[seed.home],
    national_tv: seed.tv ?? null,
    price_now: p,
    price_source: 'seatgeek',
    buy_url: 'https://seatgeek.com/',
    listing_count: seed.listings,
    history: history(seed, i, now),
    verdict: seed.verdict,
    reasons: reasons.slice(0, 3),
    injuries,
    model: 'rules-beta',
    updated_at: new Date(now.getTime() - 14 * 60_000).toISOString(),
    headline: null, odds_label: null, odds_pct: null, risk_label: null, risk_pct: null,
    range_label: null, range_low: null, range_high: null,
    ...out,
  }
}

export function demoGames(now = new Date()): Game[] {
  return SEEDS.map((s, i) => build(s, i, now))
}
