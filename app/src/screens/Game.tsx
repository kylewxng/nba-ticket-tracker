import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Bell, Bookmark, CalendarDays, ChevronDown, ExternalLink, HeartPulse, Share, TrendingDown, TrendingUp, Users } from 'lucide-react'
import { toast } from 'sonner'
import { BackButton, IconButton, Skeleton, VerdictPill } from '@/components/kit'
import { PriceChart, type ChartRange } from '@/components/PriceChart'
import { ago, gameWhen, money } from '@/lib/format'
import { useStore } from '@/lib/store'
import { matchup, teamName } from '@/lib/teams'
import type { Game, Reason } from '@/lib/types'
import { cn } from '@/lib/utils'
import { VERDICT_STYLE } from '@/lib/verdict'
import { TeamStack } from '@/components/kit'
import { AlertSheet } from './AlertSheet'
import { HowItWorksSheet } from './HowItWorks'

const SOURCE = { seatgeek: 'SeatGeek', ticketmaster: 'Ticketmaster' } as const

function ReasonIcon({ reason }: { reason: Reason }) {
  const color = VERDICT_STYLE[reason.tone].line
  const Icon =
    reason.kind === 'listings' ? (reason.tone === 'buy' ? TrendingDown : Users)
      : reason.kind === 'calendar' ? CalendarDays
        : reason.kind === 'injury' ? HeartPulse
          : reason.tone === 'buy' ? TrendingUp : TrendingDown
  return (
    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-inset" style={{ color }}>
      <Icon size={16} strokeWidth={2.2} aria-hidden="true" />
    </span>
  )
}

function TicketCount() {
  const { profile, updateProfile } = useStore()
  return (
    <label className="glass relative flex h-10 items-center gap-1.5 rounded-full pl-3.5 pr-3 text-[14px] font-semibold">
      <span className="sr-only-safe">How many tickets</span>
      {profile.ticket_count} ticket{profile.ticket_count === 1 ? '' : 's'}
      <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
      <select
        value={profile.ticket_count}
        onChange={(e) => void updateProfile({ ticket_count: Number(e.target.value) })}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} ticket{n === 1 ? '' : 's'}</option>)}
      </select>
    </label>
  )
}

