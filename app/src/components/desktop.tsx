import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, Bell, Bookmark, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { dailyLows, dateParts, money, pct, priceChange, timeOnly } from '@/lib/format'
import { useStore } from '@/lib/store'
import { matchup } from '@/lib/teams'
import type { Game } from '@/lib/types'
import { VERDICT_STYLE } from '@/lib/verdict'
import { Sparkline, TeamStack, VerdictPill } from './kit'
import { Avatar } from '@/screens/Home'
import { Logo } from './Logo'

/** Page width for every desktop screen. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn('mx-auto w-full max-w-[1200px] px-8 pb-20 pt-8 xl:px-10', className)}>{children}</main>
}

/** A titled block of a desktop page. Panels carry a surface; plain sections don't. */
export function Panel({ title, action, children, className, pad = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cn('rounded-[18px] border border-[#1B2743] bg-[#131D33]', className)}>
      {title && (
        <div className="flex items-center justify-between gap-4 border-b border-[#1B2743] px-5 py-3.5">
          <h2 className="m-0 text-[14px] font-semibold text-sub">{title}</h2>
          {action}
        </div>
      )}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  )
}

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/explore', label: 'Explore', end: false },
  { to: '/alerts', label: 'Alerts', end: false },
]

export function TopBar() {
  const { events } = useStore()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    navigate(q.trim() ? `/explore?q=${encodeURIComponent(q.trim())}` : '/explore')
  }
  return (
    <header className="sticky top-0 z-30 border-b border-[#1B2743] bg-[rgba(14,22,38,0.88)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-8 px-8 xl:px-10">
        <Link to="/" aria-label="Tixcast home" className="flex-none">
          <Logo height={26} />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          {NAV.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn('flex h-9 items-center gap-2 rounded-full px-3.5 text-[14px] font-semibold', isActive ? 'nav-on' : 'text-sub hover:text-ink')}
            >
              {label}
              {label === 'Alerts' && events.length > 0 && (
                <span className="rounded-full bg-[#FF6B47] px-1.5 text-[11px] font-bold leading-[18px] text-[#1A0E0A]">{events.length}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <form role="search" onSubmit={onSearch} className="relative ml-auto w-[300px]">
          <label htmlFor="top-search" className="sr-only-safe">Search games</label>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
          <input
            id="top-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a team or arena"
            className="h-10 w-full rounded-full border border-[#22304D] bg-[#131D33] pl-9 pr-4 text-[14px] placeholder:text-faint focus:border-[#3A4A6E] focus:outline-none"
          />
        </form>
        <div className="flex items-center gap-2">
          <Link to="/alerts" aria-label="Alerts" className="relative flex h-10 w-10 items-center justify-center rounded-full text-sub hover:bg-[#16213A] hover:text-ink">
            <Bell size={19} strokeWidth={1.8} />
            {events.length > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#FF6B47] ring-2 ring-[#0E1626]" />}
          </Link>
          <Link to="/profile" aria-label="Your profile"><Avatar size={36} /></Link>
        </div>
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Games table
// ---------------------------------------------------------------------------

type SortKey = 'date' | 'price' | 'change'

function SortHeader({ label, k, sort, setSort, align = 'left' }: { label: string; k: SortKey; sort: { key: SortKey; dir: 1 | -1 }; setSort: (s: { key: SortKey; dir: 1 | -1 }) => void; align?: 'left' | 'right' }) {
  const on = sort.key === k
  const Icon = sort.dir === 1 ? ArrowUp : ArrowDown
  return (
    <th scope="col" aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={cn('px-4 py-3 font-semibold', align === 'right' && 'text-right')}>
      <button
        type="button"
        onClick={() => setSort({ key: k, dir: on ? ((-sort.dir) as 1 | -1) : 1 })}
        className={cn('inline-flex items-center gap-1 hover:text-ink', on ? 'text-ink' : '')}
      >
        {label}
        {on && <Icon size={12} strokeWidth={2.4} aria-hidden="true" />}
      </button>
    </th>
  )
}

export function GamesTable({ games, limit, empty }: { games: Game[]; limit?: number; empty?: ReactNode }) {
  const navigate = useNavigate()
  const { watches, toggleWatch, signedIn, openSignIn } = useStore()
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: 1 })

  const rows = useMemo(() => {
    const withChange = games.map((g) => ({ g, change: priceChange(g.history, 7) }))
    const val = (r: (typeof withChange)[number]) =>
      sort.key === 'date' ? new Date(r.g.starts_at).getTime() : sort.key === 'price' ? r.g.price_now ?? Infinity : r.change ?? Infinity
    const sorted = [...withChange].sort((a, b) => (val(a) - val(b)) * sort.dir)
    return limit ? sorted.slice(0, limit) : sorted
  }, [games, sort, limit])

  if (!games.length) return <div className="px-5 py-10 text-[14px] text-sub">{empty}</div>

  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-[#1B2743] text-[12px] text-sub">
          <SortHeader label="Date" k="date" sort={sort} setSort={setSort} />
          <th scope="col" className="px-4 py-3 font-semibold">Game</th>
          <SortHeader label="Cheapest" k="price" sort={sort} setSort={setSort} align="right" />
          <SortHeader label="Last 7 days" k="change" sort={sort} setSort={setSort} />
          <th scope="col" className="px-4 py-3 font-semibold">Tixcast says</th>
          <th scope="col" className="w-14 px-4 py-3"><span className="sr-only-safe">Watch</span></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ g, change }) => {
          const d = dateParts(g.starts_at)
          const watching = watches.has(g.game_id)
          const spark = dailyLows(g.history, 10)
          return (
            <tr
              key={g.game_id}
              onClick={() => navigate(`/game/${g.game_id}`)}
              className="cursor-pointer border-b border-[#1B2743] last:border-b-0 hover:bg-[#16213A]"
            >
              <td className="whitespace-nowrap px-4 py-3.5">
                <div className="text-[14px] font-semibold">{d.weekday}, {d.month.charAt(0) + d.month.slice(1).toLowerCase()} {d.day}</div>
                <div className="text-[12px] text-sub">{timeOnly(g.starts_at)}</div>
              </td>
              <td className="px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <TeamStack away={g.away_tricode} home={g.home_tricode} size={34} />
                  <div className="min-w-0">
                    <Link to={`/game/${g.game_id}`} onClick={(e) => e.stopPropagation()} className="block truncate text-[15px] font-semibold text-ink hover:text-ink hover:underline">
                      {matchup(g)}
                    </Link>
                    <div className="truncate text-[12px] text-sub">{g.arena}{g.national_tv ? `, ${g.national_tv.split(',')[0]}` : ''}</div>
                  </div>
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-3.5 text-right">
                {g.price_now != null ? (
                  <span className="font-display tabular text-[24px] font-extrabold leading-none">{money(g.price_now)}</span>
                ) : (
                  <span className="text-[13px] text-faint">No listings yet</span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3.5">
                {spark.length > 1 && change != null ? (
                  <div className="flex items-center gap-3">
                    <Sparkline values={spark} color={VERDICT_STYLE[g.verdict].line} width={64} height={22} />
                    <span className={cn('tabular w-11 text-[13px] font-semibold', change > 0.005 ? 'text-[#FF8A6B]' : change < -0.005 ? 'text-[#9CC4FF]' : 'text-sub')}>{pct(change)}</span>
                  </div>
                ) : (
                  <span className="text-[13px] text-faint">Tracking</span>
                )}
              </td>
              <td className="px-4 py-3.5">
                {g.price_now != null ? <VerdictPill verdict={g.verdict} /> : <span className="rounded-md bg-[#1E2B48] px-[7px] py-[2px] text-[11px] font-bold text-sub">Not yet</span>}
              </td>
              <td className="px-4 py-3.5 text-right">
                <button
                  type="button"
                  aria-label={watching ? `Stop watching ${matchup(g)}` : `Watch ${matchup(g)}`}
                  aria-pressed={watching}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!signedIn) return openSignIn('Sign in to keep games on Home and hear when prices move.', { type: 'watch', gameId: g.game_id })
                    void toggleWatch(g.game_id)
                  }}
                  className={cn('inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#1E2B48]', watching ? 'text-link' : 'text-faint hover:text-ink')}
                >
                  <Bookmark size={17} strokeWidth={1.9} fill={watching ? 'currentColor' : 'none'} />
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Segmented filter used above tables. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex rounded-full border border-[#22304D] bg-[#0E1626] p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn('h-8 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold', value === o.id ? 'bg-[#1E2B48] text-ink' : 'text-sub hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="m-0 text-[12px] text-sub">{label}</p>
      <p className="font-display tabular m-0 mt-1 text-[28px] font-extrabold leading-none">{value}</p>
      {sub && <p className="m-0 mt-1 text-[12px] text-faint">{sub}</p>}
    </div>
  )
}

