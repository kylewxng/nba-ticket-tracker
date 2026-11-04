import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Bell, Home, Search, User } from 'lucide-react'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

const TABS = [
  { to: '/', label: 'Home', Icon: Home, end: true },
  { to: '/explore', label: 'Explore', Icon: Search, end: false },
  { to: '/alerts', label: 'Alerts', Icon: Bell, end: false },
  { to: '/profile', label: 'Profile', Icon: User, end: false },
]

export function TabBar({ badge }: { badge?: boolean }) {
  return (
    <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[440px] px-5 safe-bottom md:max-w-[520px] lg:hidden">
      <div className="glass pointer-events-auto flex gap-1 rounded-[32px] p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
        {TABS.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'relative flex h-12 items-center justify-center gap-1.5 rounded-full text-[13px] font-bold transition-[flex-grow,background-color] duration-200',
                isActive ? 'nav-on flex-[1.6]' : 'flex-1 text-[#8E9AB5] hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={22} strokeWidth={1.9} aria-hidden="true" />
                {isActive ? label : <span className="sr-only-safe">{label}</span>}
                {badge && label === 'Alerts' && !isActive && (
                  <span aria-hidden="true" className="absolute right-[calc(50%-16px)] top-2.5 h-2 w-2 rounded-full bg-[#FF6B47] ring-2 ring-[#16213A]" />
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
    <main className={cn('mx-auto flex w-full max-w-[440px] flex-col gap-5 px-5 pb-[120px] pt-[max(24px,env(safe-area-inset-top))] md:max-w-[760px] md:px-8 lg:max-w-[1120px] lg:px-10 lg:pb-16 lg:pt-10', className)}>
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

/** Desktop navigation: a fixed left rail. Hidden below 1024px, where the tab bar takes over. */
export function SideNav() {
  const { events, profile, email, signedIn, demo } = useStore()
  const name = demo ? 'Demo mode' : signedIn ? profile.display_name || email || 'You' : 'Not signed in'
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-[#22304D] bg-[#111B2E] px-4 py-7 lg:flex">
      <NavLink to="/" className="px-3 text-ink hover:text-ink">
        <span className="font-display text-[30px] font-black tracking-[0.01em]">Tix<span className="text-[#FF6B47]">cast</span></span>
      </NavLink>
      <nav aria-label="Main" className="mt-8 flex flex-col gap-1">
        {TABS.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn('flex h-12 items-center gap-3 rounded-2xl px-3.5 text-[15px] font-semibold', isActive ? 'nav-on' : 'text-[#8E9AB5] hover:bg-[#16213A] hover:text-ink')
            }
          >
            <Icon size={20} strokeWidth={1.9} aria-hidden="true" />
            {label}
            {label === 'Alerts' && events.length > 0 && (
              <span className="ml-auto rounded-full bg-[#FF6B47] px-2 text-[12px] font-bold text-[#1A0E0A]">{events.length}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto rounded-2xl bg-[#16213A] p-3.5">
        <p className="m-0 truncate text-[14px] font-semibold">{name}</p>
        <p className="m-0 mt-0.5 text-[12px] text-sub">{profile.teams.map((t) => (t === 'LAL' ? 'Lakers' : 'Clippers')).join(' and ')}, {profile.ticket_count} ticket{profile.ticket_count === 1 ? '' : 's'}</p>
      </div>
    </aside>
  )
}
