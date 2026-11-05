import { Link, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Page, Panel } from '@/components/desktop'
import { Switch, TeamStack } from '@/components/kit'
import { ago, gameWhen, money } from '@/lib/format'
import { useStore } from '@/lib/store'
import { matchup } from '@/lib/teams'
import type { Alert, AlertEvent, Game } from '@/lib/types'
import { cn } from '@/lib/utils'
import { EVENT_LABEL, VERDICT_LABEL, VERDICT_STYLE, chanceToHit } from '@/lib/verdict'

function ReadyStub({ event, game }: { event: AlertEvent; game: Game }) {
  const { dismissEvent } = useStore()
  const navigate = useNavigate()
  return (
    <article className="relative flex flex-col overflow-hidden rounded-[18px] bg-[#FF6B47] p-5 text-[#1A0E0A]">
      <div className="flex items-center justify-between text-[12px] font-bold">
        <span>{EVENT_LABEL[event.kind]}</span>
        <span className="font-semibold">{ago(event.created_at)}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 truncate text-[17px] font-bold">{matchup(game)}</p>
          <p className="m-0 text-[13px] font-medium">{gameWhen(game.starts_at)}</p>
        </div>
        <span className="font-display tabular text-[44px] font-black leading-[0.85]">{money(game.price_now ?? event.price)}</span>
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={() => navigate(`/game/${game.game_id}`)} className="h-10 flex-1 rounded-xl bg-[#1A0E0A] text-[14px] font-bold text-[#FF8A6B]">View game</button>
        <button type="button" onClick={() => void dismissEvent(event.id)} className="h-10 flex-1 rounded-xl border-[1.5px] border-[#1A0E0A] text-[14px] font-bold">Dismiss</button>
      </div>
    </article>
  )
}

function AlertRow({ alert, game }: { alert: Alert; game: Game }) {
  const { setAlertActive } = useStore()
  const navigate = useNavigate()
  const price = game.price_now
  const target = alert.target_price
  const progress = target != null && price != null ? Math.min(100, Math.round((target / price) * 100)) : null
  const chance = target != null && price != null ? chanceToHit(game, target) : null
  return (
    <tr onClick={() => navigate(`/game/${game.game_id}`)} className={cn('cursor-pointer border-b border-[#1B2743] last:border-b-0 hover:bg-[#16213A]', !alert.active && 'opacity-55')}>
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <TeamStack away={game.away_tricode} home={game.home_tricode} size={34} />
          <div className="min-w-0">
            <Link to={`/game/${game.game_id}`} onClick={(e) => e.stopPropagation()} className="block truncate text-[15px] font-semibold text-ink hover:text-ink hover:underline">{matchup(game)}</Link>
            <div className="text-[12px] text-sub">{gameWhen(game.starts_at)}</div>
          </div>
        </div>
      </td>
      <td className="tabular whitespace-nowrap px-5 py-3.5 text-[15px] font-semibold">{target != null ? money(target) : <span className="text-[13px] font-normal text-sub">Buy now only</span>}</td>
      <td className="tabular whitespace-nowrap px-5 py-3.5 text-[15px] font-semibold">{money(price)}</td>
      <td className="w-[180px] px-5 py-3.5">
        {progress != null ? (
          <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-[#0E1626]">
            <div className="h-1.5 rounded-full" style={{ width: `${progress}%`, background: VERDICT_STYLE[game.verdict].line }} />
          </div>
        ) : <span className="text-[13px] text-sub">Tixcast says {VERDICT_LABEL[game.verdict]}</span>}
      </td>
      <td className="whitespace-nowrap px-5 py-3.5 text-[13px] font-semibold">
        {!alert.active ? <span className="text-faint">Paused</span> : chance == null ? <span className="text-sub">—</span> : price! <= target! ? <span className="text-[#FF8A6B]">At your price</span> : <span className={chance >= 50 ? 'text-[#9CC4FF]' : 'text-[#E3B87C]'}>{chance}%</span>}
      </td>
      <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-4">
          <Link to={`/game/${game.game_id}/alert`} className="text-[13px] font-semibold">Edit</Link>
          <Switch on={alert.active} onChange={(v) => void setAlertActive(alert.id, v)} label={`${alert.active ? 'Pause' : 'Turn on'} alert for ${matchup(game)}`} />
        </div>
      </td>
    </tr>
  )
}

export function AlertsDesktop() {
  const { alerts, events, gameById, signedIn, openSignIn } = useStore()
  const live = alerts.map((a) => ({ a, g: gameById(a.game_id) })).filter((x): x is { a: Alert; g: Game } => !!x.g)
  const ready = events.map((e) => ({ e, g: gameById(e.game_id) })).filter((x): x is { e: AlertEvent; g: Game } => !!x.g).slice(0, 3)
  const on = live.filter((x) => x.a.active).length

  return (
    <Page>
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="font-display m-0 text-[48px] font-extrabold leading-none">Alerts</h1>
          <p className="m-0 mt-2 text-[14px] text-sub">
            {signedIn ? `${on} alert${on === 1 ? '' : 's'} on${ready.length ? `, ${ready.length} ready to look at` : ''}.` : 'Get told when a game hits your price, or when Tixcast says Buy now.'}
          </p>
        </div>
        {signedIn && (
          <Link to="/explore" className="flex h-10 items-center gap-1.5 rounded-xl border border-[#2A3858] px-4 text-[14px] font-semibold text-ink hover:bg-[#16213A] hover:text-ink">
            <Plus size={16} strokeWidth={2.2} aria-hidden="true" />New alert
          </Link>
        )}
      </div>

      {!signedIn ? (
        <Panel className="mt-8 max-w-[560px]">
          <p className="m-0 text-[17px] font-bold">Sign in to set price alerts</p>
          <p className="m-0 mt-1.5 text-[14px] leading-[1.55] text-sub">Alerts are saved to your account, so they reach your phone and your email even when Tixcast is closed.</p>
          <button type="button" onClick={() => openSignIn('Sign in to set price alerts on any LA home game.')} className="primary-fill mt-5 h-11 rounded-xl px-5 text-[14px] font-bold">Sign in</button>
        </Panel>
      ) : (
        <>
          {ready.length > 0 && (
            <section aria-label="Ready" className="mt-8 grid grid-cols-3 gap-5">
              {ready.map(({ e, g }) => <ReadyStub key={e.id} event={e} game={g} />)}
            </section>
          )}
          <Panel className="mt-8" pad={false} title={<span className="text-[16px] font-bold text-ink">Watching for a price</span>}>
            {live.length ? (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-[#1B2743] text-[12px] text-sub">
                    <th scope="col" className="px-5 py-3 font-semibold">Game</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Target</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Now</th>
                    <th scope="col" className="px-5 py-3 font-semibold">How close</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Chance before tip-off</th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">On</th>
                  </tr>
                </thead>
                <tbody>{live.map(({ a, g }) => <AlertRow key={a.id} alert={a} game={g} />)}</tbody>
              </table>
            ) : (
              <div className="px-5 py-10">
                <p className="m-0 text-[15px] font-semibold">No alerts yet</p>
                <p className="m-0 mt-1 text-[14px] text-sub">Open any game and choose Alert me. <Link to="/explore" className="font-semibold">Find a game</Link></p>
              </div>
            )}
          </Panel>
        </>
      )}
    </Page>
  )
}
