import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { GamesTable, Page, Panel } from '@/components/desktop'
import { Skeleton } from '@/components/kit'
import { hoursUntil } from '@/lib/format'
import { useStore } from '@/lib/store'
import { teamName } from '@/lib/teams'
import { cn } from '@/lib/utils'

const FILTERS = [
  { id: 'all', label: 'All games' },
  { id: 'week', label: 'Next 7 days' },
  { id: 'buy', label: 'Buy now' },
  { id: 'wait', label: 'Wait' },
  { id: 'under50', label: 'Under $50' },
  { id: 'LAL', label: 'Lakers' },
  { id: 'LAC', label: 'Clippers' },
] as const
type FilterId = (typeof FILTERS)[number]['id']

export function ExploreDesktop() {
  const { games, ready } = useStore()
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const [filter, setFilter] = useState<FilterId>('all')
  const setQuery = (q: string) => setParams(q ? { q } : {}, { replace: true })

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (games ?? []).filter((g) => {
      if (filter === 'week' && hoursUntil(g.starts_at) > 7 * 24) return false
      if ((filter === 'buy' || filter === 'wait') && (g.verdict !== filter || g.price_now == null)) return false
      if (filter === 'under50' && !(g.price_now != null && g.price_now < 50)) return false
      if ((filter === 'LAL' || filter === 'LAC') && g.home_tricode !== filter) return false
      if (!q) return true
      const hay = [g.away_tricode, g.home_tricode, teamName(g.away_tricode), teamName(g.home_tricode), g.away_team, g.home_team, g.arena].filter(Boolean).join(' ').toLowerCase()
      return q.split(/\s+/).every((w) => hay.includes(w))
    })
  }, [games, filter, query])

  return (
    <Page>
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="font-display m-0 text-[48px] font-extrabold leading-none">Explore</h1>
          <p className="m-0 mt-2 text-[14px] text-sub">Every Lakers and Clippers home game this season. Sort by date, price, or how much it moved this week.</p>
        </div>
        <span className="tabular pb-1 text-[14px] text-sub">{ready ? `${list.length} game${list.length === 1 ? '' : 's'}` : ''}</span>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-[320px]">
          <label htmlFor="explore-search" className="sr-only-safe">Search teams or arenas</label>
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
          <input
            id="explore-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a team or arena"
            className="h-10 w-full rounded-full border border-[#22304D] bg-[#131D33] pl-10 pr-9 text-[14px] placeholder:text-faint focus:border-[#3A4A6E] focus:outline-none"
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-sub hover:text-ink">
              <X size={14} />
            </button>
          )}
        </div>
        <div role="group" aria-label="Filters" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn('h-10 rounded-full border px-4 text-[13px] font-semibold', filter === f.id ? 'glacier border-transparent' : 'border-[#22304D] text-sub hover:text-ink')}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <Panel className="mt-5" pad={false}>
        {!ready ? (
          <div className="flex flex-col gap-2 p-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 bg-[#16213A]" />)}</div>
        ) : (
          <GamesTable
            games={list}
            empty={
              <>
                {query ? `No home games match "${query}". Try a team name like Warriors or Celtics.` : 'No games match this filter right now.'}{' '}
                <button type="button" onClick={() => { setQuery(''); setFilter('all') }} className="font-semibold text-link">Show all games</button>
              </>
            }
          />
        )}
      </Panel>
    </Page>
  )
}
