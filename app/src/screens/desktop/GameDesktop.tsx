import { useState } from 'react'
import { GameDay, NoCallYet } from '@/components/GameDay'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Bell, Bookmark, ChevronLeft, ExternalLink, Share } from 'lucide-react'
import { Page, Panel, Segmented, Stat } from '@/components/desktop'
import { Skeleton, TeamStack, VerdictPill } from '@/components/kit'
import { PriceChart, type ChartRange } from '@/components/PriceChart'
import { ago, gameWhen, hoursUntil, money, pct, priceChange } from '@/lib/format'
import { useGameActions } from '@/lib/gameActions'
import { useStore } from '@/lib/store'
import { matchup, teamName } from '@/lib/teams'
import { cn } from '@/lib/utils'
import { VERDICT_STYLE, hasCall } from '@/lib/verdict'
import { AlertSheet } from '../AlertSheet'
import { ReasonIcon, SOURCE, TicketCount } from '../Game'
import { HowItWorksSheet } from '../HowItWorks'

function OddsRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-sub">{label}</span>
        <span className="font-display tabular text-[26px] font-extrabold leading-none">{value}%</span>
      </div>
      <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#0E1626]">
        <div className="h-1.5 rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  )
}

function tipoffIn(iso: string): string {
  const h = hoursUntil(iso)
  if (h < 0) return 'Started'
  if (h < 24) return `${Math.round(h)} hr`
  return `${Math.round(h / 24)} days`
}

