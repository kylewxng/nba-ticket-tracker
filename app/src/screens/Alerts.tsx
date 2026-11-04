import { Link, useNavigate } from 'react-router-dom'
import { Bell, Plus } from 'lucide-react'
import { PageTitle, Screen } from '@/components/layout'
import { PrimaryButton, Switch } from '@/components/kit'
import { ago, gameWhen, money } from '@/lib/format'
import { useStore } from '@/lib/store'
import { matchup } from '@/lib/teams'
import type { Alert, AlertEvent, Game } from '@/lib/types'
import { VERDICT_LABEL, VERDICT_STYLE, chanceToHit } from '@/lib/verdict'

function ReadyCard({ event, game }: { event: AlertEvent; game: Game }) {
  const { dismissEvent } = useStore()
  const navigate = useNavigate()
  return (
    <section aria-label={`Alert: ${matchup(game)}`} className="glacier glacier-shadow rounded-[22px] px-[18px] py-4">
      <div className="flex items-center gap-2">
        <Bell size={18} strokeWidth={2.2} aria-hidden="true" />
        <h2 className="m-0 text-[14px] font-bold">{event.kind === 'buy_signal' ? 'Tixcast says Buy now' : 'Your price hit'}</h2>
        <span className="ml-auto text-[12px] font-semibold">{ago(event.created_at)}</span>
      </div>
      <div className="mt-2.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 truncate text-[17px] font-bold">{matchup(game)}</p>
          <p className="m-0 mt-0.5 text-[13px] font-medium">{gameWhen(game.starts_at)}</p>
        </div>
        <div className="font-display tabular text-[40px] font-black leading-[0.9]">{money(game.price_now ?? event.price)}</div>
      </div>
      {game.headline && <p className="m-0 mt-2.5 text-[13px] font-medium leading-[1.45]">{game.headline}</p>}
      <div className="mt-3.5 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => navigate(`/game/${game.game_id}`)} className="h-11 rounded-xl bg-white text-[14px] font-bold text-[#1F7FC0]">View game</button>
        <button type="button" onClick={() => void dismissEvent(event.id)} className="h-11 rounded-xl border-[1.5px] border-[rgba(11,42,69,0.35)] text-[14px] font-bold">Dismiss</button>
      </div>
    </section>
  )
}

function AlertCard({ alert, game }: { alert: Alert; game: Game }) {
  const { setAlertActive } = useStore()
  const price = game.price_now
  const target = alert.target_price
  const progress = target != null && price != null ? Math.min(100, Math.round((target / price) * 100)) : 0
  const chance = target != null && price != null ? chanceToHit(game, target) : null
  const style = VERDICT_STYLE[game.verdict]
  const note = !alert.active
    ? 'Paused'
    : chance != null
      ? price! <= target! ? 'At your price now' : `${chance}% chance before tip-off`
      : `Tixcast says ${VERDICT_LABEL[game.verdict]} for now`
  const noteColor = !alert.active ? 'text-faint' : chance == null ? 'text-sub' : chance >= 50 ? 'text-link' : 'text-[#9A6100]'
  return (
    <div className={`glass rounded-2xl p-3.5 transition-opacity ${alert.active ? '' : 'opacity-60'}`}>
      <div className="flex items-start gap-3">
        <Link to={`/game/${game.game_id}`} className="min-w-0 flex-1 text-ink hover:text-ink">
          <p className="m-0 truncate text-[15px] font-semibold">{matchup(game)}</p>
          <p className="m-0 mt-0.5 text-[12px] text-sub">{gameWhen(game.starts_at)}</p>
        </Link>
        <Switch on={alert.active} onChange={(v) => void setAlertActive(alert.id, v)} label={`${alert.active ? 'Pause' : 'Turn on'} alert for ${matchup(game)}`} />
      </div>
      <div className="mt-3 flex items-baseline justify-between text-[13px] text-sub">
        <span>{target != null ? <>Target <strong className="font-bold text-ink">{money(target)}</strong></> : <>Alert on <strong className="font-bold text-ink">Buy now only</strong></>}</span>
        <span>Now <strong className="font-bold text-ink">{money(price)}</strong></span>
      </div>
      {target != null && (
        <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-inset">
          <div className="h-1.5 rounded-full" style={{ width: `${progress}%`, background: style.line }} />
        </div>
      )}
      <div className="mt-2.5 flex items-center justify-between">
        <span className={`text-[12px] font-semibold ${noteColor}`}>{note}</span>
        <Link to={`/game/${game.game_id}/alert`} className="flex min-h-8 items-center text-[13px] font-semibold">Edit</Link>
      </div>
    </div>
  )
}

export function AlertsScreen() {
  const { alerts, events, gameById, signedIn, openSignIn, ready } = useStore()
  const live = alerts.map((a) => ({ a, g: gameById(a.game_id) })).filter((x): x is { a: Alert; g: Game } => !!x.g)
  const ready_ = events.map((e) => ({ e, g: gameById(e.game_id) })).filter((x): x is { e: AlertEvent; g: Game } => !!x.g).slice(0, 3)
  const on = live.filter((x) => x.a.active).length
  const sub = `${on} alert${on === 1 ? '' : 's'} on${ready_.length ? `, ${ready_.length} ready` : ''}`

  return (
    <Screen>
      <div className="flex items-end justify-between">
        <PageTitle sub={signedIn && ready ? sub : undefined}>Alerts</PageTitle>
        {signedIn && (
          <Link to="/explore" className="glass flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold text-ink">
            <Plus size={16} strokeWidth={2.2} aria-hidden="true" />New alert
          </Link>
        )}
      </div>

      {!signedIn ? (
        <div className="glass flex flex-col gap-3 rounded-[22px] p-5">
          <p className="m-0 text-[17px] font-bold">Hear when it's time to buy</p>
          <p className="m-0 text-[14px] leading-[1.5] text-sub">Set a target price on any game and Tixcast tells you when it gets there, or when it says Buy now.</p>
          <PrimaryButton onClick={() => openSignIn('Sign in to set price alerts on any LA home game.')}>Sign in to set alerts</PrimaryButton>
        </div>
      ) : (
        <>
          {ready_.map(({ e, g }) => <ReadyCard key={e.id} event={e} game={g} />)}
          <section aria-labelledby="active-title" className="flex flex-col gap-2.5">
            <h2 id="active-title" className="m-0 text-[17px] font-bold">Watching for a price</h2>
            {live.length ? (
              live.map(({ a, g }) => <AlertCard key={a.id} alert={a} game={g} />)
            ) : (
              <div className="glass rounded-2xl p-5">
                <p className="m-0 text-[15px] font-semibold">No alerts yet</p>
                <p className="m-0 mt-1 text-[14px] leading-[1.5] text-sub">Open any game and tap Alert me. We'll watch the price for you.</p>
                <Link to="/explore" className="mt-3 inline-block text-[14px] font-semibold">Find a game</Link>
              </div>
            )}
          </section>
        </>
      )}
    </Screen>
  )
}