function Verdict({ game }: { game: Game }) {
  const [range, setRange] = useState<ChartRange>(30)
  const { profile } = useStore()
  const total = game.price_now != null ? game.price_now * profile.ticket_count : null
  const accent = VERDICT_STYLE[game.verdict].line
  return (
    <section aria-label="Tixcast call" className="glass rounded-[22px] p-5">
      {game.price_now != null ? <VerdictPill verdict={game.verdict} size="lg" /> : null}
      <h2 className={cn('m-0 text-[22px] font-bold leading-[1.25]', game.price_now != null && 'mt-3')}>{game.headline ?? 'No resale prices yet'}</h2>
      <div className="mt-[18px] flex items-end justify-between gap-3">
        <div>
          <p className="m-0 text-[12px] text-sub">Cheapest ticket right now</p>
          <div className="font-display tabular mt-1 text-[64px] font-black leading-[0.9]">{money(game.price_now)}</div>
          {total != null && profile.ticket_count > 1 && (
            <p className="m-0 mt-1.5 text-[12px] text-sub">About {money(total)} for {profile.ticket_count}, before checkout fees</p>
          )}
        </div>
        {game.range_low != null && (
          <div className="flex-none text-right">
            <p className="m-0 whitespace-nowrap text-[12px] text-sub">{game.range_label}</p>
            <p className="font-display tabular m-0 mt-1 text-[26px] font-extrabold" style={{ color: accent }}>
              {money(game.range_low)}{game.range_high != null && `–${money(game.range_high)}`}
            </p>
          </div>
        )}
      </div>
      <PriceChart game={game} range={range} />
      {game.history.length > 1 && (
        <div role="group" aria-label="Chart range" className="mt-3 grid grid-cols-3 gap-1.5 rounded-xl bg-inset p-1">
          {([[7, '7 days'], [30, '30 days'], [0, 'All']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={range === v}
              onClick={() => setRange(v)}
              className={cn('h-9 rounded-[9px] text-[13px] font-semibold', range === v ? 'bg-white text-ink shadow-[0_2px_6px_rgba(28,58,112,0.12)]' : 'text-sub')}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

export function GameScreen({ alertOpen = false }: { alertOpen?: boolean }) {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { gameById, ready, watches, toggleWatch, signedIn, openSignIn, alertFor } = useStore()
  const [howOpen, setHowOpen] = useState(false)
  const game = gameById(id)

  if (!ready) {
    return (
      <main className="mx-auto flex w-full max-w-[440px] flex-col gap-5 px-5 pt-6">
        <Skeleton className="h-11 w-11 rounded-full" />
        <Skeleton className="h-14" />
        <Skeleton className="h-[420px] rounded-[22px]" />
      </main>
    )
  }
  if (!game) {
    return (
      <main className="mx-auto flex w-full max-w-[440px] flex-col gap-4 px-5 pt-6">
        <BackButton />
        <h1 className="font-display m-0 text-[34px] font-extrabold leading-none">This game isn't on Tixcast</h1>
        <p className="m-0 text-[15px] leading-[1.5] text-sub">It may have already been played, or the link is wrong. Find another game in Explore.</p>
        <Link to="/explore" className="glacier glacier-shadow flex h-[52px] items-center justify-center rounded-2xl font-bold text-glacier-ink">Explore games</Link>
      </main>
    )
  }

  const watching = watches.has(game.game_id)
  const alert = alertFor(game.game_id)
  const title = matchup(game)

  const onWatch = () => {
    if (!signedIn) return openSignIn('Sign in to keep this game on Home and hear when its price moves.', { type: 'watch', gameId: game.game_id })
    void toggleWatch(game.game_id)
  }
  const onAlert = () => {
    if (!signedIn) return openSignIn("Sign in so we can tell you when this game hits your price.", { type: 'alert', gameId: game.game_id })
    navigate(`/game/${game.game_id}/alert`)
  }
  const onShare = async () => {
    const url = window.location.href.replace(/\/alert$/, '')
    const text = game.price_now != null ? `${title}: ${money(game.price_now)} right now. Tixcast says ${game.verdict === 'buy' ? 'buy now' : game.verdict}.` : title
    try {
      if (navigator.share) await navigator.share({ title, text, url })
      else {
        await navigator.clipboard.writeText(url)
        toast('Link copied')
      }
    } catch {
      /* share sheet closed */
    }
  }
  const buyLabel = game.price_now != null ? `Buy for ${money(game.price_now)}` : 'See tickets'
  const ctaClass = game.verdict === 'buy' ? 'glacier glacier-shadow text-glacier-ink' : 'bg-ink text-white'

  return (
    <>
      <main className="mx-auto flex w-full max-w-[440px] flex-col gap-5 px-5 pb-[130px] pt-[max(24px,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <BackButton />
          <div className="flex gap-2">
            <IconButton label={watching ? 'Stop watching this game' : 'Watch this game'} onClick={onWatch} className={watching ? 'text-link' : ''}>
              <Bookmark size={20} strokeWidth={1.8} fill={watching ? 'currentColor' : 'none'} />
            </IconButton>
            <IconButton label="Share this game" onClick={() => void onShare()}>
              <Share size={20} strokeWidth={1.8} />
            </IconButton>
          </div>
        </div>

        <div className="flex items-center gap-3.5">
          <TeamStack away={game.away_tricode} home={game.home_tricode} />
          <div className="min-w-0">
            <h1 className="font-display m-0 text-[32px] font-extrabold leading-none">{title}</h1>
            <p className="m-0 mt-1 text-[13px] text-sub">{gameWhen(game.starts_at)}, {game.arena}{game.national_tv ? `, ${game.national_tv.split(',')[0]}` : ''}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <TicketCount />
          {game.listing_count != null && (
            <span className="glass flex h-10 items-center rounded-full px-3.5 text-[14px] font-semibold text-sub">{game.listing_count.toLocaleString()} listings</span>
          )}
        </div>

        <Verdict game={game} />

        {game.odds_pct != null && (
          <div className="grid grid-cols-2 gap-2.5">
            {[[game.odds_label, game.odds_pct], [game.risk_label, game.risk_pct]].map(([label, pct]) => (
              <div key={String(label)} className="glass rounded-2xl p-3.5">
                <p className="m-0 text-[12px] leading-[1.35] text-sub">{label}</p>
                <p className="font-display tabular m-0 mt-1.5 text-[34px] font-extrabold leading-none">{pct}%</p>
              </div>
            ))}
          </div>
        )}

        {game.reasons.length > 0 && (
          <section aria-labelledby="why-title">
            <h2 id="why-title" className="m-0 mb-1.5 text-[17px] font-bold">Why Tixcast says this</h2>
            {game.reasons.map((r) => (
              <div key={r.title} className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
                <ReasonIcon reason={r} />
                <div>
                  <p className="m-0 text-[15px] font-semibold">{r.title}</p>
                  {r.detail && <p className="m-0 mt-0.5 text-[13px] leading-[1.45] text-sub">{r.detail}</p>}
                </div>
              </div>
            ))}
          </section>
        )}

        {game.injuries.length > 0 && (
          <section aria-labelledby="inj-title">
            <h2 id="inj-title" className="m-0 mb-2 text-[17px] font-bold">Injury report</h2>
            <div className="glass overflow-hidden rounded-2xl">
              {game.injuries.map((i) => (
                <div key={i.team + i.player} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
                  <div className="min-w-0">
                    <p className="m-0 truncate text-[15px]">{i.player}</p>
                    <p className="m-0 text-[12px] text-sub">{teamName(i.team)}</p>
                  </div>
                  <span className={cn('flex-none rounded-md px-2 py-0.5 text-[12px] font-bold', (i.status ?? '').toLowerCase() === 'out' ? 'bg-[#FDE8E9] text-danger' : 'bg-[#FFF1D6] text-[#9A6100]')}>
                    {i.status ?? 'Listed'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="m-0 text-[12px] leading-[1.5] text-faint">
          Beta call from simple rules while the forecast model trains. Updated {ago(game.updated_at)}
          {game.price_source ? ` from ${SOURCE[game.price_source]} listings` : ''}. Odds are estimates from how similar games have moved, not a guarantee.{' '}
          <button type="button" onClick={() => setHowOpen(true)} className="font-semibold text-link">How forecasts work</button>
        </p>
      </main>

      <div className="glass fixed inset-x-0 bottom-0 z-20 mx-auto grid w-full max-w-[440px] grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-2.5 rounded-t-3xl px-5 pt-3 safe-bottom">
        <button type="button" onClick={onAlert} className="flex h-[52px] items-center justify-center gap-1.5 rounded-2xl border border-[#DCE5F2] bg-white text-[15px] font-bold">
          <Bell size={18} strokeWidth={2} aria-hidden="true" />
          {alert ? 'Edit alert' : 'Alert me'}
        </button>
        {game.buy_url ? (
          <a href={game.buy_url} target="_blank" rel="noopener noreferrer" className={cn('flex h-[52px] flex-col items-center justify-center rounded-2xl text-[15px] font-bold leading-[1.15] hover:text-inherit', ctaClass)}>
            <span className="flex items-center gap-1">{buyLabel}<ExternalLink size={13} strokeWidth={2.2} aria-hidden="true" /></span>
            {game.price_source && <span className="text-[11px] font-semibold opacity-80">on {SOURCE[game.price_source]}</span>}
          </a>
        ) : (
          <span className="flex h-[52px] items-center justify-center rounded-2xl bg-inset text-[14px] font-semibold text-sub">Tickets not listed yet</span>
        )}
      </div>

      <AlertSheet game={game} open={alertOpen} onClose={() => navigate(`/game/${game.game_id}`, { replace: true })} />
      <HowItWorksSheet open={howOpen} onOpenChange={setHowOpen} />
    </>
  )
}
