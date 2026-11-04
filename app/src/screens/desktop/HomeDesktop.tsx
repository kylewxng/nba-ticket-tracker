import { useState } from 'react'
import { Link } from 'react-router-dom'
import { GamesTable, Page, Panel, Segmented } from '@/components/desktop'
import { Skeleton } from '@/components/kit'
import { money, todayLabel } from '@/lib/format'
import { useStore } from '@/lib/store'
import { matchup } from '@/lib/teams'
import { bestCall } from '@/lib/verdict'
import { lowNote } from '../Home'
import { TicketStub, TrackingStub } from './TicketStub'

type Filter = 'mine' | 'watching' | 'LAL' | 'LAC'

function AlertsPanel() {
  const { signedIn, openSignIn, alerts, events, gameById } = useStore()
  const ready = events.map((e) => ({ e, g: gameById(e.game_id) })).filter((x) => x.g).slice(0, 2)
  const live = alerts.filter((a) => a.active).map((a) => ({ a, g: gameById(a.game_id) })).filter((x) => x.g).slice(0, 4)
  return (
    <Panel title="Your alerts" action={signedIn ? <Link to="/alerts" className="text-[13px] font-semibold">Manage</Link> : undefined} pad={false}>
      {!signedIn ? (
        <div className="p-5">
          <p className="m-0 text-[15px] font-semibold">Hear when it's time to buy</p>
          <p className="m-0 mt-1.5 text-[13px] leading-[1.5] text-sub">Pick a target price on any game. We'll tell you when it gets there, or when Tixcast says Buy now.</p>
          <button type="button" onClick={() => openSignIn('Sign in to set price alerts on any LA home game.')} className="primary-fill mt-4 h-10 rounded-xl px-4 text-[14px] font-bold">Sign in to set alerts</button>
        </div>
      ) : !ready.length && !live.length ? (
        <div className="p-5">
          <p className="m-0 text-[15px] font-semibold">No alerts yet</p>
          <p className="m-0 mt-1.5 text-[13px] leading-[1.5] text-sub">Open any game and choose Alert me. Tixcast watches the price for you.</p>
        </div>
      ) : (
        <ul className="m-0 list-none p-0">
          {ready.map(({ e, g }) => (
            <li key={e.id} className="border-b border-[#1B2743]">
              <Link to={`/game/${g!.game_id}`} className="flex items-center justify-between gap-3 bg-[rgba(255,107,71,0.1)] px-5 py-3.5 text-ink hover:text-ink">
                <div className="min-w-0">
                  <p className="m-0 text-[12px] font-bold text-[#FF8A6B]">{e.kind === 'buy_signal' ? 'Tixcast says Buy now' : 'Hit your price'}</p>
                  <p className="m-0 truncate text-[14px] font-semibold">{matchup(g!)}</p>
                </div>
                <span className="font-display tabular text-[24px] font-extrabold">{money(g!.price_now ?? e.price)}</span>
              </Link>
            </li>
          ))}
          {live.map(({ a, g }) => (
            <li key={a.id} className="border-b border-[#1B2743] last:border-b-0">
              <Link to={`/game/${g!.game_id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 text-ink hover:bg-[#16213A] hover:text-ink">
                <div className="min-w-0">
                  <p className="m-0 truncate text-[14px] font-semibold">{matchup(g!)}</p>
                  <p className="m-0 text-[12px] text-sub">{a.target_price != null ? `Target ${money(a.target_price)}` : 'Buy now only'}</p>
                </div>
                <div className="text-right">
                  <p className="m-0 text-[11px] text-faint">Now</p>
                  <p className="tabular m-0 text-[15px] font-bold">{money(g!.price_now)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function HomeDesktop() {
  const { games, ready, profile, watches } = useStore()
  const [filter, setFilter] = useState<Filter>('mine')
  const all = games ?? []
  const mine = all.filter((g) => profile.teams.includes(g.home_tricode))
  const best = bestCall(mine)
  const priced = mine.filter((g) => g.price_now != null)
  const buys = priced.filter((g) => g.verdict === 'buy').length
  const list =
    filter === 'watching' ? all.filter((g) => watches.has(g.game_id))
      : filter === 'mine' ? mine
        : all.filter((g) => g.home_tricode === filter)

  return (
    <Page>
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="m-0 text-[14px] text-sub">{todayLabel()}</p>
          <h1 className="font-display m-0 mt-1 text-[48px] font-extrabold leading-none">Today's best call</h1>
        </div>
        {ready && (
          <p className="m-0 pb-1 text-[14px] text-sub">
            <span className="tabular font-semibold text-ink">{mine.length}</span> games tracked,{' '}
            <span className="tabular font-semibold text-ink">{priced.length}</span> with prices,{' '}
            <span className="tabular font-semibold text-[#FF8A6B]">{buys}</span> say Buy now
          </p>
        )}
      </div>

      <div className="mt-6 grid grid-cols-12 gap-6">
        <div className="col-span-12 xl:col-span-8">
          {!ready ? <Skeleton className="h-[420px] rounded-[22px] bg-[#131D33]" /> : best ? <TicketStub game={best} note={lowNote(best)} /> : <TrackingStub game={mine[0] ?? null} tracked={mine.length} />}
        </div>
        <div className="col-span-12 xl:col-span-4">
          <AlertsPanel />
        </div>
      </div>

      <Panel
        className="mt-6"
        pad={false}
        title={<span className="text-[16px] font-bold text-ink">Upcoming home games</span>}
        action={
          <div className="flex items-center gap-4">
            <Segmented
              label="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { id: 'mine', label: 'Your teams' },
                { id: 'LAL', label: 'Lakers' },
                { id: 'LAC', label: 'Clippers' },
                { id: 'watching', label: `Watching${watches.size ? ` (${watches.size})` : ''}` },
              ]}
            />
            <Link to="/explore" className="text-[13px] font-semibold">All games</Link>
          </div>
        }
      >
        {!ready ? (
          <div className="flex flex-col gap-2 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 bg-[#16213A]" />)}</div>
        ) : (
          <GamesTable
            games={list}
            limit={10}
            empty={filter === 'watching' ? 'You aren’t watching any games yet. Use the bookmark on any row.' : 'No upcoming home games yet.'}
          />
        )}
      </Panel>
    </Page>
  )
}
