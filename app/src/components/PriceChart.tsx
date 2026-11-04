import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { money } from '@/lib/format'
import type { Game } from '@/lib/types'
import { VERDICT_STYLE } from '@/lib/verdict'

const TOP = 18

const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric' })
const tipFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export type ChartRange = 7 | 30 | 0

/**
 * Price history (left 60%) and the forecast band to tip-off (right 40%).
 * Drawn at the container's real pixel width so labels stay 11px at any size.
 */
export function PriceChart({ game, range, height = 150, className = 'mt-[18px]' }: { game: Game; range: ChartRange; height?: number; className?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const [W, setW] = useState(350)
  const wrap = useRef<HTMLDivElement>(null)
  const style = VERDICT_STYLE[game.verdict]
  const H = height
  const BOTTOM = H - 22
  const TODAY_X = Math.round(W * 0.6)

  useEffect(() => {
    const el = wrap.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setW(Math.max(240, Math.round(entry.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const model = useMemo(() => {
    const cutoff = range ? Date.now() - range * 86400_000 : 0
    const pts = game.history.filter((p) => new Date(p.t).getTime() >= cutoff)
    if (pts.length < 2) return null
    const t0 = new Date(pts[0].t).getTime()
    const t1 = new Date(pts[pts.length - 1].t).getTime()
    const values = pts.map((p) => p.p)
    const extra = [game.range_low, game.range_high].filter((v): v is number => v != null)
    let lo = Math.min(...values, ...extra)
    let hi = Math.max(...values, ...extra)
    const pad = (hi - lo) * 0.12 || hi * 0.1 || 5
    lo = Math.max(0, lo - pad)
    hi += pad
    const y = (v: number) => TOP + (1 - (v - lo) / (hi - lo)) * (BOTTOM - TOP)
    const x = (t: number) => (t1 === t0 ? TODAY_X : ((t - t0) / (t1 - t0)) * TODAY_X)
    const xy = pts.map((p) => ({ x: x(new Date(p.t).getTime()), y: y(p.p), p: p.p, t: p.t }))
    const last = xy[xy.length - 1]
    let band: string | null = null
    let forecast: string | null = null
    if (game.range_low != null) {
      const yl = y(game.range_low)
      const yh = y(game.range_high ?? game.range_low)
      band = `${last.x},${last.y} ${W},${Math.min(yl, yh)} ${W},${Math.max(yl, yh)}`
      forecast = `${last.x},${last.y} ${W},${(yl + yh) / 2}`
    }
    const grid = [0.25, 0.75].map((f) => {
      const v = hi - (hi - lo) * f
      return { y: y(v), label: money(v) }
    })
    return { xy, last, band, forecast, grid, start: pts[0].t }
  }, [game, range, W, BOTTOM, TODAY_X])

  if (!model) {
    return (
      <div ref={wrap} style={{ height }} className={`${className} flex items-center justify-center rounded-2xl bg-inset px-6 text-center text-[13px] text-sub`}>
        The price chart fills in once Tixcast has a few days of listings for this game.
      </div>
    )
  }

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    if (px > TODAY_X + 6) return setHover(null)
    let best = 0
    model.xy.forEach((pt, i) => { if (Math.abs(pt.x - px) < Math.abs(model.xy[best].x - px)) best = i })
    setHover(best)
  }
  const h = hover != null ? model.xy[hover] : null
  const tipX = h ? Math.min(Math.max(h.x, 40), W - 40) : 0

  return (
    <div ref={wrap} className={className}>
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      className="block touch-pan-y select-none"
      role="img"
      aria-label={`Cheapest ticket price history, now ${money(game.price_now)}${game.range_low != null ? `, ${game.range_label?.toLowerCase()} ${money(game.range_low)} to ${money(game.range_high)}` : ''}`}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
    >
      {model.grid.map((g) => (
        <g key={g.y}>
          <line x1="0" y1={g.y} x2={W} y2={g.y} stroke="#22304D" strokeWidth="1" />
          <text x={W} y={g.y - 4} textAnchor="end" fontSize="10" fill="#8E9AB5" fontFamily="Public Sans, sans-serif">{g.label}</text>
        </g>
      ))}
      {model.band && <polygon points={model.band} fill={style.band} />}
      <polyline points={model.xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke="#F4F6FA" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {model.forecast && <polyline points={model.forecast} fill="none" stroke={style.line} strokeWidth="2.5" strokeDasharray="6 5" strokeLinecap="round" />}
      <line x1={TODAY_X} y1={TOP - 4} x2={TODAY_X} y2={BOTTOM + 4} stroke="#3A4A6E" strokeWidth="1" strokeDasharray="2 3" />
      <circle cx={model.last.x} cy={model.last.y} r="5" fill="#F4F6FA" stroke="#16213A" strokeWidth="2" />
      <text x={TODAY_X} y="10" textAnchor="middle" fontSize="11" fill="#A9B4CC" fontFamily="Public Sans, sans-serif">Today</text>
      <text x="0" y={H - 4} fontSize="11" fill="#8E9AB5" fontFamily="Public Sans, sans-serif">{dayFmt.format(new Date(model.start))}</text>
      <text x={W} y={H - 4} textAnchor="end" fontSize="11" fill="#8E9AB5" fontFamily="Public Sans, sans-serif">Tip-off {tipFmt.format(new Date(game.starts_at)).split(', ')[0]}</text>
      {h && (
        <g pointerEvents="none">
          <line x1={h.x} y1={TOP - 4} x2={h.x} y2={BOTTOM} stroke="#F4F6FA" strokeOpacity="0.35" />
          <circle cx={h.x} cy={h.y} r="4.5" fill="#16213A" stroke="#F4F6FA" strokeWidth="2" />
          <rect x={tipX - 40} y={Math.max(0, h.y - 34)} width="80" height="24" rx="8" fill="#F4F6FA" />
          <text x={tipX} y={Math.max(0, h.y - 34) + 16} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0E1626" fontFamily="Public Sans, sans-serif">
            {dayFmt.format(new Date(h.t))}: {money(h.p)}
          </text>
        </g>
      )}
    </svg>
    </div>
  )
}
