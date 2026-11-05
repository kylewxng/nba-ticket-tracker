import { teamName } from '@/lib/teams'
import type { Game } from '@/lib/types'
import { cn } from '@/lib/utils'

function rest(days: number | null | undefined, b2b: boolean | null | undefined): { text: string; flag: boolean } {
  if (b2b) return { text: 'Back-to-back', flag: true }
  if (days == null) return { text: '—', flag: false }
  if (days >= 10) return { text: 'Rested', flag: false }
  const d = Math.max(0, Math.round(days - 1))
  return { text: d === 0 ? 'No rest days' : `${d} day${d === 1 ? '' : 's'} off`, flag: false }
}

/** Records, rest and TV for both teams: the context fans weigh before buying. */
export function GameDay({ game, className }: { game: Game; className?: string }) {
  const hasContext = game.home_record != null || game.away_record != null || game.home_rest_days != null
  if (!hasContext && !game.national_tv) return null
  const away = rest(game.away_rest_days, game.away_back_to_back)
  const home = rest(game.home_rest_days, game.home_back_to_back)
  const rows: [string, { text: string; flag?: boolean }, { text: string; flag?: boolean }][] = [
    ['Record', { text: game.away_record ?? '—' }, { text: game.home_record ?? '—' }],
    ['Rest', away, home],
  ]
  return (
    <div className={cn('overflow-hidden', className)}>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="text-[12px] text-sub">
            <th scope="col" className="w-[34%] pb-2 font-semibold"><span className="sr-only-safe">Detail</span></th>
            <th scope="col" className="pb-2 font-semibold">{teamName(game.away_tricode)}</th>
            <th scope="col" className="pb-2 font-semibold">{teamName(game.home_tricode)}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, a, h]) => (
            <tr key={label} className="border-t border-[#22304D]">
              <th scope="row" className="py-2.5 text-[13px] font-normal text-sub">{label}</th>
              {[a, h].map((v, i) => (
                <td key={i} className={cn('tabular py-2.5 text-[15px] font-semibold', v.flag && 'text-[#E3B87C]')}>{v.text}</td>
              ))}
            </tr>
          ))}
          <tr className="border-t border-[#22304D]">
            <th scope="row" className="py-2.5 text-[13px] font-normal text-sub">On TV</th>
            <td colSpan={2} className="py-2.5 text-[15px] font-semibold">{game.national_tv ? game.national_tv.split(',').map((s) => s.trim()).join(' and ') : 'Local broadcast'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

/** Shown while a game has no call yet: the one useful action is to watch it. */
export function NoCallYet({ watching, onWatch, compact }: { watching: boolean; onWatch: () => void; compact?: boolean }) {
  return (
    <div className={cn('rounded-2xl border border-[#22304D] bg-[#0E1626]', compact ? 'p-4' : 'p-5')}>
      <p className="m-0 text-[15px] font-semibold">{watching ? "You're watching this game" : 'No call yet'}</p>
      <p className="m-0 mt-1 text-[13px] leading-[1.5] text-sub">
        {watching
          ? "We'll tell you the moment Tixcast has its first Buy now or Wait call."
          : 'Tixcast needs a few days of resale prices first. Watch this game and we’ll tell you the moment its first call is ready.'}
      </p>
      {!watching && (
        <button type="button" onClick={onWatch} className="primary-fill mt-3.5 h-10 rounded-xl px-4 text-[14px] font-bold">
          Tell me when it's ready
        </button>
      )}
    </div>
  )
}
