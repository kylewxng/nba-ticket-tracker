import type { Game, Verdict } from './types'

export const VERDICT_LABEL: Record<Verdict, string> = { buy: 'Buy now', wait: 'Wait', watch: 'Watch' }

export const VERDICT_STYLE: Record<Verdict, { pill: string; line: string; band: string }> = {
  buy: { pill: 'bg-[#FF6B47] text-[#1A0E0A]', line: '#FF6B47', band: 'rgba(255,107,71,0.18)' },
  wait: { pill: 'bg-[#233A63] text-[#A8CBFF]', line: '#7FB2FF', band: 'rgba(127,178,255,0.16)' },
  watch: { pill: 'bg-[#3A3022] text-[#E3B87C]', line: '#E3B87C', band: 'rgba(227,184,124,0.14)' },
}

/**
 * Rough chance the cheapest ticket reaches `target` before tip-off, from the
 * game's call and forecast range. Shown as an estimate, never a promise.
 */
export function chanceToHit(game: Game, target: number): number {
  const price = game.price_now
  if (price == null) return 0
  if (target >= price) return 100
  const drop = 1 - target / price
  const expected =
    game.verdict === 'wait' && game.range_low != null
      ? Math.max(0.03, 1 - game.range_low / price)
      : game.verdict === 'buy'
        ? 0.02
        : 0.07
  const p = 0.92 / (1 + Math.exp((drop - expected) / 0.035))
  return Math.max(2, Math.min(95, Math.round(p * 100)))
}

/** Quick targets for the alert sheet, based on what the call expects. */
export function presetTargets(game: Game): { value: number; note: string }[] {
  const price = game.price_now ?? 0
  const raw: [number, string][] =
    game.verdict === 'wait' && game.range_low != null
      ? [[game.range_high ?? game.range_low, 'Likely'], [game.range_low, 'Forecast low'], [game.range_low * 0.92, 'Long shot']]
      : [[price * 0.95, 'Small dip'], [price * 0.9, 'Good deal'], [price * 0.82, 'Long shot']]
  const seen = new Set<number>()
  return raw
    .map(([v, note]) => ({ value: Math.round(v), note }))
    .filter((p) => p.value < price && !seen.has(p.value) && (seen.add(p.value), true))
}

/** Where the alert slider starts: the first preset. */
export function defaultTarget(game: Game): number {
  return presetTargets(game)[0]?.value ?? Math.round((game.price_now ?? 0) * 0.95)
}

/** The one game Home leads with: the soonest Buy now, else the biggest expected drop. */
export function bestCall(games: Game[]): Game | null {
  const priced = games.filter((g) => g.price_now != null)
  const buys = priced.filter((g) => g.verdict === 'buy').sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  if (buys[0]) return buys[0]
  const waits = priced
    .filter((g) => g.verdict === 'wait' && g.range_low != null)
    .sort((a, b) => (1 - a.range_low! / a.price_now!) < (1 - b.range_low! / b.price_now!) ? 1 : -1)
  return waits[0] ?? null
}

/** A game has a real call once it has prices and enough history for odds. */
export function hasCall(game: Game): boolean {
  return game.price_now != null && game.odds_pct != null
}

export const EVENT_LABEL = { target_hit: 'Your price hit', buy_signal: 'Tixcast says Buy now', call_ready: 'First call is ready' } as const
