import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { PrimaryButton, VerdictPill } from '@/components/kit'
import { gameWhen, money } from '@/lib/format'
import { useStore } from '@/lib/store'
import { matchup } from '@/lib/teams'
import { cn } from '@/lib/utils'
import { bestCall } from '@/lib/verdict'
import { Logo } from '@/components/Logo'

const CHOICES = [
  { id: 'LAL', label: 'Lakers', teams: ['LAL'] },
  { id: 'LAC', label: 'Clippers', teams: ['LAC'] },
  { id: 'both', label: 'Both', teams: ['LAL', 'LAC'] },
]

/** One screen, no account: pick a team and a ticket count, then straight to real calls. */
export function Onboarding() {
  const { games, finishOnboarding } = useStore()
  const [choice, setChoice] = useState('both')
  const [count, setCount] = useState(2)
  const teams = CHOICES.find((c) => c.id === choice)!.teams
  const preview = bestCall((games ?? []).filter((g) => teams.includes(g.home_tricode)))

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(28px,env(safe-area-inset-top))] md:max-w-[560px] lg:grid lg:max-w-[1080px] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:gap-16 lg:px-10">
      <div className="flex flex-col">
      <Logo height={26} />
      <h1 className="font-display m-0 mt-8 text-[52px] font-black leading-[0.92] lg:mt-14 lg:text-[88px]">Buy now<br />or wait?</h1>
      <p className="m-0 mt-3 max-w-[32ch] text-[16px] leading-[1.5] text-sub">
        Tixcast watches resale prices for every LA home game and tells you when to buy.
      </p>

      {preview && preview.price_now != null && (
        <div className="glass mt-6 flex items-center gap-3 rounded-2xl p-3.5" aria-label="Example call">
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-[15px] font-semibold">{matchup(preview)}</p>
            <p className="m-0 mt-0.5 text-[12px] text-sub">{gameWhen(preview.starts_at)}</p>
          </div>
          <div className="text-right">
            <div className="font-display tabular text-[24px] font-extrabold leading-none">{money(preview.price_now)}</div>
            <VerdictPill verdict={preview.verdict} className="mt-1" />
          </div>
        </div>
      )}

      </div>
      <div className="flex flex-1 flex-col lg:glass lg:flex-none lg:rounded-[28px] lg:p-8">
      <fieldset className="m-0 mt-8 border-0 p-0 lg:mt-0">
        <legend className="mb-2.5 p-0 text-[15px] font-bold">Whose games do you go to?</legend>
        <div className="grid grid-cols-3 gap-2">
          {CHOICES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={choice === c.id}
              onClick={() => setChoice(c.id)}
              className={cn('h-14 rounded-2xl border text-[15px] font-bold transition-colors', choice === c.id ? 'glacier border-transparent' : 'border-[#2A3858] bg-[#16213A] text-ink')}
            >
              {c.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-6 flex items-center justify-between">
        <span id="count-label" className="text-[15px] font-bold">How many tickets do you usually buy?</span>
      </div>
      <div className="glass mt-2.5 flex items-center justify-between rounded-2xl p-2" role="group" aria-labelledby="count-label">
        <button type="button" aria-label="Fewer tickets" disabled={count <= 1} onClick={() => setCount((c) => c - 1)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-inset disabled:opacity-40">
          <Minus size={18} aria-hidden="true" />
        </button>
        <span className="font-display tabular text-[30px] font-extrabold" aria-live="polite">{count}</span>
        <button type="button" aria-label="More tickets" disabled={count >= 8} onClick={() => setCount((c) => c + 1)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-inset disabled:opacity-40">
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-auto pt-8">
        <PrimaryButton onClick={() => finishOnboarding(teams, count)}>Show my games</PrimaryButton>
        <p className="m-0 mt-3 text-center text-[12px] text-faint">No account needed to look around.</p>
      </div>
      </div>
    </main>
  )
}
