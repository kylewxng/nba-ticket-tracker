import { useEffect, useMemo, useState } from 'react'
import { PrimaryButton, Sheet, Switch } from '@/components/kit'
import { money } from '@/lib/format'
import { useStore } from '@/lib/store'
import { matchup } from '@/lib/teams'
import type { Alert, Game } from '@/lib/types'
import { cn } from '@/lib/utils'
import { chanceToHit, defaultTarget, presetTargets } from '@/lib/verdict'

function initialTarget(game: Game, alert?: Alert): number {
  if (alert?.target_price != null) return Math.round(alert.target_price)
  return defaultTarget(game)
}

export function AlertSheet({ game, open, onClose }: { game: Game; open: boolean; onClose: () => void }) {
  const { alertFor, saveAlert, deleteAlert, profile } = useStore()
  const existing = alertFor(game.game_id)
  const price = game.price_now
  const [target, setTarget] = useState(() => initialTarget(game, existing))
  const [onBuy, setOnBuy] = useState(existing?.on_buy_signal ?? true)
  const [channel, setChannel] = useState<'push' | 'email'>(existing?.channel ?? (profile.notify_push ? 'push' : 'email'))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setTarget(initialTarget(game, existing))
    setOnBuy(existing?.on_buy_signal ?? true)
    setChannel(existing?.channel ?? (profile.notify_push ? 'push' : 'email'))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const min = price != null ? Math.max(5, Math.floor(price * 0.6)) : 0
  const max = price != null ? Math.round(price) : 0
  const chance = price != null ? chanceToHit(game, target) : 0
  const presets = useMemo(() => (price != null ? presetTargets(game) : []), [game, price])
  const chanceTone = chance >= 50 ? 'text-[#9CC4FF]' : chance >= 20 ? 'text-[#E3B87C]' : 'text-danger'

  const onSave = async () => {
    setSaving(true)
    const ok = await saveAlert({ game_id: game.game_id, target_price: price != null ? target : null, on_buy_signal: price != null ? onBuy : true, channel })
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? 'Edit price alert' : 'Set a price alert'}
      description={`${matchup(game)}, ${profile.ticket_count} ticket${profile.ticket_count === 1 ? '' : 's'}`}
    >
      <div className="flex flex-col gap-[18px] pb-2">
        {price != null ? (
          <>
            <div className="rounded-[18px] bg-inset p-4">
              <p className="m-0 text-[13px] text-sub">Tell me when the cheapest ticket is at or below</p>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="font-display tabular text-[64px] font-black leading-none">{money(target)}</span>
                <span className="text-[13px] text-sub">Now {money(price)}</span>
              </div>
              <label htmlFor="target" className="sr-only-safe">Target price</label>
              <input
                id="target"
                type="range"
                min={min}
                max={max}
                step={1}
                value={Math.min(Math.max(target, min), max)}
                onChange={(e) => setTarget(Number(e.target.value))}
                className="mt-2.5 w-full accent-[#7FB2FF]"
              />
              <p className={cn('m-0 mt-2 text-[13px] font-semibold', chanceTone)}>
                {target >= price ? "It's already at this price. You'll hear right away." : `About a ${chance}% chance it gets there before tip-off`}
              </p>
            </div>

            <div role="group" aria-label="Quick targets" className="grid grid-cols-3 gap-2">
              {presets.map((p) => {
                const on = p.value === target
                return (
                  <button
                    key={p.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTarget(p.value)}
                    className={cn('flex h-12 flex-col items-center justify-center rounded-[14px] border leading-[1.15]', on ? 'border-[#7FB2FF] bg-[#233A63]' : 'border-[#2A3858] bg-[#0E1626]')}
                  >
                    <span className="text-[15px] font-bold">{money(p.value)}</span>
                    <span className="text-[11px] text-sub">{p.note}</span>
                  </button>
                )
              })}
            </div>

            <div className="flex items-center justify-between gap-3 py-1">
              <div>
                <p className="m-0 text-[15px] font-semibold">Also tell me when Tixcast says Buy now</p>
                <p className="m-0 mt-0.5 text-[13px] text-sub">Even if it's above your target</p>
              </div>
              <Switch on={onBuy} onChange={setOnBuy} label="Alert when Tixcast says Buy now" />
            </div>
          </>
        ) : (
          <p className="m-0 rounded-[18px] bg-inset p-4 text-[14px] leading-[1.5] text-sub">
            This game has no resale listings yet. We'll tell you once prices show up and Tixcast says Buy now.
          </p>
        )}

        <div>
          <p className="m-0 mb-2 text-[13px] text-sub">Send it by</p>
          <div role="group" aria-label="Alert channel" className="grid grid-cols-2 gap-1.5 rounded-[14px] bg-inset p-1">
            {([['push', 'Notification'], ['email', 'Email']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={channel === id}
                onClick={() => setChannel(id)}
                className={cn('h-10 rounded-[10px] text-[14px] font-semibold', channel === id ? 'bg-[#1E2B48] text-ink' : 'text-sub')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <PrimaryButton onClick={() => void onSave()} disabled={saving}>{saving ? 'Saving…' : existing ? 'Update alert' : 'Save alert'}</PrimaryButton>
        {existing && (
          <button type="button" onClick={() => { void deleteAlert(existing.id); onClose() }} className="h-11 text-[15px] font-semibold text-danger">
            Delete alert
          </button>
        )}
      </div>
    </Sheet>
  )
}
