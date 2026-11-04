import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PriceChart, type ChartRange } from '@/components/PriceChart'
import { Segmented } from '@/components/desktop'
import { gameWhen, money } from '@/lib/format'
import { matchup } from '@/lib/teams'
import type { Game } from '@/lib/types'
import { cn } from '@/lib/utils'

const STUB = {
  buy: { cls: 'bg-[#FF6B47] text-[#1A0E0A]', badge: 'bg-[#1A0E0A] text-[#FF8A6B]', label: 'BUY NOW', seam: 'border-[rgba(26,14,10,0.3)]', btn: 'bg-[#1A0E0A] text-[#FF8A6B] hover:text-[#FFB39E]' },
  wait: { cls: 'bg-[#7FB2FF] text-[#0E1626]', badge: 'bg-[#0E1626] text-[#9CC4FF]', label: 'WAIT', seam: 'border-[rgba(14,22,38,0.3)]', btn: 'bg-[#0E1626] text-[#9CC4FF] hover:text-[#C3DBFF]' },
  watch: { cls: 'bg-[#E3B87C] text-[#14203A]', badge: 'bg-[#14203A] text-[#E3B87C]', label: 'WATCH', seam: 'border-[rgba(20,32,58,0.3)]', btn: 'bg-[#14203A] text-[#E3B87C] hover:text-[#F0CD98]' },
}

function Notches() {
  // Half-circles cut from the seam, like a ticket stub.
  return (
    <>
      <span aria-hidden="true" className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-page" />
      <span aria-hidden="true" className="absolute -bottom-3 -right-3 h-6 w-6 rounded-full bg-page" />
    </>
  )
}

/** Today's best call on desktop: a ticket stub with the call, joined to the price chart. */
export function TicketStub({ game, note }: { game: Game; note: string }) {
  const [range, setRange] = useState<ChartRange>(30)
  const s = STUB[game.verdict]
  return (
    <article aria-label={`Best call: ${matchup(game)}`} className="grid overflow-hidden rounded-[22px] border border-[#1B2743] bg-[#131D33] lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className={cn('relative flex flex-col border-r-2 border-dashed p-7', s.cls, s.seam)}>
        <Notches />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="m-0 text-[18px] font-bold leading-tight">{matchup(game)}</p>
            <p className="m-0 mt-1 text-[13px] font-medium">{gameWhen(game.starts_at)}</p>
            <p className="m-0 text-[13px] font-medium opacity-80">{game.arena}</p>
          </div>
          <span className={cn('font-display rounded-lg px-2.5 py-1 text-[17px] font-extrabold tracking-[0.03em]', s.badge)}>{s.label}</span>
        </div>
        <div className="font-display tabular mt-8 text-[84px] font-black leading-[0.85]">{money(game.price_now)}</div>
        <p className="m-0 mt-2 text-[14px] font-semibold">{note}</p>
        {game.headline && <p className="m-0 mt-5 text-[14px] font-medium leading-[1.5]">{game.headline}</p>}
        <Link to={`/game/${game.game_id}`} className={cn('mt-auto inline-flex h-11 w-fit items-center rounded-xl px-5 pt-0 text-[14px] font-bold', s.btn)} style={{ marginTop: 28 }}>
          See the full call
        </Link>
      </div>
      <div className="flex min-w-0 flex-col p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="m-0 text-[14px] font-semibold text-sub">Price so far, and the forecast to tip-off</h2>
          <Segmented label="Chart range" value={String(range) as '7' | '30' | '0'} onChange={(v) => setRange(Number(v) as ChartRange)} options={[{ id: '7', label: '7 days' }, { id: '30', label: '30 days' }, { id: '0', label: 'All' }]} />
        </div>
        <PriceChart game={game} range={range} height={230} className="mt-5" />
        <dl className="m-0 mt-5 grid grid-cols-3 gap-6 border-t border-[#1B2743] pt-5">
          {[
            [game.range_label ?? 'Forecast', game.range_low != null ? `${money(game.range_low)}–${money(game.range_high)}` : '—'],
            [game.odds_label ?? 'Odds', game.odds_pct != null ? `${game.odds_pct}%` : '—'],
            [game.risk_label ?? 'Risk', game.risk_pct != null ? `${game.risk_pct}%` : '—'],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="min-h-[32px] text-[12px] leading-[1.35] text-sub">{k}</dt>
              <dd className="font-display tabular m-0 mt-1 text-[26px] font-extrabold leading-none">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </article>
  )
}

/** When nothing has a call yet: the next game as a stub, plus what each call means. */
export function TrackingStub({ game, tracked }: { game: Game | null; tracked: number }) {
  return (
    <article className="grid overflow-hidden rounded-[22px] border border-[#1B2743] bg-[#131D33] lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="relative flex flex-col border-r-2 border-dashed border-[#2A3858] bg-[#1E2B48] p-7">
        <Notches />
        <span className="font-display w-fit rounded-lg bg-[#0E1626] px-2.5 py-1 text-[17px] font-extrabold tracking-[0.03em] text-sub">TRACKING</span>
        {game ? (
          <>
            <p className="m-0 mt-6 text-[13px] font-semibold text-sub">Next home game</p>
            <p className="m-0 mt-1 text-[22px] font-bold leading-tight">{matchup(game)}</p>
            <p className="m-0 mt-1 text-[13px] text-sub">{gameWhen(game.starts_at)}, {game.arena}</p>
            <Link to={`/game/${game.game_id}`} className="mt-auto inline-flex h-11 w-fit items-center rounded-xl bg-[#0E1626] px-5 text-[14px] font-bold text-link" style={{ marginTop: 28 }}>Open game</Link>
          </>
        ) : (
          <p className="m-0 mt-6 text-[15px] text-sub">The schedule hasn't loaded yet.</p>
        )}
      </div>
      <div className="p-7">
        <h2 className="m-0 text-[22px] font-bold">Calls start once resale listings come in</h2>
        <p className="m-0 mt-2 max-w-[60ch] text-[14px] leading-[1.55] text-sub">
          Tixcast is tracking {tracked} upcoming Lakers and Clippers home games. Each one gets a call after a few days of price history. Watch a game now and we'll tell you when its call is ready.
        </p>
        <dl className="m-0 mt-6 grid grid-cols-3 gap-5">
          {[
            ['Buy now', 'bg-[#FF6B47] text-[#1A0E0A]', 'Near its low, and the signs point up.'],
            ['Wait', 'bg-[#233A63] text-[#A8CBFF]', 'More seats coming or soft demand. Likely to drop.'],
            ['Watch', 'bg-[#3A3022] text-[#E3B87C]', 'No clear direction yet.'],
          ].map(([k, cls, d]) => (
            <div key={k}>
              <dt><span className={cn('rounded-md px-[7px] py-[2px] text-[11px] font-bold', cls)}>{k}</span></dt>
              <dd className="m-0 mt-2 text-[13px] leading-[1.5] text-sub">{d}</dd>
            </div>
          ))}
        </dl>
      </div>
    </article>
  )
}
