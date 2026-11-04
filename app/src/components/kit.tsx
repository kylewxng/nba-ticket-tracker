import type { ReactNode } from 'react'
import { Drawer } from 'vaul'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useDesktop } from '@/lib/useDesktop'
import { Link } from 'react-router-dom'
import { Bell, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VERDICT_LABEL, VERDICT_STYLE } from '@/lib/verdict'
import type { Verdict } from '@/lib/types'

export function VerdictPill({ verdict, size = 'sm', className }: { verdict: Verdict; size?: 'sm' | 'lg'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md font-bold',
        size === 'sm' ? 'px-[7px] py-[2px] text-[11px]' : 'font-display px-3 py-1 text-[18px] font-extrabold tracking-[0.03em]',
        VERDICT_STYLE[verdict].pill,
        className,
      )}
    >
      {size === 'lg' ? VERDICT_LABEL[verdict].toUpperCase() : VERDICT_LABEL[verdict]}
    </span>
  )
}

export function TeamStack({ away, home, size = 48 }: { away: string; home: string; size?: number }) {
  const s = { width: size, height: size, fontSize: size > 40 ? 13 : 11 }
  return (
    <div className="flex flex-none" aria-hidden="true">
      <span style={s} className="flex items-center justify-center rounded-full border-2 border-[#0E1626] bg-[#1E2B48] font-bold text-[#C9D2E3]">{away}</span>
      <span style={{ ...s, marginLeft: -size * 0.2 }} className="flex items-center justify-center rounded-full border-2 border-[#0E1626] bg-[#2A3858] font-bold text-ink">{home}</span>
    </div>
  )
}

export function Sparkline({ values, color, width = 44, height = 24, stroke = 2 }: { values: number[]; color: string; width?: number; height?: number; stroke?: number }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden="true" />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(stroke + (1 - (v - min) / span) * (height - stroke * 2)).toFixed(1)}`)
    .join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="flex-none overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        'flex h-8 w-[52px] flex-none rounded-full p-[3px] transition-colors disabled:opacity-50',
        on ? 'justify-end bg-glacier' : 'justify-start bg-[#2A3858]',
      )}
    >
      <span className="block h-[26px] w-[26px] rounded-full bg-white shadow-[0_1px_3px_rgba(15,27,51,0.25)]" />
    </button>
  )
}

export function IconButton({ label, onClick, to, children, className }: { label: string; onClick?: () => void; to?: string; children: ReactNode; className?: string }) {
  const cls = cn('glass flex h-11 w-11 flex-none items-center justify-center rounded-full text-ink', className)
  if (to) return <Link to={to} aria-label={label} className={cls}>{children}</Link>
  return <button type="button" aria-label={label} onClick={onClick} className={cls}>{children}</button>
}

export function BackButton({ to = '/' }: { to?: string }) {
  return (
    <IconButton label="Back" to={to}>
      <ChevronLeft size={20} strokeWidth={2} />
    </IconButton>
  )
}

export function BellButton({ unread }: { unread: boolean }) {
  return (
    <Link to="/alerts" aria-label={unread ? 'Your alerts, new alert ready' : 'Your alerts'} className="glass relative flex h-11 w-11 items-center justify-center rounded-full text-ink">
      <Bell size={20} strokeWidth={1.8} />
      {unread && <span className="absolute right-[11px] top-[10px] h-2.5 w-2.5 rounded-full border-2 border-[#16213A] bg-[#FF6B47]" />}
    </Link>
  )
}

export function Sheet({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: ReactNode }) {
  const desktop = useDesktop()
  if (desktop) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(6,10,20,0.66)] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[88dvh] w-[min(520px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[20px] border border-[#22304D] bg-[#16213A] shadow-[0_30px_80px_rgba(0,0,0,0.5)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]">
            <div className="flex items-start justify-between gap-4 border-b border-[#22304D] px-7 pb-5 pt-6">
              <div>
                <Dialog.Title className="font-display m-0 text-[28px] font-extrabold leading-none">{title}</Dialog.Title>
                {description ? (
                  <Dialog.Description className="m-0 mt-1.5 text-[13px] text-sub">{description}</Dialog.Description>
                ) : (
                  <Dialog.Description className="sr-only-safe">{title}</Dialog.Description>
                )}
              </div>
              <Dialog.Close aria-label="Close" className="-mr-2 flex h-9 w-9 flex-none items-center justify-center rounded-full text-sub hover:bg-[#1E2B48] hover:text-ink">
                <X size={18} strokeWidth={2} />
              </Dialog.Close>
            </div>
            <div className="overflow-y-auto px-7 pb-3 pt-5">{children}</div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    )
  }
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-[rgba(6,10,20,0.6)] backdrop-blur-[2px]" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-[440px] flex-col rounded-t-[28px] bg-[#16213A] outline-none md:max-w-[520px]">
          <div aria-hidden="true" className="mx-auto mt-2.5 h-[5px] w-10 flex-none rounded-full bg-[#3A4A6E]" />
          <div className="safe-bottom overflow-y-auto px-5 pt-4">
            <Drawer.Title className="font-display text-[30px] font-extrabold leading-none">{title}</Drawer.Title>
            {description ? (
              <Drawer.Description className="mt-1.5 text-[13px] text-sub">{description}</Drawer.Description>
            ) : (
              <Drawer.Description className="sr-only-safe">{title}</Drawer.Description>
            )}
            <div className="mt-[18px]">{children}</div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

export function PrimaryButton({ children, onClick, type = 'button', disabled, className }: { children: ReactNode; onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean; className?: string }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn('primary-fill flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-bold transition-transform active:scale-[0.99] disabled:opacity-60', className)}
    >
      {children}
    </button>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="m-0 text-[17px] font-bold">{children}</h2>
      {action}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-[#16213A]', className)} />
}
