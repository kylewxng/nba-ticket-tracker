import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { PageTitle, Screen } from '@/components/layout'
import { Skeleton } from '@/components/kit'
import { GameRow } from '@/components/games'
import { hoursUntil } from '@/lib/format'
import { useStore } from '@/lib/store'
import { teamName } from '@/lib/teams'
import { cn } from '@/lib/utils'

const FILTERS = [
  { id: 'all', label: 'All LA games', heading: 'Upcoming LA games' },
  { id: 'week', label: 'This week', heading: 'This week' },
  { id: 'buy', label: 'Buy now', heading: 'Tixcast says Buy now' },
  { id: 'under50', label: 'Under $50', heading: 'Under $50' },
  { id: 'LAL', label: 'Lakers', heading: 'Lakers home games' },
  { id: 'LAC', label: 'Clippers', heading: 'Clippers home games' },
] as const

type FilterId = (typeof FILTERS)[number]['id']

export function ExploreScreen() {
  const { games, ready } = useStore()
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery] = useState('')

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (games ?? []).filter((g) => {
      if (filter === 'week' && hoursUntil(g.starts_at) > 7 * 24) return false
      if (filter === 'buy' && g.verdict !== 'buy') return false
      if (filter === 'under50' && !(g.price_now != null && g.price_now < 50)) return false
      if ((filter === 'LAL' || filter === 'LAC') && g.home_tricode !== filter) return false
      if (!q) return true
      const hay = [g.away_tricode, g.home_tricode, teamName(g.away_tricode), teamName(g.home_tricode), g.away_team, g.home_team, g.arena]
        .filter(Boolean).join(' ').toLowerCase()
      return q.split(/\s+/).every((word) => hay.includes(word))
    })
  }, [games, filter, query])

  const active = FILTERS.find((f) => f.id === filter)!

  return (
    <Screen className="gap-[18px]">
      <PageTitle>Explore</PageTitle>

      <div className="relative md:max-w-[520px]">
        <label htmlFor="search" className="sr-only-safe">Search teams or arenas</label>
        <Search size={18} strokeWidth={2} className="pointer-events-none absolute left-3.5 top-[15px] z-10 text-sub" aria-hidden="true" />
        <input
          id="search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search teams or arenas"
          className="glass h-12 w-full rounded-[14px] pl-[42px] pr-3.5 text-[16px] placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-link"
        />
      </div>

      <div role="group" aria-label="Filters" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn('h-9 flex-none whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold', filter === f.id ? 'glacier' : 'glass text-ink')}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex items-baseline justify-between">
        <h2 className="m-0 text-[17px] font-bold">{query ? 'Search results' : active.heading}</h2>
        <span className="text-[13px] text-sub">{ready ? `${list.length} game${list.length === 1 ? '' : 's'}` : ''}</span>
      </div>

      <div className="flex flex-col gap-2.5 md:grid md:grid-cols-2 md:gap-3 xl:grid-cols-3">
        {!ready
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[72px]" />)
          : list.length
            ? list.map((g) => <GameRow key={g.game_id} game={g} />)
            : (
              <div className="glass rounded-2xl p-5 text-[14px] leading-[1.5] text-sub md:col-span-2 xl:col-span-3">
                {query ? `No LA home games match "${query}". Try a team name like Warriors or Celtics.` : 'No games match this filter right now.'}
                {(query || filter !== 'all') && (
                  <button type="button" onClick={() => { setQuery(''); setFilter('all') }} className="mt-2 block font-semibold text-link">Show all games</button>
                )}
              </div>
            )}
      </div>
    </Screen>
  )
}
