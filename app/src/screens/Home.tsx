import { Link } from 'react-router-dom'
import { User } from 'lucide-react'
import { Screen } from '@/components/layout'
import { BellButton, SectionTitle, Skeleton, Sparkline } from '@/components/kit'
import { WatchRow } from '@/components/games'
import { dailyLows, gameWhen, money, todayLabel } from '@/lib/format'
import { useStore } from '@/lib/store'
import { matchup } from '@/lib/teams'
import type { Game } from '@/lib/types'
import { bestCall } from '@/lib/verdict'

export function Avatar({ size = 44 }: { size?: number }) {
  const { profile, email, signedIn, demo } = useStore()
  const name = profile.display_name || email || ''
  const initial = signedIn && !demo && name ? name[0].toUpperCase() : null
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className="flex flex-none items-center justify-center rounded-full bg-[linear-gradient(135deg,#8FD0F5_0%,#B9AEF5_100%)] font-bold text-glacier-ink"
    >
      {initial ?? <User size={size * 0.45} strokeWidth={2} aria-hidden="true" />}
    </span>
  )
}

function lowNote(game: Game): string {
  const values = game.history.map((p) => p.p)
  const price = game.price_now ?? 0
  if (game.verdict === 'wait' && game.range_low != null) return `Forecast low ${money(game.range_low)}`
  if (values.length && price <= Math.min(...values)) {
    const days = Math.round((Date.now() - new Date(game.history[0].t).getTime()) / 86400_000)
    return days >= 14 ? `Cheapest in ${Math.round(days / 7)} weeks` : 'Lowest price yet'
  }
  return 'Close to its low'
}

function BestCall({ game }: { game: Game }) {
  const recent = dailyLows(game.history, 21)
  return (
    <Link to={`/game/${game.game_id}`} className="glacier glacier-shadow block rounded-3xl px-[18px] pb-4 pt-[18px] text-glacier-ink hover:text-glacier-ink">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-[17px] font-bold">{matchup(game)}</p>
          <p className="m-0 mt-0.5 text-[13px] font-medium">{gameWhen(game.starts_at)}, {game.arena}</p>
        </div>
        <span className="font-display flex-none rounded-lg bg-white px-2.5 py-1 text-[17px] font-extrabold tracking-[0.03em] text-[#1F7FC0]">
          {game.verdict === 'buy' ? 'BUY NOW' : 'WAIT'}
        </span>
      </div>
      <div className="mt-3.5 flex items-end justify-between gap-3">
        <div>
          <div className="font-display tabular text-[56px] font-black leading-[0.9]">{money(game.price_now)}</div>
          <p className="m-0 mt-1.5 text-[13px] font-semibold">{lowNote(game)}</p>
        </div>
        <Sparkline values={recent} color="#0B2A45" width={140} height={54} stroke={3} />
      </div>
      {game.headline && <p className="m-0 mt-3 text-[13px] font-medium leading-[1.45]">{game.headline}</p>}
    </Link>
  )
}

export function HomeScreen() {
  const { games, ready, profile, watches, events, gamesError } = useStore()
  const mine = (games ?? []).filter((g) => profile.teams.includes(g.home_tricode))
  const best = bestCall(mine)
  const watched = (games ?? []).filter((g) => watches.has(g.game_id))
  const upcoming = mine.filter((g) => !watches.has(g.game_id) && g.game_id !== best?.game_id).slice(0, 4)

  return (
    <Screen className="gap-[22px]">
      <header className="flex items-center justify-between">
        <span className="font-display text-[26px] font-black tracking-[0.01em]">
          Tix<span className="text-glacier">cast</span>
        </span>
        <div className="flex gap-2">
          <BellButton unread={events.length > 0} />
          <Link to="/profile" aria-label="Your profile"><Avatar /></Link>
        </div>
      </header>

      <div>
        <p className="m-0 mb-1 text-[14px] text-sub">{todayLabel()}</p>
        <h1 className="font-display m-0 text-[40px] font-extrabold leading-none">Today's best call</h1>
      </div>

      {!ready ? (
        <Skeleton className="h-[220px] rounded-3xl" />
      ) : best ? (
        <BestCall game={best} />
      ) : (
        <div className="glass rounded-3xl p-5">
          <p className="m-0 text-[17px] font-bold">{mine.length ? 'No strong calls right now' : 'No upcoming games yet'}</p>
          <p className="m-0 mt-1.5 text-[14px] leading-[1.5] text-sub">
            {gamesError
              ? "Tixcast couldn't load games. Pull down or reopen the app to try again."
              : mine.length
                ? "Prices for your teams' games aren't moving much. Set an alert and we'll tell you when one does."
                : 'Prices show up here as soon as tickets are listed for resale.'}
          </p>
        </div>
      )}

      <section className="flex flex-col gap-2.5" aria-labelledby="watching-title">
        <SectionTitle action={<Link to="/explore" className="text-[14px] font-semibold">Add a game</Link>}>
          <span id="watching-title">{watched.length ? "Games you're watching" : `Upcoming ${profile.teams.length === 1 ? (profile.teams[0] === 'LAL' ? 'Lakers' : 'Clippers') : 'LA'} games`}</span>
        </SectionTitle>
        {!ready ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-[68px]" />)
        ) : watched.length ? (
          <>
            {watched.map((g) => <WatchRow key={g.game_id} game={g} />)}
            {upcoming.length > 0 && (
              <>
                <h2 className="m-0 mt-3 text-[17px] font-bold">More upcoming games</h2>
                {upcoming.slice(0, 3).map((g) => <WatchRow key={g.game_id} game={g} />)}
              </>
            )}
          </>
        ) : (
          <>
            <p className="m-0 -mt-1 text-[13px] text-sub">Open a game and tap the bookmark to keep it here.</p>
            {upcoming.map((g) => <WatchRow key={g.game_id} game={g} />)}
          </>
        )}
      </section>
    </Screen>
  )
}
