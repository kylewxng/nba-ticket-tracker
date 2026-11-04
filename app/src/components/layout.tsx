import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Bell, Home, Search, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { to: '/', label: 'Home', Icon: Home, end: true },
  { to: '/explore', label: 'Explore', Icon: Search, end: false },
  { to: '/alerts', label: 'Alerts', Icon: Bell, end: false },
  { to: '/profile', label: 'Profile', Icon: User, end: false },
]

export function TabBar({ badge }: { badge?: boolean }) {
  return (
    <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[440px] px-5 safe-bottom">
      <div className="glass pointer-events-auto flex gap-1 rounded-[32px] p-1.5 shadow-[0_10px_30px_rgba(28,58,112,0.12)]">
        {TABS.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'relative flex h-12 items-center justify-center gap-1.5 rounded-full text-[13px] font-bold transition-[flex-grow,background-color] duration-200',
                isActive ? 'glacier flex-[1.6] shadow-[0_6px_16px_rgba(76,166,226,0.35)]' : 'flex-1 text-[#6A7A95] hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={22} strokeWidth={1.9} aria-hidden="true" />
                {isActive ? label : <span className="sr-only-safe">{label}</span>}
                {badge && label === 'Alerts' && !isActive && (
                  <span aria-hidden="true" className="absolute right-[calc(50%-16px)] top-2.5 h-2 w-2 rounded-full bg-glacier ring-2 ring-white" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

/** A tab screen: phone-width column, top padding for the status bar, room for the tab bar. */
export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn('mx-auto flex w-full max-w-[440px] flex-col gap-5 px-5 pb-[120px] pt-[max(24px,env(safe-area-inset-top))]', className)}>
      {children}
    </main>
  )
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <h1 className="font-display m-0 text-[40px] font-extrabold leading-none">{children}</h1>
      {sub && <p className="mt-1.5 text-[14px] text-sub">{sub}</p>}
    </div>
  )
}
