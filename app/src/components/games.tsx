import { Link } from 'react-router-dom'
import { dailyLows, dateParts, gameWhen, money } from '@/lib/format'
import { matchup } from '@/lib/teams'
import type { Game } from '@/lib/types'
import { VERDICT_STYLE } from '@/lib/verdict'
import { Sparkline, VerdictPill } from './kit'

/** Row used on Home: team codes, matchup, sparkline, price and call. */
export function WatchRow({ game }: { game: Game }) {
  const recent = dailyLows(game.history, 14)
  return (
    <Link to={`/game/${game.game_id}`} className="glass flex min-h-11 items-center gap-3 rounded-2xl px-3.5 py-3 text-ink hover:text-ink">
      <div className="flex w-10 flex-none flex-col gap-1" aria-hidden="true">
        <span className="rounded-md bg-[#1E2B48] py-[3px] text-center text-[11px] font-bold tracking-[0.04em] text-[#C9D2E3]">{game.away_tricode}</span>
        <span className="rounded-md bg-[#2A3858] py-[3px] text-center text-[11px] font-bold tracking-[0.04em]">{game.home_tricode}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[15px] font-semibold">{matchup(game)}</p>
        <p className="m-0 mt-0.5 text-[12px] text-sub">{gameWhen(game.starts_at)}</p>
      </div>
      <Sparkline values={recent} color={VERDICT_STYLE[game.verdict].line} />
      <PriceBlock game={game} />
    </Link>
  )
}

/** Row used on Explore: date tile first, since people browse by date. */
export function GameRow({ game }: { game: Game }) {
  const d = dateParts(game.starts_at)
  return (
    <Link to={`/game/${game.game_id}`} className="glass flex items-center gap-3 rounded-2xl px-3.5 py-3 text-ink hover:text-ink">
      <div className="w-12 flex-none rounded-[10px] bg-inset py-1.5 text-center">
        <div className="text-[11px] font-bold text-sub">{d.month}</div>
        <div className="font-display text-[22px] font-extrabold leading-none">{d.day}</div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[15px] font-semibold">{matchup(game)}</p>
        <p className="m-0 mt-0.5 truncate text-[12px] text-sub">
          {d.weekday}, {gameWhen(game.starts_at).split(', ').pop()}, {game.arena}
        </p>
      </div>
      <PriceBlock game={game} from />
    </Link>
  )
}

function PriceBlock({ game, from }: { game: Game; from?: boolean }) {
  return (
    <div className="w-[68px] flex-none text-right">
      {from && game.price_now != null && <div className="text-[11px] text-sub">from</div>}
      <div className="font-display tabular text-[22px] font-extrabold leading-none">
        {game.price_now != null ? money(game.price_now) : <span className="text-[15px] text-faint">No price</span>}
      </div>
      {game.price_now != null && <VerdictPill verdict={game.verdict} className="mt-1" />}
    </div>
  )
}