export function GameDesktop({ alertOpen = false }: { alertOpen?: boolean }) {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { gameById, ready, profile } = useStore()
  const [range, setRange] = useState<ChartRange>(30)
  const [howOpen, setHowOpen] = useState(false)
  const game = gameById(id)
  const actions = useGameActions(game)

  if (!ready) {
    return (
      <Page>
        <Skeleton className="h-16 w-[480px] bg-[#131D33]" />
        <Skeleton className="mt-6 h-[460px] rounded-[18px] bg-[#131D33]" />
      </Page>
    )
  }
  if (!game || !actions) {
    return (
      <Page className="max-w-[720px]">
        <h1 className="font-display m-0 text-[44px] font-extrabold leading-none">This game isn't on Tixcast</h1>
        <p className="m-0 mt-3 text-[16px] leading-[1.5] text-sub">It may have already been played, or the link is wrong.</p>
        <Link to="/explore" className="primary-fill mt-6 inline-flex h-11 items-center rounded-xl px-5 font-bold hover:text-[#0E1626]">Explore games</Link>
      </Page>
    )
  }

  const values = game.history.map((p) => p.p)
  const low = values.length ? Math.min(...values) : null
  const high = values.length ? Math.max(...values) : null
  const change7 = priceChange(game.history, 7)
  const accent = VERDICT_STYLE[game.verdict].line
  const hasPrice = game.price_now != null
  const buyCls = game.verdict === 'buy' ? 'buy-fill hover:text-[#1A0E0A]' : 'bg-ink text-[#0E1626] hover:text-[#0E1626]'

  return (
    <>
      <Page>
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/explore'))} className="-ml-2 flex h-9 items-center gap-1 rounded-full px-2 text-[14px] font-semibold text-sub hover:text-ink">
            <ChevronLeft size={18} aria-hidden="true" /> Back
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
          <div className="flex items-center gap-4">
            <TeamStack away={game.away_tricode} home={game.home_tricode} size={56} />
            <div>
              <h1 className="font-display m-0 text-[48px] font-extrabold leading-none">{matchup(game)}</h1>
              <p className="m-0 mt-1.5 text-[14px] text-sub">
                {gameWhen(game.starts_at)}, {game.arena}{game.national_tv ? `, on ${game.national_tv.split(',')[0]}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" aria-pressed={actions.watching} onClick={actions.onWatch} className={cn('flex h-11 items-center gap-2 rounded-xl border border-[#2A3858] px-4 text-[14px] font-semibold hover:bg-[#16213A]', actions.watching && 'text-link')}>
              <Bookmark size={17} strokeWidth={1.9} fill={actions.watching ? 'currentColor' : 'none'} aria-hidden="true" />
              {actions.watching ? 'Watching' : 'Watch'}
            </button>
            <button type="button" aria-label="Share this game" onClick={() => void actions.onShare()} className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#2A3858] hover:bg-[#16213A]">
              <Share size={17} strokeWidth={1.9} />
            </button>
            <button type="button" onClick={actions.onAlert} className="flex h-11 items-center gap-2 rounded-xl border border-[#2A3858] px-4 text-[14px] font-semibold hover:bg-[#16213A]">
              <Bell size={17} strokeWidth={1.9} aria-hidden="true" />
              {actions.alert ? 'Edit alert' : 'Alert me'}
            </button>
            {game.buy_url ? (
              <a href={game.buy_url} target="_blank" rel="noopener noreferrer" className={cn('flex h-11 items-center gap-2 rounded-xl px-5 text-[14px] font-bold', buyCls)}>
                {hasPrice ? `Buy for ${money(game.price_now)}` : 'See tickets'}
                {game.price_source && <span className="font-semibold opacity-75">on {SOURCE[game.price_source]}</span>}
                <ExternalLink size={14} strokeWidth={2.2} aria-hidden="true" />
              </a>
            ) : (
              <span className="flex h-11 items-center rounded-xl bg-[#16213A] px-4 text-[14px] font-semibold text-sub">Tickets not listed yet</span>
            )}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-12 gap-6">
          <div className="col-span-12 flex flex-col gap-6 xl:col-span-8">
            <Panel pad={false}>
              <div className="flex flex-wrap items-start justify-between gap-6 px-6 pt-6">
                <div>
                  <p className="m-0 text-[13px] text-sub">Cheapest ticket right now</p>
                  <div className="mt-1 flex items-baseline gap-3">
                    {hasPrice ? (
                      <span className="font-display tabular text-[72px] font-black leading-[0.85]">{money(game.price_now)}</span>
                    ) : (
                      <span className="text-[20px] font-semibold text-sub">No listings yet</span>
                    )}
                    {change7 != null && hasPrice && (
                      <span className={cn('tabular text-[14px] font-semibold', change7 > 0.005 ? 'text-[#FF8A6B]' : change7 < -0.005 ? 'text-[#9CC4FF]' : 'text-sub')}>{pct(change7)} this week</span>
                    )}
                  </div>
                  {hasPrice && profile.ticket_count > 1 && (
                    <p className="m-0 mt-2 text-[13px] text-sub">About {money(game.price_now! * profile.ticket_count)} for {profile.ticket_count}, before checkout fees</p>
                  )}
                </div>
                {game.range_low != null && (
                  <div className="text-right">
                    <p className="m-0 text-[13px] text-sub">{game.range_label}</p>
                    <p className="font-display tabular m-0 mt-1 text-[34px] font-extrabold leading-none" style={{ color: accent }}>
                      {money(game.range_low)}{game.range_high != null && `–${money(game.range_high)}`}
                    </p>
                  </div>
                )}
              </div>
              <div className="px-6 pb-6">
                <PriceChart game={game} range={range} height={260} className="mt-6" />
                {game.history.length > 1 && (
                  <div className="mt-4 flex justify-end">
                    <Segmented label="Chart range" value={String(range) as '7' | '30' | '0'} onChange={(v) => setRange(Number(v) as ChartRange)} options={[{ id: '7', label: '7 days' }, { id: '30', label: '30 days' }, { id: '0', label: 'All' }]} />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-4 gap-6 border-t border-[#1B2743] px-6 py-5">
                <Stat label="Listings" value={game.listing_count != null ? game.listing_count.toLocaleString() : '—'} />
                <Stat label="Lowest seen" value={money(low)} sub={values.length ? 'Last 30 days' : undefined} />
                <Stat label="Highest seen" value={money(high)} sub={values.length ? 'Last 30 days' : undefined} />
                <Stat label="Tip-off in" value={tipoffIn(game.starts_at)} />
              </div>
            </Panel>

            {game.reasons.length > 0 && (
              <Panel title="Why Tixcast says this" pad={false}>
                <ul className="m-0 grid list-none grid-cols-1 p-0 lg:grid-cols-2">
                  {game.reasons.map((r) => (
                    <li key={r.title} className="flex items-start gap-3 border-b border-[#1B2743] px-5 py-4 lg:[&:nth-last-child(-n+2)]:border-b-0 lg:odd:border-r">
                      <ReasonIcon reason={r} />
                      <div>
                        <p className="m-0 text-[15px] font-semibold">{r.title}</p>
                        {r.detail && <p className="m-0 mt-0.5 text-[13px] leading-[1.5] text-sub">{r.detail}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>

          <div className="col-span-12 flex flex-col gap-6 xl:col-span-4">
            <Panel title="The call">
              {hasPrice ? <VerdictPill verdict={game.verdict} size="lg" /> : <span className="font-display rounded-lg bg-[#1E2B48] px-3 py-1 text-[18px] font-extrabold tracking-[0.03em] text-sub">TRACKING</span>}
              <p className="m-0 mt-3 text-[20px] font-bold leading-[1.3]">{game.headline ?? 'No resale prices yet'}</p>
              {!hasCall(game) && <div className="mt-4"><NoCallYet compact watching={actions.watching} onWatch={actions.onWatch} /></div>}
              {game.odds_pct != null && (
                <div className="mt-6 flex flex-col gap-5">
                  <OddsRow label={game.odds_label ?? ''} value={game.odds_pct} color={accent} />
                  {game.risk_pct != null && <OddsRow label={game.risk_label ?? ''} value={game.risk_pct} color="#3A4A6E" />}
                </div>
              )}
              <div className="mt-6 flex items-center justify-between gap-3 border-t border-[#1B2743] pt-4">
                <span className="text-[13px] text-sub">Prices shown for</span>
                <TicketCount />
              </div>
              <p className="m-0 mt-4 text-[12px] leading-[1.55] text-faint">
                Beta call from simple rules while the forecast model trains. Updated {ago(game.updated_at)}
                {game.price_source ? ` from ${SOURCE[game.price_source]} listings` : ''}. Odds are estimates, not a guarantee.{' '}
                <button type="button" onClick={() => setHowOpen(true)} className="font-semibold text-link">How forecasts work</button>
              </p>
            </Panel>

            {(game.home_record != null || game.national_tv) && (
              <Panel title="Game day"><GameDay game={game} /></Panel>
            )}

            <Panel title="Injury report" pad={false}>
              {game.injuries.length ? (
                <ul className="m-0 list-none p-0">
                  {game.injuries.map((i) => (
                    <li key={i.team + i.player} className="flex items-center justify-between gap-3 border-b border-[#1B2743] px-5 py-3 last:border-b-0">
                      <div className="min-w-0">
                        <p className="m-0 truncate text-[14px] font-semibold">{i.player}</p>
                        <p className="m-0 text-[12px] text-sub">{teamName(i.team)}</p>
                      </div>
                      <span className={cn('flex-none rounded-md px-2 py-0.5 text-[12px] font-bold', (i.status ?? '').toLowerCase() === 'out' ? 'bg-[#3A2226] text-danger' : 'bg-[#3A3022] text-[#E3B87C]')}>{i.status ?? 'Listed'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 px-5 py-4 text-[13px] text-sub">No one from either team is on the injury report.</p>
              )}
            </Panel>
          </div>
        </div>
      </Page>

      <AlertSheet game={game} open={alertOpen} onClose={() => navigate(`/game/${game.game_id}`, { replace: true })} />
      <HowItWorksSheet open={howOpen} onOpenChange={setHowOpen} />
    </>
  )
}
