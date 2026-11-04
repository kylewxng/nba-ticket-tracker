const LA = 'America/Los_Angeles'

export function money(n: number | null | undefined): string {
  if (n == null) return '—'
  return '$' + Math.round(n).toLocaleString('en-US')
}

const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: LA, weekday: 'short', month: 'short', day: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: LA, hour: 'numeric', minute: '2-digit' })
const longDay = new Intl.DateTimeFormat('en-US', { timeZone: LA, weekday: 'long', month: 'short', day: 'numeric' })
const parts = new Intl.DateTimeFormat('en-US', { timeZone: LA, month: 'short', day: 'numeric', weekday: 'short' })

/** "Sat, Dec 12, 7:30 PM" */
export function gameWhen(iso: string): string {
  const d = new Date(iso)
  return `${dayFmt.format(d)}, ${timeFmt.format(d)}`
}

/** "Monday, Nov 2" */
export function todayLabel(d = new Date()): string {
  return longDay.format(d)
}

export function dateParts(iso: string): { month: string; day: string; weekday: string } {
  const p = Object.fromEntries(parts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return { month: (p.month ?? '').toUpperCase(), day: p.day ?? '', weekday: p.weekday ?? '' }
}

export function timeOnly(iso: string): string {
  return timeFmt.format(new Date(iso))
}

export function ago(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hr ago`
  const days = Math.round(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function hoursUntil(iso: string, now = Date.now()): number {
  return (new Date(iso).getTime() - now) / 3_600_000
}

export function arenaShort(arena: string | null): string {
  return arena ?? ''
}

/** Cheapest price per day for the last `days` days, oldest first. For sparklines. */
export function dailyLows(history: { t: string; p: number }[], days: number): number[] {
  const cutoff = Date.now() - days * 86400_000
  const byDay = new Map<string, number>()
  for (const pt of history) {
    if (new Date(pt.t).getTime() < cutoff) continue
    const key = pt.t.slice(0, 10)
    byDay.set(key, Math.min(byDay.get(key) ?? Infinity, pt.p))
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v)
}

/** Change in the cheapest price over the last `days` days, as a fraction (0.08 = up 8%). */
export function priceChange(history: { t: string; p: number }[], days: number): number | null {
  if (history.length < 2) return null
  const cutoff = Date.now() - days * 86400_000
  let then: number | null = null
  for (const pt of history) {
    if (new Date(pt.t).getTime() <= cutoff) then = pt.p
  }
  then ??= history[0].p
  const now = history[history.length - 1].p
  return then ? now / then - 1 : null
}

export function pct(x: number): string {
  const v = Math.round(x * 100)
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%`
}
